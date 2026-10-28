//! Instalar y actualizar yt-dlp desde sus releases oficiales de GitHub.
//!
//! - Solo la API pública de GitHub y los archivos publicados por yt-dlp.
//! - Cada binario se verifica con el SHA-256 de `SHA2-256SUMS` antes de usarlo,
//!   y se prueba (`--version`) antes de sustituir al actual.
//! - El anterior se guarda como `yt-dlp.prev` para poder volver atrás.
//!
//! `ALFORJA_RELEASES_URL` cambia el origen (para las pruebas, con un
//! servidor local que imita la respuesta de GitHub).

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::models::*;

pub const GITHUB_LATEST: &str = "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest";
/// Un binario de yt-dlp ronda los 35 MB; más de esto no es un yt-dlp.
const MAX_BINARY: u64 = 200 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub struct Release {
    pub version: String,
    pub asset_url: String,
    pub sums_url: String,
}

#[derive(Deserialize)]
struct GhRelease {
    tag_name: String,
    assets: Vec<GhAsset>,
}

#[derive(Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
}

/// El ejecutable autónomo de yt-dlp para este sistema (no necesita Python).
pub fn asset_name() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Some("yt-dlp.exe"),
        ("windows", "x86") => Some("yt-dlp_x86.exe"),
        ("windows", "aarch64") => Some("yt-dlp_arm64.exe"),
        ("macos", _) => Some("yt-dlp_macos"),
        ("linux", "x86_64") => Some("yt-dlp_linux"),
        ("linux", "aarch64") => Some("yt-dlp_linux_aarch64"),
        ("linux", "arm") => Some("yt-dlp_linux_armv7l"),
        _ => None,
    }
}

pub fn binary_name() -> &'static str {
    if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" }
}

/// "2026.10.21" < "2026.10.21.1" < "2026.11.02". Lo que no sea número cuenta como 0.
pub fn newer(candidate: &str, current: &str) -> bool {
    let parse = |v: &str| -> Vec<u64> { v.trim().split('.').map(|p| p.parse().unwrap_or(0)).collect() };
    let (a, b) = (parse(candidate), parse(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

/// La línea de `SHA2-256SUMS` para un archivo: "<hex>  <nombre>".
pub fn expected_hash(sums: &str, asset: &str) -> Option<String> {
    sums.lines().find_map(|l| {
        let mut it = l.split_whitespace();
        let (hash, name) = (it.next()?, it.next()?);
        (name.trim_start_matches('*') == asset && hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit())).then(|| hash.to_lowercase())
    })
}

pub struct Updater {
    pub api_url: String,
    pub bin_dir: PathBuf,
    client: reqwest::Client,
}

fn net_err(e: reqwest::Error) -> AppError {
    AppError::new("update_network", format!("No se pudo conectar con GitHub para actualizar el motor: {e}"))
}

impl Updater {
    pub fn new(bin_dir: PathBuf) -> Updater {
        let api_url = std::env::var("ALFORJA_RELEASES_URL").unwrap_or_else(|_| GITHUB_LATEST.to_string());
        let client = reqwest::Client::builder()
            .user_agent(concat!("alforja/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(300))
            .build()
            .expect("cliente HTTP");
        Updater { api_url, bin_dir, client }
    }

    pub fn current_path(&self) -> PathBuf {
        self.bin_dir.join(binary_name())
    }

    pub fn prev_path(&self) -> PathBuf {
        self.bin_dir.join(format!("{}.prev", binary_name()))
    }

    pub fn can_rollback(&self) -> bool {
        self.prev_path().is_file()
    }

    pub async fn latest(&self) -> AppResult<Release> {
        let asset = asset_name().ok_or_else(|| AppError::new("update_unsupported", "No hay un yt-dlp oficial para este sistema; instálalo a mano."))?;
        let r = self.client.get(&self.api_url).header("Accept", "application/vnd.github+json").send().await.map_err(net_err)?;
        if r.status() == reqwest::StatusCode::FORBIDDEN || r.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AppError::new("update_rate_limited", "GitHub limita las consultas sin cuenta (60 por hora). Prueba más tarde."));
        }
        let rel: GhRelease = r.error_for_status().map_err(net_err)?.json().await.map_err(net_err)?;
        let find = |name: &str| rel.assets.iter().find(|a| a.name == name).map(|a| a.browser_download_url.clone());
        Ok(Release {
            version: rel.tag_name.trim_start_matches('v').to_string(),
            asset_url: find(asset).ok_or_else(|| AppError::new("update_missing_asset", format!("La versión {} no trae {asset}.", rel.tag_name)))?,
            sums_url: find("SHA2-256SUMS").ok_or_else(|| AppError::new("update_missing_asset", "La versión no trae SHA2-256SUMS: no se puede verificar."))?,
        })
    }

    /// Descarga, verifica, prueba y sustituye. Devuelve la versión instalada.
    pub async fn install(&self, rel: &Release) -> AppResult<String> {
        let asset = asset_name().expect("comprobado en latest()");
        let sums = self.client.get(&rel.sums_url).send().await.map_err(net_err)?.error_for_status().map_err(net_err)?.text().await.map_err(net_err)?;
        let expected = expected_hash(&sums, asset).ok_or_else(|| AppError::new("update_unverified", format!("SHA2-256SUMS no tiene la suma de {asset}: no se instala.")))?;

        let r = self.client.get(&rel.asset_url).send().await.map_err(net_err)?.error_for_status().map_err(net_err)?;
        if r.content_length().map_or(false, |n| n > MAX_BINARY) {
            return Err(AppError::new("update_unverified", "El archivo es demasiado grande para ser yt-dlp."));
        }
        let bytes = r.bytes().await.map_err(net_err)?;
        if bytes.len() as u64 > MAX_BINARY {
            return Err(AppError::new("update_unverified", "El archivo es demasiado grande para ser yt-dlp."));
        }
        let got = format!("{:x}", Sha256::digest(&bytes));
        if got != expected {
            return Err(AppError::new("update_unverified", "La suma SHA-256 no coincide: el archivo descargado no es el publicado. No se instala."));
        }

        std::fs::create_dir_all(&self.bin_dir).map_err(io_err)?;
        let new = self.bin_dir.join(format!("{}.new", binary_name()));
        std::fs::write(&new, &bytes).map_err(io_err)?;
        make_executable(&new)?;

        let version = match probe(&new).await {
            Some(v) => v,
            None => {
                let _ = std::fs::remove_file(&new);
                return Err(AppError::new("update_broken", "La versión nueva no arranca en este equipo. Se mantiene la actual."));
            }
        };

        let cur = self.current_path();
        if cur.is_file() {
            std::fs::rename(&cur, self.prev_path()).map_err(io_err)?;
        }
        if let Err(e) = std::fs::rename(&new, &cur) {
            // Deja todo como estaba.
            if self.prev_path().is_file() {
                let _ = std::fs::rename(self.prev_path(), &cur);
            }
            return Err(io_err(e));
        }
        Ok(version)
    }

    /// Vuelve a la versión anterior (la actual pasa a ser la "anterior").
    pub fn rollback(&self) -> AppResult<()> {
        let (cur, prev) = (self.current_path(), self.prev_path());
        if !prev.is_file() {
            return Err(AppError::new("no_previous", "No hay una versión anterior guardada."));
        }
        let tmp = self.bin_dir.join(format!("{}.swap", binary_name()));
        if cur.is_file() {
            std::fs::rename(&cur, &tmp).map_err(io_err)?;
        }
        std::fs::rename(&prev, &cur).map_err(io_err)?;
        if tmp.is_file() {
            std::fs::rename(&tmp, &prev).map_err(io_err)?;
        }
        Ok(())
    }
}

fn io_err(e: std::io::Error) -> AppError {
    AppError::new("update_io", format!("No se pudo escribir el motor en la carpeta de la app: {e}"))
}

fn make_executable(_p: &Path) -> AppResult<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(_p, std::fs::Permissions::from_mode(0o755)).map_err(io_err)?;
    }
    Ok(())
}

/// Ejecuta `--version` con límite de tiempo; solo vale si parece una versión.
pub async fn probe(bin: &Path) -> Option<String> {
    let mut c = tokio::process::Command::new(bin);
    c.arg("--version").stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true);
    #[cfg(windows)]
    c.creation_flags(0x0800_0000);
    let out = tokio::time::timeout(Duration::from_secs(60), c.output()).await.ok()?.ok()?;
    let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (out.status.success() && v.chars().next().map_or(false, |c| c.is_ascii_digit()) && v.contains('.')).then_some(v)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_compare() {
        assert!(newer("2026.11.02", "2026.10.21"));
        assert!(newer("2026.10.21.1", "2026.10.21"));
        assert!(!newer("2026.10.21", "2026.10.21"));
        assert!(!newer("2025.12.31", "2026.01.01"));
        assert!(newer("2026.01.01", ""));
    }

    #[test]
    fn sums_are_parsed() {
        let h = "a".repeat(64);
        let sums = format!("{h}  yt-dlp\n{}  yt-dlp_linux\n{}  yt-dlp.exe\n", "b".repeat(64), "C".repeat(64));
        assert_eq!(expected_hash(&sums, "yt-dlp_linux"), Some("b".repeat(64)));
        assert_eq!(expected_hash(&sums, "yt-dlp.exe"), Some("c".repeat(64)));
        assert_eq!(expected_hash(&sums, "yt-dlp_macos"), None);
        assert_eq!(expected_hash("corto  yt-dlp_linux", "yt-dlp_linux"), None);
    }
}
