//! Todo lo que habla con yt-dlp: buscar el binario, analizar enlaces, construir
//! los argumentos de una descarga, leer su salida y traducir sus errores.
//!
//! Reglas de seguridad (architecture.md, "Lo que muerde"):
//! - nunca a través de una shell: siempre `Command` con argumentos separados;
//! - siempre `--` antes de la URL, y solo http(s);
//! - nada de `--exec` ni de opciones libres que vengan de la interfaz.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde_json::Value;
use tokio::process::Command;

use crate::models::*;

#[derive(Debug, Clone)]
pub struct Engine {
    pub ytdlp: PathBuf,
    pub ffmpeg: Option<PathBuf>,
}

fn exe(name: &str) -> String {
    if cfg!(windows) { format!("{name}.exe") } else { name.to_string() }
}

fn which(name: &str) -> Option<PathBuf> {
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths).map(|p| p.join(exe(name))).find(|p| p.is_file())
}

impl Engine {
    /// Orden: variable de entorno, carpeta `bin` de la app (donde la
    /// actualización deja el binario), y por último el PATH.
    pub fn locate(app_bin_dir: Option<&Path>) -> Option<Engine> {
        let from_env = |var: &str| std::env::var_os(var).map(PathBuf::from).filter(|p| p.is_file());
        let in_bin = |name: &str| app_bin_dir.map(|d| d.join(exe(name))).filter(|p| p.is_file());
        let ytdlp = from_env("DESCARGADOR_YTDLP").or_else(|| in_bin("yt-dlp")).or_else(|| which("yt-dlp"))?;
        let ffmpeg = from_env("DESCARGADOR_FFMPEG").or_else(|| in_bin("ffmpeg")).or_else(|| which("ffmpeg"));
        Some(Engine { ytdlp, ffmpeg })
    }

    pub fn command(&self) -> Command {
        let mut c = Command::new(&self.ytdlp);
        c.env("PYTHONUTF8", "1").env("PYTHONIOENCODING", "utf-8").stdin(Stdio::null());
        #[cfg(windows)]
        {
            // CREATE_NO_WINDOW: sin ventanas de consola que parpadean.
            c.creation_flags(0x0800_0000);
        }
        #[cfg(unix)]
        {
            // Grupo de procesos propio, para poder matar también a ffmpeg.
            c.process_group(0);
        }
        c
    }

    fn common_args(&self, settings: &Settings) -> Vec<String> {
        let mut a: Vec<String> = vec!["--no-colors".into(), "--encoding".into(), "utf-8".into()];
        if let Some(p) = &settings.proxy_url {
            a.extend(["--proxy".into(), p.clone()]);
        }
        if let Some(b) = &settings.cookies_browser {
            a.extend(["--cookies-from-browser".into(), b.clone()]);
        }
        if let Some(f) = &self.ffmpeg {
            a.extend(["--ffmpeg-location".into(), f.to_string_lossy().into_owned()]);
        }
        a
    }

    /// `yt-dlp -J --flat-playlist -- <url>`
    pub async fn parse(&self, url: &str, settings: &Settings) -> AppResult<ParseResult> {
        let url = validate_url(url)?;
        let mut args = self.common_args(settings);
        args.extend(["-J".into(), "--flat-playlist".into(), "--no-warnings".into(), "--".into(), url.clone()]);
        let out = self
            .command()
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .output()
            .await
            .map_err(|e| AppError::new("engine_missing", format!("No se pudo ejecutar el motor: {e}")))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            return Err(classify_error(&stderr));
        }
        let v: Value = serde_json::from_slice(&out.stdout)
            .map_err(|e| AppError::new("engine", format!("El motor devolvió algo que no se entiende: {e}")))?;
        Ok(parse_info(&url, &v))
    }

    pub async fn version(&self) -> Option<String> {
        let out = self.command().arg("--version").stdout(Stdio::piped()).stderr(Stdio::null()).output().await.ok()?;
        Some(String::from_utf8_lossy(&out.stdout).trim().to_string()).filter(|s| !s.is_empty())
    }

    pub async fn ffmpeg_version(&self) -> Option<String> {
        let f = self.ffmpeg.as_ref()?;
        let out = Command::new(f).arg("-version").stdout(Stdio::piped()).stderr(Stdio::null()).output().await.ok()?;
        let s = String::from_utf8_lossy(&out.stdout);
        s.lines().next().and_then(|l| l.split_whitespace().nth(2)).map(str::to_string)
    }

    /// Argumentos de una descarga. La URL siempre va al final, tras `--`.
    pub fn download_args(&self, d: &Download, settings: &Settings) -> AppResult<Vec<String>> {
        let url = validate_url(&d.source_url)?;
        validate_template(&settings.filename_template)?;
        let mut a = self.common_args(settings);
        a.extend(
            [
                "--newline",
                "--progress",
                "--no-playlist",
                "--windows-filenames",
                "--continue",
                "--progress-template",
                "download:@@DL %(progress)j",
                "--progress-template",
                "postprocess:@@PP %(progress.status)s %(progress.postprocessor)s",
                "--no-simulate",
                "--print",
                "video:@@META %(.{id,extractor_key,title,thumbnail,duration,uploader})j",
                "--print",
                "after_move:@@DONE %(filepath)s",
                "--print",
                "after_move:@@RES %(height)s|%(abr)s",
            ]
            .map(String::from),
        );
        a.extend(["-P".into(), d.output_dir.clone(), "-o".into(), settings.filename_template.clone()]);

        let lang = d.audio_lang.as_deref().filter(|l| is_safe_token(l));
        match d.kind {
            Kind::Video => {
                a.extend(["-f".into(), video_selector(parse_height(&d.quality), lang)]);
                let container = if d.container == "mkv" { "mkv" } else { "mp4" };
                a.extend(["--merge-output-format".into(), container.into(), "--remux-video".into(), container.into()]);
            }
            Kind::Audio => {
                let fmt = match d.container.as_str() {
                    "m4a" => "m4a",
                    "ogg" => "vorbis",
                    _ => "mp3",
                };
                a.extend(["-f".into(), audio_selector(lang), "-x".into(), "--audio-format".into(), fmt.into()]);
                a.extend(["--audio-quality".into(), audio_quality(&d.quality)]);
            }
        }

        let subs: Vec<&str> = d.subtitle_langs.iter().map(String::as_str).filter(|l| is_safe_token(l)).collect();
        if !subs.is_empty() {
            a.extend(["--write-subs".into(), "--write-auto-subs".into(), "--sub-langs".into(), subs.join(",")]);
            a.extend(["--convert-subs".into(), "srt".into()]);
            if d.subtitles_embedded && d.kind == Kind::Video {
                a.push("--embed-subs".into());
            }
        }
        a.extend(["--".into(), url]);
        Ok(a)
    }
}

/// Solo http y https. Una "URL" que empieza por "-" ni siquiera llega aquí
/// como URL válida, y aun así va detrás de `--`.
pub fn validate_url(raw: &str) -> AppResult<String> {
    let raw = raw.trim();
    let u = url::Url::parse(raw).map_err(|_| AppError::new("invalid_url", "Eso no parece un enlace. Copia la dirección completa del video."))?;
    if u.scheme() != "http" && u.scheme() != "https" {
        return Err(AppError::new("invalid_url", "Solo se aceptan enlaces que empiecen por http:// o https://"));
    }
    if u.host_str().map_or(true, str::is_empty) {
        return Err(AppError::new("invalid_url", "Al enlace le falta el dominio."));
    }
    Ok(u.to_string())
}

/// La plantilla del nombre no puede salirse de la carpeta de destino.
pub fn validate_template(t: &str) -> AppResult<()> {
    let bad = t.trim().is_empty()
        || t.contains("..")
        || t.starts_with('/')
        || t.starts_with('\\')
        || t.chars().nth(1) == Some(':')
        || !t.contains("%(");
    if bad {
        return Err(AppError::new("invalid_template", "La plantilla del nombre no es válida: no puede tener «..» ni ser una ruta absoluta."));
    }
    Ok(())
}

fn is_safe_token(s: &str) -> bool {
    !s.is_empty() && s.len() <= 20 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn parse_height(q: &str) -> Option<u32> {
    q.trim_end_matches('p').parse().ok()
}

/// Con caída: si no hay la calidad pedida, la mejor que haya por debajo y,
/// si no, la mejor que exista. Nunca falla por "formato no disponible".
pub fn video_selector(height: Option<u32>, lang: Option<&str>) -> String {
    let h = height.map(|h| format!("[height<={h}]")).unwrap_or_default();
    let mut parts = Vec::new();
    if let Some(l) = lang {
        parts.push(format!("bv*{h}+ba[language^={l}]"));
    }
    parts.push(format!("bv*{h}+ba"));
    parts.push(format!("b{h}"));
    parts.push("bv*+ba".into());
    parts.push("b".into());
    parts.join("/")
}

pub fn audio_selector(lang: Option<&str>) -> String {
    match lang {
        Some(l) => format!("ba[language^={l}]/ba/b"),
        None => "ba/b".into(),
    }
}

fn audio_quality(q: &str) -> String {
    match q.trim_end_matches(['k', 'K']).parse::<u32>() {
        Ok(k) if (32..=512).contains(&k) => format!("{k}K"),
        _ => "0".into(),
    }
}

fn as_i64(v: &Value) -> Option<i64> {
    v.as_i64().or_else(|| v.as_f64().map(|f| f as i64))
}

fn s(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(Value::as_str).map(str::to_string)
}

fn format_size(f: &Value) -> Option<i64> {
    f.get("filesize").and_then(as_i64).or_else(|| f.get("filesize_approx").and_then(as_i64))
}

/// Convierte el JSON de `yt-dlp -J` en lo que muestran S03 y S04.
pub fn parse_info(url: &str, v: &Value) -> ParseResult {
    if v.get("_type").and_then(Value::as_str) == Some("playlist") {
        let entries = v
            .get("entries")
            .and_then(Value::as_array)
            .map(|es| {
                es.iter()
                    .filter_map(|e| {
                        let eurl = s(e, "url").or_else(|| s(e, "webpage_url"))?;
                        Some(PlaylistEntry {
                            id: s(e, "id").unwrap_or_else(|| eurl.clone()),
                            url: eurl,
                            title: s(e, "title"),
                            duration_s: e.get("duration").and_then(as_i64),
                            thumbnail: s(e, "thumbnail").or_else(|| {
                                e.get("thumbnails").and_then(Value::as_array).and_then(|t| t.last()).and_then(|t| s(t, "url"))
                            }),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        let is_channel = s(v, "channel_id").is_some() && s(v, "id") == s(v, "channel_id")
            || url.contains("/@")
            || url.contains("/channel/")
            || url.contains("/c/");
        return ParseResult::Playlist(PlaylistInfo {
            url: url.to_string(),
            id: s(v, "id").unwrap_or_default(),
            title: s(v, "title").unwrap_or_else(|| "Lista sin título".into()),
            uploader: s(v, "uploader").or_else(|| s(v, "channel")),
            kind: if is_channel { "channel".into() } else { "playlist".into() },
            entries,
        });
    }

    let formats: Vec<&Value> = v.get("formats").and_then(Value::as_array).map(|f| f.iter().collect()).unwrap_or_default();
    let has_video = |f: &Value| f.get("vcodec").and_then(Value::as_str).map_or(f.get("height").is_some(), |c| c != "none");
    let has_audio = |f: &Value| f.get("acodec").and_then(Value::as_str).map_or(false, |c| c != "none");

    // Mejor audio suelto (para sumar al video y para "solo audio").
    let best_audio = formats
        .iter()
        .filter(|f| has_audio(f) && !has_video(f))
        .max_by_key(|f| f.get("abr").and_then(as_i64).or_else(|| f.get("tbr").and_then(as_i64)).unwrap_or(0));
    let audio_size = best_audio.and_then(|f| format_size(f));

    let mut qualities: Vec<QualityOption> = Vec::new();
    for f in formats.iter().filter(|f| has_video(f)) {
        let Some(h) = f.get("height").and_then(as_i64) else { continue };
        let size = format_size(f).map(|sz| if has_audio(f) { sz } else { sz + audio_size.unwrap_or(0) });
        let fps = f.get("fps").and_then(Value::as_f64).unwrap_or(0.0);
        let hdr = f.get("dynamic_range").and_then(Value::as_str).map_or(false, |r| r != "SDR");
        match qualities.iter_mut().find(|q| q.height == h) {
            Some(q) => {
                q.size_bytes = match (q.size_bytes, size) {
                    (Some(a), Some(b)) => Some(a.max(b)),
                    (a, b) => a.or(b),
                };
                q.high_fps |= fps > 30.5;
                q.hdr |= hdr;
            }
            None => qualities.push(QualityOption { height: h, size_bytes: size, high_fps: fps > 30.5, hdr }),
        }
    }
    // Un enlace directo sin altura conocida: una única opción "la mejor".
    qualities.sort_by(|a, b| b.height.cmp(&a.height));

    let mut audio_tracks: Vec<AudioTrack> = Vec::new();
    for f in formats.iter().filter(|f| has_audio(f)) {
        if let Some(lang) = s(f, "language") {
            let original = s(f, "format_note").map_or(false, |n| n.to_lowercase().contains("original"))
                || f.get("language_preference").and_then(as_i64).map_or(false, |p| p >= 10);
            match audio_tracks.iter_mut().find(|t| t.lang == lang) {
                Some(t) => t.is_original |= original,
                None => audio_tracks.push(AudioTrack { lang, is_original: original }),
            }
        }
    }

    let mut subtitles = Vec::new();
    for (key, auto) in [("subtitles", false), ("automatic_captions", true)] {
        if let Some(map) = v.get(key).and_then(Value::as_object) {
            for (lang, tracks) in map {
                if lang == "live_chat" || subtitles.iter().any(|t: &SubtitleTrack| &t.lang == lang) {
                    continue;
                }
                let name = tracks.as_array().and_then(|t| t.first()).and_then(|t| s(t, "name"));
                subtitles.push(SubtitleTrack { lang: lang.clone(), name, auto });
            }
        }
    }

    ParseResult::Video(MediaInfo {
        url: url.to_string(),
        id: s(v, "id").unwrap_or_default(),
        extractor: s(v, "extractor_key").or_else(|| s(v, "extractor")),
        title: s(v, "title").unwrap_or_else(|| "Video sin título".into()),
        uploader: s(v, "uploader").or_else(|| s(v, "channel")),
        duration_s: v.get("duration").and_then(as_i64),
        thumbnail: s(v, "thumbnail"),
        qualities,
        audio_size_bytes: audio_size,
        audio_tracks,
        subtitles,
    })
}

/// Metadatos que yt-dlp imprime al empezar (para descargas que vienen de una
/// playlist y aún no tienen título ni miniatura).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Meta {
    pub id: Option<String>,
    pub extractor: Option<String>,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub duration_s: Option<i64>,
    pub uploader: Option<String>,
}

/// Una línea de la salida de una descarga.
#[derive(Debug, Clone, PartialEq)]
pub enum Line {
    Progress { status: String, downloaded: i64, total: Option<i64>, speed: Option<f64>, eta: Option<i64>, files: Vec<String> },
    Meta(Meta),
    Processing,
    Done(String),
    Resolution(Option<String>),
    Error(String),
    Other,
}

pub fn parse_line(line: &str) -> Line {
    let line = line.trim_end();
    if let Some(j) = line.strip_prefix("@@DL ") {
        let Ok(v) = serde_json::from_str::<Value>(j) else { return Line::Other };
        return Line::Progress {
            status: s(&v, "status").unwrap_or_default(),
            downloaded: v.get("downloaded_bytes").and_then(as_i64).unwrap_or(0),
            total: v.get("total_bytes").and_then(as_i64).or_else(|| v.get("total_bytes_estimate").and_then(as_i64)),
            speed: v.get("speed").and_then(Value::as_f64),
            eta: v.get("eta").and_then(as_i64),
            files: ["tmpfilename", "filename"].iter().filter_map(|k| s(&v, k)).collect(),
        };
    }
    if let Some(j) = line.strip_prefix("@@META ") {
        let Ok(v) = serde_json::from_str::<Value>(j) else { return Line::Other };
        return Line::Meta(Meta {
            id: s(&v, "id"),
            extractor: s(&v, "extractor_key"),
            title: s(&v, "title"),
            thumbnail: s(&v, "thumbnail"),
            duration_s: v.get("duration").and_then(as_i64),
            uploader: s(&v, "uploader"),
        });
    }
    if let Some(rest) = line.strip_prefix("@@PP ") {
        let mut it = rest.split_whitespace();
        return match (it.next(), it.next()) {
            (Some("started"), Some(pp)) if pp != "MoveFiles" => Line::Processing,
            _ => Line::Other,
        };
    }
    if let Some(p) = line.strip_prefix("@@DONE ") {
        return Line::Done(p.to_string());
    }
    if let Some(r) = line.strip_prefix("@@RES ") {
        let (h, abr) = r.split_once('|').unwrap_or((r, "NA"));
        let q = if h != "NA" && h != "None" {
            Some(format!("{h}p"))
        } else if let Ok(a) = abr.parse::<f64>() {
            Some(format!("{} kbps", a.round() as i64))
        } else {
            None
        };
        return Line::Resolution(q);
    }
    if let Some(e) = line.strip_prefix("ERROR: ") {
        return Line::Error(e.to_string());
    }
    Line::Other
}

/// Traduce el error de yt-dlp a un código estable y un mensaje en español.
pub fn classify_error(stderr: &str) -> AppError {
    let last = stderr
        .lines()
        .rev()
        .find_map(|l| l.trim().strip_prefix("ERROR: ").map(str::to_string))
        .unwrap_or_else(|| stderr.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string());
    let l = last.to_lowercase();
    let (code, msg) = if l.contains("unsupported url") {
        ("unsupported", "Este sitio o enlace no es compatible.")
    } else if l.contains("private video") || l.contains("members-only") || l.contains("join this channel") {
        ("private", "Es privado: conecta tu cuenta en Preferencias para bajarlo.")
    } else if l.contains("sign in to confirm your age") || l.contains("age-restricted") || l.contains("inappropriate for some users") {
        ("age", "Tiene restricción de edad: conecta tu cuenta en Preferencias.")
    } else if l.contains("not a bot") || l.contains("http error 429") || l.contains("too many requests") {
        ("rate_limited", "El sitio está limitando las descargas. Espera unos minutos y reintenta.")
    } else if l.contains("not available in your country") || l.contains("geo restrict") || l.contains("geo-restrict") {
        ("geo", "No está disponible en tu país.")
    } else if l.contains("no space left") || l.contains("errno 28") || l.contains("disk full") {
        ("disk_full", "No queda espacio en el disco.")
    } else if l.contains("http error 403") {
        ("http_403", "El servidor rechazó la descarga (403). Si pasa con muchos videos, actualiza el motor.")
    } else if l.contains("http error 404") || l.contains("video unavailable") || l.contains("has been removed") || l.contains("does not exist") {
        ("unavailable", "El video ya no existe o no está disponible.")
    } else if l.contains("ffmpeg") && (l.contains("not found") || l.contains("not installed")) {
        ("ffmpeg_missing", "Falta ffmpeg, necesario para unir video y audio o convertir a MP3.")
    } else if l.contains("unable to download") || l.contains("timed out") || l.contains("getaddrinfo") || l.contains("connection") {
        ("network", "Problema de conexión. Revisa internet y reintenta.")
    } else {
        ("engine", "El motor no pudo con este enlace. Si pasa a menudo, actualiza el motor.")
    };
    AppError { code: code.into(), message: if last.is_empty() { msg.into() } else { format!("{msg}\n\n{last}") } }
}

/// Mata la descarga y sus hijos (ffmpeg).
pub fn kill_tree(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc::killpg(pid as i32, libc::SIGTERM);
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

pub fn kill_tree_hard(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc::killpg(pid as i32, libc::SIGKILL);
    }
    #[cfg(windows)]
    kill_tree(pid);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_are_validated() {
        assert!(validate_url("https://www.youtube.com/watch?v=abc").is_ok());
        assert!(validate_url("  http://example.com/v.mp4 ").is_ok());
        for bad in ["--exec rm", "-o /etc/passwd", "file:///etc/passwd", "javascript:alert(1)", "ftp://x/y", "hola", ""] {
            assert_eq!(validate_url(bad).unwrap_err().code, "invalid_url", "{bad}");
        }
    }

    #[test]
    fn templates_cannot_escape() {
        assert!(validate_template("%(title).180B [%(id)s].%(ext)s").is_ok());
        assert!(validate_template("%(uploader)s/%(title)s.%(ext)s").is_ok());
        for bad in ["../%(title)s.%(ext)s", "/etc/%(title)s", "C:\\x\\%(title)s", "fijo.mp4", ""] {
            assert!(validate_template(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn selectors_fall_back() {
        assert_eq!(video_selector(Some(2160), None), "bv*[height<=2160]+ba/b[height<=2160]/bv*+ba/b");
        assert_eq!(video_selector(None, Some("es")), "bv*+ba[language^=es]/bv*+ba/b/bv*+ba/b");
        assert_eq!(audio_selector(Some("en")), "ba[language^=en]/ba/b");
        assert_eq!(audio_quality("320k"), "320K");
        assert_eq!(audio_quality("best"), "0");
    }

    fn download(kind: Kind, container: &str, quality: &str) -> Download {
        Download {
            id: "x".into(), source_url: "https://example.com/v".into(), video_id: None, extractor: None, title: None,
            uploader: None, thumbnail_url: None, duration_s: None, kind, container: container.into(), quality: quality.into(),
            actual_quality: None, audio_lang: Some("es; rm -rf".into()), subtitle_langs: vec!["es".into(), "../x".into()],
            subtitles_embedded: true, output_dir: "/tmp/out".into(), output_path: None, size_bytes: None, downloaded_bytes: 0,
            status: Status::Queued, error_code: None, error_message: None, attempts: 0, position: 1, playlist_id: None,
            subscription_id: None, preset_id: None, created_at: String::new(), finished_at: None,
        }
    }

    fn settings() -> Settings {
        Settings {
            output_dir: "/tmp/out".into(), max_concurrent: 3, ui_language: "es".into(), theme: "system".into(),
            proxy_url: None, filename_template: "%(title).180B [%(id)s].%(ext)s".into(), cookies_browser: None,
            subscription_every_h: 6, engine_auto_update: true, notify_on_finish: true,
        }
    }

    #[test]
    fn download_args_are_safe() {
        let e = Engine { ytdlp: "yt-dlp".into(), ffmpeg: None };
        let a = e.download_args(&download(Kind::Video, "mkv", "1080p"), &settings()).unwrap();
        assert_eq!(&a[a.len() - 2..], ["--".to_string(), "https://example.com/v".to_string()]);
        assert!(a.contains(&"bv*[height<=1080]+ba/b[height<=1080]/bv*+ba/b".to_string()), "el idioma inseguro se descarta");
        assert!(a.windows(2).any(|w| w == ["--sub-langs", "es"]), "el idioma de subtítulos inseguro se descarta");
        assert!(a.contains(&"--embed-subs".to_string()));
        assert!(!a.iter().any(|x| x == "--exec"));

        let a = e.download_args(&download(Kind::Audio, "mp3", "320k"), &settings()).unwrap();
        assert!(a.windows(2).any(|w| w == ["--audio-format", "mp3"]));
        assert!(!a.contains(&"--embed-subs".to_string()), "no se incrustan subtítulos en audio");
    }

    #[test]
    fn lines_are_parsed() {
        let l = parse_line(r#"@@DL {"status": "downloading", "downloaded_bytes": 1024, "total_bytes_estimate": 2048.0, "speed": 512.5, "eta": 2, "tmpfilename": "a.part"}"#);
        assert_eq!(l, Line::Progress { status: "downloading".into(), downloaded: 1024, total: Some(2048), speed: Some(512.5), eta: Some(2), files: vec!["a.part".into()] });
        let m = parse_line(r#"@@META {"id": "abc", "extractor_key": "Youtube", "title": "Hola", "duration": 12.0, "thumbnail": null}"#);
        assert_eq!(m, Line::Meta(Meta { id: Some("abc".into()), extractor: Some("Youtube".into()), title: Some("Hola".into()), duration_s: Some(12), ..Default::default() }));
        assert_eq!(parse_line("@@PP started Merger"), Line::Processing);
        assert_eq!(parse_line("@@PP started MoveFiles"), Line::Other);
        assert_eq!(parse_line("@@DONE /x/a b.mkv"), Line::Done("/x/a b.mkv".into()));
        assert_eq!(parse_line("@@RES 720|NA"), Line::Resolution(Some("720p".into())));
        assert_eq!(parse_line("@@RES NA|129.6"), Line::Resolution(Some("130 kbps".into())));
        assert_eq!(parse_line("ERROR: boom"), Line::Error("boom".into()));
    }

    #[test]
    fn errors_are_classified() {
        assert_eq!(classify_error("ERROR: [youtube] abc: Private video. Sign in").code, "private");
        assert_eq!(classify_error("ERROR: Unsupported URL: https://x").code, "unsupported");
        assert_eq!(classify_error("ERROR: unable to download video data: HTTP Error 403: Forbidden").code, "http_403");
        assert_eq!(classify_error("ERROR: [youtube] x: Sign in to confirm you’re not a bot").code, "rate_limited");
        assert_eq!(classify_error("ERROR: [generic] nope: Unable to download webpage: HTTP Error 404: File not found").code, "unavailable");
        assert_eq!(classify_error("algo raro").code, "engine");
    }

    #[test]
    fn parses_video_and_playlist_json() {
        let v: Value = serde_json::json!({
            "id": "abc", "title": "T", "extractor_key": "Youtube", "duration": 61.5,
            "formats": [
                {"format_id": "a1", "vcodec": "none", "acodec": "opus", "abr": 130, "filesize": 100, "language": "es", "format_note": "Original, high"},
                {"format_id": "a2", "vcodec": "none", "acodec": "opus", "abr": 50, "filesize": 40, "language": "en"},
                {"format_id": "v1", "vcodec": "vp9", "acodec": "none", "height": 2160, "fps": 60, "filesize": 5000, "dynamic_range": "HDR10"},
                {"format_id": "v2", "vcodec": "avc1", "acodec": "none", "height": 1080, "fps": 30, "filesize_approx": 1000},
                {"format_id": "v3", "vcodec": "vp9", "acodec": "none", "height": 1080, "fps": 30, "filesize": 900}
            ],
            "subtitles": {"es": [{"name": "Español"}], "live_chat": []},
            "automatic_captions": {"en": [{"name": "English"}], "es": []}
        });
        let ParseResult::Video(m) = parse_info("https://y/abc", &v) else { panic!() };
        assert_eq!(m.qualities.iter().map(|q| q.height).collect::<Vec<_>>(), vec![2160, 1080]);
        assert!(m.qualities[0].hdr && m.qualities[0].high_fps);
        assert_eq!(m.qualities[0].size_bytes, Some(5100));
        assert_eq!(m.audio_size_bytes, Some(100));
        assert_eq!(m.audio_tracks.len(), 2);
        assert!(m.audio_tracks.iter().find(|t| t.lang == "es").unwrap().is_original);
        assert_eq!(m.subtitles.len(), 2);
        assert_eq!(m.duration_s, Some(61));

        let p: Value = serde_json::json!({"_type": "playlist", "id": "PL1", "title": "Lista",
            "entries": [{"id": "a", "url": "https://y/a", "title": "A", "duration": 10}, {"id": "b"}]});
        let ParseResult::Playlist(p) = parse_info("https://y/playlist?list=PL1", &p) else { panic!() };
        assert_eq!((p.kind.as_str(), p.entries.len()), ("playlist", 1));
    }
}
