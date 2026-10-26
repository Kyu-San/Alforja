//! Tipos compartidos entre la base de datos, el motor, la cola y la interfaz.
//! Se serializan en camelCase: así los ve TypeScript (src/api/types.ts).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Video,
    Audio,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Video => "video",
            Kind::Audio => "audio",
        }
    }
    pub fn parse(s: &str) -> Kind {
        if s == "audio" { Kind::Audio } else { Kind::Video }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Queued,
    Parsing,
    Downloading,
    Processing,
    Paused,
    Done,
    Error,
    Cancelled,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Queued => "queued",
            Status::Parsing => "parsing",
            Status::Downloading => "downloading",
            Status::Processing => "processing",
            Status::Paused => "paused",
            Status::Done => "done",
            Status::Error => "error",
            Status::Cancelled => "cancelled",
        }
    }
    pub fn parse(s: &str) -> Status {
        match s {
            "parsing" => Status::Parsing,
            "downloading" => Status::Downloading,
            "processing" => Status::Processing,
            "paused" => Status::Paused,
            "done" => Status::Done,
            "error" => Status::Error,
            "cancelled" => Status::Cancelled,
            _ => Status::Queued,
        }
    }
    pub fn is_finished(self) -> bool {
        matches!(self, Status::Done | Status::Error | Status::Cancelled)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Download {
    pub id: String,
    pub source_url: String,
    pub video_id: Option<String>,
    pub extractor: Option<String>,
    pub title: Option<String>,
    pub uploader: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration_s: Option<i64>,
    pub kind: Kind,
    pub container: String,
    pub quality: String,
    pub actual_quality: Option<String>,
    pub audio_lang: Option<String>,
    pub subtitle_langs: Vec<String>,
    pub subtitles_embedded: bool,
    pub output_dir: String,
    pub output_path: Option<String>,
    pub size_bytes: Option<i64>,
    pub downloaded_bytes: i64,
    pub status: Status,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub attempts: i64,
    pub position: i64,
    pub playlist_id: Option<String>,
    pub subscription_id: Option<String>,
    pub preset_id: Option<String>,
    pub created_at: String,
    pub finished_at: Option<String>,
}

/// Lo que el usuario elige en S03 / S04.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOptions {
    pub kind: Kind,
    pub container: String,
    /// "best", "2160p", "1080p"... para video; "best", "320k", "192k", "128k" para audio.
    pub quality: String,
    #[serde(default)]
    pub audio_lang: Option<String>,
    #[serde(default)]
    pub subtitle_langs: Vec<String>,
    #[serde(default)]
    pub subtitles_embedded: bool,
    /// None = la carpeta por defecto de los ajustes.
    #[serde(default)]
    pub output_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QualityOption {
    pub height: i64,
    pub size_bytes: Option<i64>,
    pub high_fps: bool,
    pub hdr: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrack {
    pub lang: String,
    pub is_original: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleTrack {
    pub lang: String,
    pub name: Option<String>,
    pub auto: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub url: String,
    pub id: String,
    pub extractor: Option<String>,
    pub title: String,
    pub uploader: Option<String>,
    pub duration_s: Option<i64>,
    pub thumbnail: Option<String>,
    /// De mayor a menor altura.
    pub qualities: Vec<QualityOption>,
    /// Tamaño estimado de la mejor pista de audio (para "solo audio").
    pub audio_size_bytes: Option<i64>,
    pub audio_tracks: Vec<AudioTrack>,
    pub subtitles: Vec<SubtitleTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    pub id: String,
    pub url: String,
    pub title: Option<String>,
    pub duration_s: Option<i64>,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistInfo {
    pub url: String,
    pub id: String,
    pub title: String,
    pub uploader: Option<String>,
    /// "playlist" o "channel".
    pub kind: String,
    pub entries: Vec<PlaylistEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ParseResult {
    Video(MediaInfo),
    Playlist(PlaylistInfo),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub output_dir: String,
    pub max_concurrent: i64,
    pub ui_language: String,
    pub theme: String,
    pub proxy_url: Option<String>,
    pub filename_template: String,
    pub cookies_browser: Option<String>,
    pub subscription_every_h: i64,
    pub engine_auto_update: bool,
    pub notify_on_finish: bool,
}

/// Cambios parciales desde S07. Los campos opcionales que pueden "borrarse"
/// (proxy, cookies) llegan como Some("") para quitar el valor.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub output_dir: Option<String>,
    pub max_concurrent: Option<i64>,
    pub ui_language: Option<String>,
    pub theme: Option<String>,
    pub proxy_url: Option<String>,
    pub filename_template: Option<String>,
    pub cookies_browser: Option<String>,
    pub subscription_every_h: Option<i64>,
    pub engine_auto_update: Option<bool>,
    pub notify_on_finish: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub ytdlp_path: Option<String>,
    pub ytdlp_version: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub ffmpeg_version: Option<String>,
}

/// Lo que el backend avisa a la interfaz (evento "app-event").
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AppEvent {
    #[serde(rename_all = "camelCase")]
    Progress {
        id: String,
        downloaded_bytes: i64,
        total_bytes: Option<i64>,
        speed: Option<f64>,
        eta_s: Option<i64>,
    },
    Download { download: Download },
    Removed { id: String },
}

/// Error que ve la interfaz: un código estable y un mensaje en español.
#[derive(Debug, Clone, Serialize, PartialEq, thiserror::Error)]
#[serde(rename_all = "camelCase")]
#[error("{code}: {message}")]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        AppError { code: code.into(), message: message.into() }
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::new("db", format!("Error de la base de datos: {e}"))
    }
}

pub type AppResult<T> = Result<T, AppError>;
