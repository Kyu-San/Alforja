//! Los comandos que la interfaz puede llamar con `invoke()`. Finos: validan la
//! entrada y delegan en la base de datos, el motor y la cola.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::db::{Db, NewDownload};
use crate::engine::{self, Engine};
use crate::models::*;
use crate::queue::{Queue, Stop};

/// Los enlaces de los formatos caducan: el análisis vale 10 minutos.
const PARSE_TTL: Duration = Duration::from_secs(600);

pub struct AppState {
    pub db: Arc<Db>,
    pub engine: Arc<RwLock<Option<Engine>>>,
    pub queue: Queue,
    pub bin_dir: PathBuf,
    parsed: Mutex<HashMap<String, (Instant, ParseResult)>>,
}

impl AppState {
    pub fn new(db: Arc<Db>, engine: Arc<RwLock<Option<Engine>>>, queue: Queue, bin_dir: PathBuf) -> Self {
        AppState { db, engine, queue, bin_dir, parsed: Mutex::new(HashMap::new()) }
    }

    fn engine(&self) -> AppResult<Engine> {
        self.engine
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
            .ok_or_else(|| AppError::new("engine_missing", "No se encontró el motor (yt-dlp). Instálalo o actualízalo en Preferencias → Motor."))
    }

    fn cached(&self, url: &str) -> Option<ParseResult> {
        let mut m = self.parsed.lock().unwrap_or_else(|e| e.into_inner());
        m.retain(|_, (t, _)| t.elapsed() < PARSE_TTL);
        m.get(url).map(|(_, r)| r.clone())
    }

    async fn parse(&self, url: &str) -> AppResult<ParseResult> {
        let url = engine::validate_url(url)?;
        if let Some(r) = self.cached(&url) {
            return Ok(r);
        }
        let settings = self.db.get_settings()?;
        let r = self.engine()?.parse(&url, &settings).await?;
        self.parsed.lock().unwrap_or_else(|e| e.into_inner()).insert(url, (Instant::now(), r.clone()));
        Ok(r)
    }

    fn output_dir(&self, o: &DownloadOptions) -> AppResult<String> {
        let dir = match &o.output_dir {
            Some(d) if !d.trim().is_empty() => d.trim().to_string(),
            _ => self.db.get_settings()?.output_dir,
        };
        check_dir(&dir)?;
        Ok(dir)
    }
}

fn check_dir(dir: &str) -> AppResult<()> {
    if !Path::new(dir).is_absolute() {
        return Err(AppError::new("output_dir", "Elige una carpeta completa (por ejemplo, la de Descargas)."));
    }
    std::fs::create_dir_all(dir).map_err(|e| AppError::new("output_dir", format!("No se puede escribir en esa carpeta: {e}")))
}

fn check_options(o: &DownloadOptions) -> AppResult<()> {
    let ok = match o.kind {
        Kind::Video => matches!(o.container.as_str(), "mp4" | "mkv"),
        Kind::Audio => matches!(o.container.as_str(), "mp3" | "m4a" | "ogg"),
    };
    if !ok {
        return Err(AppError::new("invalid_options", "Ese formato no corresponde al tipo de descarga."));
    }
    Ok(())
}

/// Nombre de carpeta válido en Windows, macOS y Linux.
pub fn safe_folder_name(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c })
        .collect();
    let trimmed: String = cleaned.trim().trim_matches('.').trim().chars().take(100).collect();
    let reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "LPT1", "LPT2", "LPT3"];
    if trimmed.is_empty() || reserved.contains(&trimmed.to_uppercase().as_str()) {
        "Lista".into()
    } else {
        trimmed
    }
}

#[tauri::command]
pub async fn parse_url(state: State<'_, AppState>, url: String) -> AppResult<ParseResult> {
    state.parse(&url).await
}

#[tauri::command]
pub async fn start_download(state: State<'_, AppState>, url: String, options: DownloadOptions) -> AppResult<Download> {
    check_options(&options)?;
    let url = engine::validate_url(&url)?;
    let dir = state.output_dir(&options)?;
    let mut n = NewDownload { source_url: url.clone(), ..Default::default() };
    if let Some(ParseResult::Video(m)) = state.cached(&url) {
        let size = match options.kind {
            Kind::Audio => m.audio_size_bytes,
            Kind::Video => {
                let h = engine::parse_height(&options.quality);
                m.qualities.iter().find(|q| h.map_or(true, |h| q.height as u32 <= h)).and_then(|q| q.size_bytes)
            }
        };
        n = NewDownload {
            source_url: url,
            video_id: Some(m.id),
            extractor: m.extractor,
            title: Some(m.title),
            uploader: m.uploader,
            thumbnail_url: m.thumbnail,
            duration_s: m.duration_s,
            size_bytes: size,
            playlist_id: None,
        };
    }
    let d = state.db.insert_download(&n, &options, &dir)?;
    state.queue.wake();
    Ok(d)
}

#[tauri::command]
pub async fn start_playlist_download(
    state: State<'_, AppState>,
    url: String,
    entry_ids: Vec<String>,
    options: DownloadOptions,
) -> AppResult<Vec<Download>> {
    check_options(&options)?;
    let ParseResult::Playlist(info) = state.parse(&url).await? else {
        return Err(AppError::new("not_playlist", "Ese enlace no es una lista."));
    };
    let entries: Vec<PlaylistEntry> = info.entries.iter().filter(|e| entry_ids.contains(&e.id)).cloned().collect();
    if entries.is_empty() {
        return Err(AppError::new("empty_selection", "Elige al menos un video de la lista."));
    }
    let base = state.output_dir(&options)?;
    let dir = Path::new(&base).join(safe_folder_name(&info.title)).to_string_lossy().into_owned();
    check_dir(&dir)?;
    let ds = state.db.insert_playlist(&info, &entries, &options, &dir)?;
    state.queue.wake();
    Ok(ds)
}

#[tauri::command]
pub fn list_downloads(state: State<'_, AppState>, search: Option<String>) -> AppResult<Vec<Download>> {
    state.db.list_downloads(search.as_deref().filter(|s| !s.trim().is_empty()))
}

#[tauri::command]
pub async fn pause_download(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.queue.stop(&id, Stop::Pause).await
}

#[tauri::command]
pub async fn cancel_download(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.queue.stop(&id, Stop::Cancel).await
}

#[tauri::command]
pub async fn remove_download(state: State<'_, AppState>, id: String, delete_file: bool) -> AppResult<()> {
    state.queue.stop(&id, Stop::Remove { delete_file }).await
}

#[tauri::command]
pub fn resume_download(state: State<'_, AppState>, id: String) -> AppResult<Download> {
    let d = state.db.get_download(&id)?.ok_or_else(|| AppError::new("not_found", "Esa descarga ya no existe"))?;
    if d.status != Status::Paused {
        return Err(AppError::new("invalid_state", "Solo se puede reanudar lo que está en pausa"));
    }
    state.db.set_status(&id, Status::Queued)?;
    state.queue.wake();
    Ok(state.db.get_download(&id)?.expect("existe"))
}

#[tauri::command]
pub fn retry_download(state: State<'_, AppState>, id: String) -> AppResult<Download> {
    let d = state.db.get_download(&id)?.ok_or_else(|| AppError::new("not_found", "Esa descarga ya no existe"))?;
    if !matches!(d.status, Status::Error | Status::Cancelled) {
        return Err(AppError::new("invalid_state", "Solo se puede reintentar lo que falló o se canceló"));
    }
    state.db.requeue(&id, d.status == Status::Error)?;
    state.queue.wake();
    Ok(state.db.get_download(&id)?.expect("existe"))
}

#[tauri::command]
pub fn clear_finished(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    state.db.clear_finished()
}

fn finished_path(state: &AppState, id: &str) -> AppResult<String> {
    let d = state.db.get_download(id)?.ok_or_else(|| AppError::new("not_found", "Esa descarga ya no existe"))?;
    let path = d.output_path.ok_or_else(|| AppError::new("not_done", "Esta descarga aún no tiene archivo"))?;
    if !Path::new(&path).exists() {
        return Err(AppError::new("file_missing", "El archivo ya no está en su carpeta: se movió o se borró."));
    }
    Ok(path)
}

#[tauri::command]
pub fn open_file(app: tauri::AppHandle, state: State<'_, AppState>, id: String) -> AppResult<()> {
    let path = finished_path(&state, &id)?;
    app.opener().open_path(path, None::<&str>).map_err(|e| AppError::new("open", format!("No se pudo abrir: {e}")))
}

#[tauri::command]
pub fn reveal_in_folder(app: tauri::AppHandle, state: State<'_, AppState>, id: String) -> AppResult<()> {
    let path = finished_path(&state, &id)?;
    app.opener().reveal_item_in_dir(path).map_err(|e| AppError::new("open", format!("No se pudo mostrar: {e}")))
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<Settings> {
    state.db.get_settings()
}

#[tauri::command]
pub fn update_settings(state: State<'_, AppState>, patch: SettingsPatch) -> AppResult<Settings> {
    if let Some(d) = &patch.output_dir {
        check_dir(d)?;
    }
    if let Some(n) = patch.max_concurrent {
        if !(1..=10).contains(&n) {
            return Err(AppError::new("invalid_settings", "Entre 1 y 10 descargas a la vez."));
        }
    }
    if let Some(p) = patch.proxy_url.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        let ok = url::Url::parse(p).map_or(false, |u| matches!(u.scheme(), "http" | "https" | "socks5" | "socks5h") && u.host_str().is_some());
        if !ok {
            return Err(AppError::new("invalid_settings", "Escribe una dirección que empiece por http://, https:// o socks5://"));
        }
    }
    if let Some(t) = &patch.filename_template {
        engine::validate_template(t)?;
    }
    if let Some(t) = &patch.theme {
        if !matches!(t.as_str(), "system" | "light" | "dark") {
            return Err(AppError::new("invalid_settings", "Tema no válido."));
        }
    }
    if let Some(b) = patch.cookies_browser.as_deref().filter(|b| !b.is_empty()) {
        if !matches!(b, "firefox" | "chrome" | "edge" | "brave" | "safari" | "chromium") {
            return Err(AppError::new("invalid_settings", "Navegador no compatible."));
        }
    }
    let s = state.db.update_settings(&patch)?;
    state.queue.wake();
    Ok(s)
}

#[tauri::command]
pub async fn engine_status(state: State<'_, AppState>) -> AppResult<EngineStatus> {
    let e = state.engine.read().unwrap_or_else(|e| e.into_inner()).clone();
    Ok(match e {
        None => EngineStatus { ytdlp_path: None, ytdlp_version: None, ffmpeg_path: None, ffmpeg_version: None },
        Some(e) => EngineStatus {
            ytdlp_version: e.version().await,
            ffmpeg_version: e.ffmpeg_version().await,
            ytdlp_path: Some(e.ytdlp.to_string_lossy().into_owned()),
            ffmpeg_path: e.ffmpeg.as_ref().map(|p| p.to_string_lossy().into_owned()),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_names_are_safe() {
        assert_eq!(safe_folder_name("Mi lista: lo mejor / 2026?"), "Mi lista_ lo mejor _ 2026_");
        assert_eq!(safe_folder_name("  ..  "), "Lista");
        assert_eq!(safe_folder_name("con"), "Lista");
        assert_eq!(safe_folder_name(&"a".repeat(300)).len(), 100);
    }
}
