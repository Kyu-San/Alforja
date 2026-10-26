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
use crate::queue::{Queue, Sink, Stop};
use crate::updater::{self, Updater};

/// Los enlaces de los formatos caducan: el análisis vale 10 minutos.
const PARSE_TTL: Duration = Duration::from_secs(600);

pub struct AppState {
    pub db: Arc<Db>,
    pub engine: Arc<RwLock<Option<Engine>>>,
    pub queue: Queue,
    pub bin_dir: PathBuf,
    pub updater: Updater,
    pub sink: Sink,
    /// Una sola actualización del motor a la vez.
    update_lock: tokio::sync::Mutex<()>,
    parsed: Mutex<HashMap<String, (Instant, ParseResult)>>,
}

impl AppState {
    pub fn new(db: Arc<Db>, engine: Arc<RwLock<Option<Engine>>>, queue: Queue, bin_dir: PathBuf, sink: Sink) -> Self {
        let updater = Updater::new(bin_dir.clone());
        AppState { db, engine, queue, bin_dir, updater, sink, update_lock: tokio::sync::Mutex::new(()), parsed: Mutex::new(HashMap::new()) }
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

// ---------- motor (F09) ----------

/// Cómo está el motor ahora: versiones, de dónde sale y si hay una nueva.
pub async fn engine_status_of(state: &AppState) -> AppResult<EngineStatus> {
    let e = state.engine.read().unwrap_or_else(|e| e.into_inner()).clone();
    let (_, _, latest, checked_at) = state.db.engine_meta()?;
    let (ytdlp_version, ffmpeg_version) = match &e {
        Some(e) => (e.version().await, e.ffmpeg_version().await),
        None => (None, None),
    };
    let update_available = match (&latest, &ytdlp_version) {
        (Some(l), Some(v)) => updater::newer(l, v),
        (Some(_), None) => true,
        _ => false,
    };
    Ok(EngineStatus {
        ytdlp_path: e.as_ref().map(|e| e.ytdlp.to_string_lossy().into_owned()),
        ytdlp_source: e.as_ref().map(|e| e.source.to_string()),
        ffmpeg_path: e.as_ref().and_then(|e| e.ffmpeg.as_ref()).map(|p| p.to_string_lossy().into_owned()),
        ytdlp_version,
        ffmpeg_version,
        latest_version: latest,
        update_available,
        can_rollback: state.updater.can_rollback(),
        checked_at,
        updating: state.update_lock.try_lock().is_err(),
    })
}

async fn emit_engine(state: &AppState) {
    if let Ok(status) = engine_status_of(state).await {
        (state.sink)(AppEvent::Engine { status });
    }
}

/// Pregunta a GitHub por la última versión y la apunta.
pub async fn check_latest(state: &AppState) -> AppResult<updater::Release> {
    let rel = state.updater.latest().await?;
    state.db.set_engine_checked(&rel.version)?;
    Ok(rel)
}

/// Instala la última versión. No mientras haya descargas usando el motor.
pub async fn update_engine_now(state: &AppState) -> AppResult<EngineStatus> {
    let Ok(_guard) = state.update_lock.try_lock() else {
        return Err(AppError::new("update_busy", "Ya se está actualizando el motor."));
    };
    if state.db.count_active()? > 0 {
        return Err(AppError::new("update_busy", "Espera a que terminen (o pausa) las descargas en marcha: el motor está en uso."));
    }
    (state.sink)(AppEvent::Engine { status: EngineStatus { updating: true, ..engine_status_of(state).await? } });
    let result = async {
        let rel = check_latest(state).await?;
        let previous = state.engine.read().unwrap_or_else(|e| e.into_inner()).clone();
        let prev_version = match &previous {
            Some(e) if e.source == "app" => e.version().await,
            _ => None,
        };
        let version = state.updater.install(&rel).await?;
        state.db.set_engine_installed(&version, prev_version.as_deref())?;
        relocate(state);
        Ok::<_, AppError>(())
    }
    .await;
    drop(_guard);
    emit_engine(state).await;
    result?;
    engine_status_of(state).await
}

/// Vuelve a buscar el motor (tras instalar o volver atrás).
fn relocate(state: &AppState) {
    *state.engine.write().unwrap_or_else(|e| e.into_inner()) = Engine::locate(Some(&state.bin_dir));
}

/// Al arrancar: si no hay motor, se instala; si toca (una vez al día), se
/// comprueba y, con la actualización automática activada, se actualiza.
pub async fn startup_engine_check(state: &AppState) {
    let Ok(settings) = state.db.get_settings() else { return };
    let missing = state.engine.read().unwrap_or_else(|e| e.into_inner()).is_none();
    if missing {
        if let Err(e) = update_engine_now(state).await {
            eprintln!("motor: no se pudo instalar: {e}");
        }
        return;
    }
    if !settings.engine_auto_update {
        return;
    }
    let (_, _, _, checked_at) = state.db.engine_meta().unwrap_or_default();
    let due = checked_at
        .and_then(|t| chrono::DateTime::parse_from_rfc3339(&t).ok())
        .map_or(true, |t| chrono::Utc::now().signed_duration_since(t) > chrono::Duration::hours(24));
    if !due {
        return;
    }
    match check_latest(state).await {
        Ok(rel) => {
            let current = state.engine.read().unwrap_or_else(|e| e.into_inner()).clone();
            let current_version = match current {
                Some(e) => e.version().await.unwrap_or_default(),
                None => String::new(),
            };
            if updater::newer(&rel.version, &current_version) {
                if let Err(e) = update_engine_now(state).await {
                    // Normalmente: hay descargas en marcha. La interfaz lo ofrece después.
                    eprintln!("motor: actualización pospuesta: {e}");
                    emit_engine(state).await;
                }
            }
        }
        Err(e) => eprintln!("motor: no se pudo comprobar: {e}"),
    }
}

#[tauri::command]
pub async fn engine_status(state: State<'_, AppState>) -> AppResult<EngineStatus> {
    engine_status_of(&state).await
}

#[tauri::command]
pub async fn engine_check(state: State<'_, AppState>) -> AppResult<EngineStatus> {
    check_latest(&state).await?;
    engine_status_of(&state).await
}

#[tauri::command]
pub async fn engine_update(state: State<'_, AppState>) -> AppResult<EngineStatus> {
    update_engine_now(&state).await
}

#[tauri::command]
pub async fn engine_rollback(state: State<'_, AppState>) -> AppResult<EngineStatus> {
    let Ok(_guard) = state.update_lock.try_lock() else {
        return Err(AppError::new("update_busy", "Ya se está actualizando el motor."));
    };
    if state.db.count_active()? > 0 {
        return Err(AppError::new("update_busy", "Espera a que terminen (o pausa) las descargas en marcha: el motor está en uso."));
    }
    state.updater.rollback()?;
    relocate(&state);
    let (cur, prev, _, _) = state.db.engine_meta()?;
    state.db.set_engine_installed(prev.as_deref().unwrap_or(""), cur.as_deref())?;
    drop(_guard);
    emit_engine(&state).await;
    engine_status_of(&state).await
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
