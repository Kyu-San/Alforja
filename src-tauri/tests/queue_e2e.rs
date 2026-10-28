//! La cola de punta a punta con yt-dlp y ffmpeg de verdad, contra un servidor
//! local (scripts/test_server.py). Sin internet.
//!
//!     python3 scripts/test_server.py <carpeta-con-videos> 8766 &
//!     ALFORJA_TEST_SERVER=http://127.0.0.1:8766 cargo test --test queue_e2e -- --test-threads=1
//!
//! La carpeta la genera `scripts/make_fixtures.sh <carpeta> 8766`.
//! Sin ALFORJA_TEST_SERVER, las pruebas se saltan.

use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use alforja_lib::db::{Db, NewDownload};
use alforja_lib::engine::Engine;
use alforja_lib::models::*;
use alforja_lib::queue::{Ctx, Queue, Stop};

fn opts(kind: Kind, container: &str, quality: &str) -> DownloadOptions {
    DownloadOptions {
        kind,
        container: container.into(),
        quality: quality.into(),
        audio_lang: None,
        subtitle_langs: vec![],
        subtitles_embedded: false,
        output_dir: None,
    }
}

struct Harness {
    db: Arc<Db>,
    queue: Queue,
    events: Arc<Mutex<Vec<AppEvent>>>,
    dir: tempfile::TempDir,
    server: String,
}

fn harness() -> Option<Harness> {
    harness_with(true)
}

fn harness_with(with_engine: bool) -> Option<Harness> {
    let server = std::env::var("ALFORJA_TEST_SERVER").ok()?;
    std::env::set_var("NO_PROXY", "127.0.0.1,localhost");
    std::env::set_var("no_proxy", "127.0.0.1,localhost");
    let dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Db::open(&dir.path().join("t.sqlite3")).unwrap());
    db.ensure_settings(&dir.path().join("out").to_string_lossy()).unwrap();
    let engine = if with_engine { Some(Engine::locate(None).expect("yt-dlp en el PATH")) } else { None };
    let events = Arc::new(Mutex::new(Vec::new()));
    let ev = events.clone();
    let queue = Queue::start(Ctx {
        db: db.clone(),
        engine: Arc::new(RwLock::new(engine)),
        sink: Arc::new(move |e| ev.lock().unwrap().push(e)),
    });
    Some(Harness { db, queue, events, dir, server })
}

impl Harness {
    fn add(&self, path: &str, kind: Kind, container: &str, quality: &str) -> Download {
        let out = self.db.get_settings().unwrap().output_dir;
        self.add_with(path, opts(kind, container, quality), &out)
    }

    fn add_with(&self, path: &str, o: DownloadOptions, out: &str) -> Download {
        let url = if path.starts_with("http") { path.to_string() } else { format!("{}{}", self.server, path) };
        let d = self.db.insert_download(&NewDownload { source_url: url, ..Default::default() }, &o, out).unwrap();
        self.queue.wake();
        d
    }

    fn wait_for(&self, id: &str, pred: impl Fn(&Download) -> bool, secs: u64) -> Download {
        let t = Instant::now();
        loop {
            let d = self.db.get_download(id).unwrap().expect("existe");
            if pred(&d) {
                return d;
            }
            assert!(t.elapsed() < Duration::from_secs(secs), "tiempo agotado; estado {:?} {:?}", d.status, d.error_message);
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    fn statuses(&self, id: &str) -> Vec<Status> {
        let mut v: Vec<Status> = Vec::new();
        for e in self.events.lock().unwrap().iter() {
            if let AppEvent::Download { download } = e {
                if download.id == id && v.last() != Some(&download.status) {
                    v.push(download.status);
                }
            }
        }
        v
    }

    fn partial_files(&self) -> Vec<String> {
        let out = self.dir.path().join("out");
        std::fs::read_dir(out)
            .map(|r| r.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| n.ends_with(".part") || n.ends_with(".ytdl")).collect())
            .unwrap_or_default()
    }
}

#[test]
fn video_merges_and_reports_real_quality() {
    let Some(h) = harness() else { return };
    // Pide 1080p; la fuente solo tiene 720p: cae a 720p y lo dice.
    let d = h.add("/hls/master.m3u8", Kind::Video, "mkv", "1080p");
    let d = h.wait_for(&d.id, |d| d.status.is_finished(), 60);
    assert_eq!(d.status, Status::Done, "{:?}", d.error_message);
    let path = d.output_path.clone().unwrap();
    assert!(path.ends_with(".mkv") && std::path::Path::new(&path).is_file());
    assert_eq!(d.actual_quality.as_deref(), Some("720p"));
    assert!(d.size_bytes.unwrap() > 0);
    let st = h.statuses(&d.id);
    assert_eq!(st.first(), Some(&Status::Downloading));
    assert_eq!(st.last(), Some(&Status::Done));
    assert!(st.contains(&Status::Processing), "la unión con ffmpeg se ve como 'processing': {st:?}");
    assert!(h.events.lock().unwrap().iter().any(|e| matches!(e, AppEvent::Progress { id, .. } if id == &d.id)));
    // El título llega con los metadatos del propio yt-dlp.
    assert_eq!(d.title.as_deref(), Some("master"));
}

#[test]
fn audio_is_extracted_to_mp3() {
    let Some(h) = harness() else { return };
    let d = h.add("/clip1.mp4", Kind::Audio, "mp3", "192k");
    let d = h.wait_for(&d.id, |d| d.status.is_finished(), 60);
    assert_eq!(d.status, Status::Done, "{:?}", d.error_message);
    assert!(d.output_path.unwrap().ends_with(".mp3"));
}

#[test]
fn errors_are_classified_and_retry_counts() {
    let Some(h) = harness() else { return };
    let d = h.add("/no-existe.mp4", Kind::Video, "mp4", "best");
    let d = h.wait_for(&d.id, |d| d.status.is_finished(), 60);
    assert_eq!((d.status, d.error_code.as_deref()), (Status::Error, Some("unavailable")));
    assert!(d.error_message.unwrap().starts_with("El video ya no existe"));
    h.db.requeue(&d.id, true).unwrap();
    h.queue.wake();
    let d = h.wait_for(&d.id, |d| d.status == Status::Error && d.attempts == 1, 60);
    assert_eq!(d.attempts, 1);
}

#[test]
fn pause_resume_and_cancel_midway() {
    let Some(h) = harness() else { return };
    let rt = tokio::runtime::Runtime::new().unwrap();

    // Pausar a mitad y reanudar: continúa y termina.
    let d = h.add("/slow/big.mp4", Kind::Video, "mp4", "best");
    h.wait_for(&d.id, |d| d.downloaded_bytes > 300_000, 30);
    rt.block_on(h.queue.stop(&d.id, Stop::Pause)).unwrap();
    let p = h.wait_for(&d.id, |d| d.status == Status::Paused, 10);
    assert!(!h.partial_files().is_empty(), "el .part se queda para continuar");
    let before = p.downloaded_bytes;
    h.db.set_status(&d.id, Status::Queued).unwrap();
    h.queue.wake();
    let d2 = h.wait_for(&d.id, |d| d.status == Status::Done, 60);
    assert!(before > 0 && d2.size_bytes.unwrap() > 5_000_000);

    // Cancelar a mitad: queda 'cancelled' y sin archivos temporales.
    let c = h.add("/slow/big2.mp4", Kind::Video, "mp4", "best");
    h.wait_for(&c.id, |d| d.downloaded_bytes > 200_000, 30);
    rt.block_on(h.queue.stop(&c.id, Stop::Cancel)).unwrap();
    h.wait_for(&c.id, |d| d.status == Status::Cancelled, 10);
    std::thread::sleep(Duration::from_millis(500));
    assert!(h.partial_files().is_empty(), "quedan temporales: {:?}", h.partial_files());

    // Quitar y borrar el archivo de una terminada.
    let path = d2.output_path.clone().unwrap();
    rt.block_on(h.queue.stop(&d2.id, Stop::Remove { delete_file: true })).unwrap();
    assert!(h.db.get_download(&d2.id).unwrap().is_none());
    assert!(!std::path::Path::new(&path).exists());
}

#[test]
fn concurrency_limit_is_respected() {
    let Some(h) = harness() else { return };
    h.db.update_settings(&SettingsPatch { max_concurrent: Some(1), ..Default::default() }).unwrap();
    let a = h.add("/slow/big.mp4?a=1", Kind::Video, "mp4", "best");
    let b = h.add("/clip1.mp4", Kind::Video, "mp4", "best");
    h.wait_for(&a.id, |d| d.status == Status::Downloading, 10);
    std::thread::sleep(Duration::from_millis(800));
    assert_eq!(h.db.get_download(&b.id).unwrap().unwrap().status, Status::Queued, "con 1 a la vez, la segunda espera");
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(h.queue.stop(&a.id, Stop::Cancel)).unwrap();
    let b = h.wait_for(&b.id, |d| d.status.is_finished(), 60);
    assert_eq!(b.status, Status::Done, "{:?}", b.error_message);
}

#[test]
fn playlist_parses_and_downloads_each_entry() {
    let Some(h) = harness() else { return };
    let engine = Engine::locate(None).unwrap();
    let settings = h.db.get_settings().unwrap();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let ParseResult::Playlist(info) = rt.block_on(engine.parse(&format!("{}/feed.xml", h.server), &settings)).unwrap() else {
        panic!("el RSS debería verse como lista")
    };
    assert_eq!(info.title, "Lista de prueba");
    assert_eq!(info.entries.len(), 2);
    let o = DownloadOptions { kind: Kind::Video, container: "mp4".into(), quality: "best".into(), audio_lang: None, subtitle_langs: vec![], subtitles_embedded: false, output_dir: None };
    let out = h.dir.path().join("out").join("Lista de prueba");
    let ds = h.db.insert_playlist(&info, &info.entries[..1], &o, &out.to_string_lossy()).unwrap();
    h.queue.wake();
    let d = h.wait_for(&ds[0].id, |d| d.status.is_finished(), 60);
    assert_eq!(d.status, Status::Done, "{:?}", d.error_message);
    assert!(d.output_path.unwrap().contains("Lista de prueba"));
    assert_eq!(d.title.as_deref(), Some("Primer clip"));
}

#[test]
fn f01_e3_e4_long_titles_emoji_and_accents() {
    let Some(h) = harness() else { return };
    // Carpeta con acentos, espacios y emoji.
    let out = h.dir.path().join("Música y vídeos 🎬");
    let out = out.to_string_lossy().into_owned();
    let a = h.add_with("/emoji.html", opts(Kind::Video, "mp4", "best"), &out);
    let b = h.add_with("/long.html", opts(Kind::Video, "mp4", "best"), &out);
    let a = h.wait_for(&a.id, |d| d.status.is_finished(), 60);
    let b = h.wait_for(&b.id, |d| d.status.is_finished(), 60);
    assert_eq!(a.status, Status::Done, "{:?}", a.error_message);
    assert_eq!(b.status, Status::Done, "{:?}", b.error_message);
    let pa = std::path::PathBuf::from(a.output_path.unwrap());
    assert!(pa.is_file() && pa.starts_with(&out));
    assert!(pa.file_name().unwrap().to_string_lossy().contains("Canción de cuna — ñandú"), "{pa:?}");
    assert_eq!(a.title.as_deref(), Some("🎬 Canción de cuna — ñandú & «comillas» (1)"));
    let pb = std::path::PathBuf::from(b.output_path.unwrap());
    let name = pb.file_name().unwrap().to_string_lossy().into_owned();
    assert!(pb.is_file());
    assert!(name.len() <= 255, "nombre de {} bytes", name.len());
}

#[test]
fn f01_e8_closing_the_app_midway_resumes_from_the_part_file() {
    let Some(h) = harness() else { return };
    let rt = tokio::runtime::Runtime::new().unwrap();
    let d = h.add("/slow/big3.mp4", Kind::Video, "mp4", "best");
    h.wait_for(&d.id, |d| d.downloaded_bytes > 600_000, 30);
    rt.block_on(h.queue.stop(&d.id, Stop::Pause)).unwrap();
    h.wait_for(&d.id, |d| d.status == Status::Paused, 10);
    // Como si la app se hubiera cerrado a mitad: quedó "downloading" en la base de datos.
    h.db.set_status(&d.id, Status::Downloading).unwrap();
    // Reabrir: misma base de datos, cola nueva.
    let db2 = Arc::new(Db::open(&h.dir.path().join("t.sqlite3")).unwrap());
    assert_eq!(db2.recover_on_start().unwrap(), 1);
    let events = Arc::new(Mutex::new(Vec::new()));
    let ev = events.clone();
    let q2 = Queue::start(Ctx {
        db: db2.clone(),
        engine: Arc::new(RwLock::new(Engine::locate(None))),
        sink: Arc::new(move |e| ev.lock().unwrap().push(e)),
    });
    q2.wake();
    let t = Instant::now();
    loop {
        let x = db2.get_download(&d.id).unwrap().unwrap();
        if x.status.is_finished() {
            assert_eq!(x.status, Status::Done, "{:?}", x.error_message);
            break;
        }
        assert!(t.elapsed() < Duration::from_secs(60));
        std::thread::sleep(Duration::from_millis(100));
    }
    let first = events.lock().unwrap().iter().find_map(|e| match e {
        AppEvent::Progress { downloaded_bytes, .. } => Some(*downloaded_bytes),
        _ => None,
    });
    assert!(first.unwrap_or(0) >= 500_000, "continúa desde el .part, no desde cero: {first:?}");
}

#[test]
fn f01_e10_offline_is_a_network_error() {
    let Some(h) = harness() else { return };
    let d = h.add("http://127.0.0.1:9/video.mp4", Kind::Video, "mp4", "best");
    let d = h.wait_for(&d.id, |d| d.status.is_finished(), 60);
    assert_eq!((d.status, d.error_code.as_deref()), (Status::Error, Some("network")));
}

#[test]
fn f01_e11_already_downloaded_finishes_with_the_same_file() {
    let Some(h) = harness() else { return };
    let a = h.add("/clip2.mp4", Kind::Video, "mp4", "best");
    let a = h.wait_for(&a.id, |d| d.status.is_finished(), 60);
    let b = h.add("/clip2.mp4", Kind::Video, "mp4", "best");
    let b = h.wait_for(&b.id, |d| d.status.is_finished(), 60);
    assert_eq!(b.status, Status::Done);
    assert_eq!(a.output_path, b.output_path);
}

#[test]
fn f01_n4_unwritable_folder_is_a_clear_error() {
    let Some(h) = harness() else { return };
    // Una "carpeta" dentro de un archivo: no se puede crear (también como root).
    let file = h.dir.path().join("soy-un-archivo");
    std::fs::write(&file, b"x").unwrap();
    let out = file.join("destino").to_string_lossy().into_owned();
    let d = h.add_with("/clip1.mp4", opts(Kind::Video, "mp4", "best"), &out);
    let d = h.wait_for(&d.id, |d| d.status.is_finished(), 30);
    assert_eq!((d.status, d.error_code.as_deref()), (Status::Error, Some("output_dir")));
    assert!(d.error_message.unwrap().starts_with("No se puede escribir en la carpeta"));
}

#[test]
fn f01_n5_without_engine_the_row_says_so() {
    let Some(h) = harness_with(false) else { return };
    let d = h.add("/clip1.mp4", Kind::Video, "mp4", "best");
    let d = h.wait_for(&d.id, |d| d.status.is_finished(), 10);
    assert_eq!((d.status, d.error_code.as_deref()), (Status::Error, Some("engine_missing")));
}

#[test]
fn f02_e1_m4a_and_ogg() {
    let Some(h) = harness() else { return };
    let a = h.add("/clip1.mp4", Kind::Audio, "m4a", "128k");
    let b = h.add("/clip2.mp4", Kind::Audio, "ogg", "best");
    for (d, ext) in [(a, ".m4a"), (b, ".ogg")] {
        let d = h.wait_for(&d.id, |d| d.status.is_finished(), 60);
        assert_eq!(d.status, Status::Done, "{ext}: {:?}", d.error_message);
        assert!(d.output_path.unwrap().ends_with(ext));
    }
}

#[test]
fn f06_h2_subtitles_as_srt_and_embedded() {
    let Some(h) = harness() else { return };
    let out = h.db.get_settings().unwrap().output_dir;
    let mut o = opts(Kind::Video, "mkv", "best");
    o.subtitle_langs = vec!["es".into()];
    let d = h.add_with("/subs.html", o.clone(), &out);
    let d = h.wait_for(&d.id, |d| d.status.is_finished(), 60);
    assert_eq!(d.status, Status::Done, "{:?}", d.error_message);
    let video = d.output_path.unwrap();
    let srt = format!("{}.es.srt", video.trim_end_matches(".mkv"));
    let text = std::fs::read_to_string(&srt).unwrap_or_else(|_| panic!("falta {srt}"));
    assert!(text.contains("Segunda línea, con acentos: ñ á é."));
    assert!(!std::path::Path::new(&format!("{}.en.srt", video.trim_end_matches(".mkv"))).exists(), "solo el idioma pedido");

    // Incrustados: el .mkv lleva una pista de subtítulos.
    std::fs::remove_file(&video).unwrap();
    o.subtitles_embedded = true;
    let e = h.add_with("/subs.html", o, &out);
    let e = h.wait_for(&e.id, |d| d.status.is_finished(), 60);
    assert_eq!(e.status, Status::Done, "{:?}", e.error_message);
    let probe = std::process::Command::new("ffprobe")
        .args(["-v", "error", "-select_streams", "s", "-show_entries", "stream=index", "-of", "csv=p=0"])
        .arg(e.output_path.unwrap())
        .output()
        .unwrap();
    assert!(!String::from_utf8_lossy(&probe.stdout).trim().is_empty(), "el video no tiene pista de subtítulos");
}

#[test]
fn f07_e2_rapid_pause_resume_ends_well() {
    let Some(h) = harness() else { return };
    let rt = tokio::runtime::Runtime::new().unwrap();
    let d = h.add("/slow/big4.mp4", Kind::Video, "mp4", "best");
    for _ in 0..5 {
        h.wait_for(&d.id, |d| d.status == Status::Downloading, 20);
        std::thread::sleep(Duration::from_millis(150));
        rt.block_on(h.queue.stop(&d.id, Stop::Pause)).unwrap();
        h.wait_for(&d.id, |d| d.status == Status::Paused, 10);
        h.db.set_status(&d.id, Status::Queued).unwrap();
        h.queue.wake();
    }
    let d = h.wait_for(&d.id, |d| d.status.is_finished(), 90);
    assert_eq!(d.status, Status::Done, "{:?}", d.error_message);
    assert_eq!(h.db.list_downloads(None).unwrap().len(), 1);
    assert!(h.partial_files().is_empty(), "quedan temporales: {:?}", h.partial_files());
    let size = std::fs::metadata(d.output_path.unwrap()).unwrap().len();
    assert!(size > 5_000_000, "archivo completo: {size}");
}

#[test]
fn f07_e3_remove_while_downloading() {
    let Some(h) = harness() else { return };
    let rt = tokio::runtime::Runtime::new().unwrap();
    let d = h.add("/slow/big5.mp4", Kind::Video, "mp4", "best");
    h.wait_for(&d.id, |d| d.downloaded_bytes > 200_000, 30);
    rt.block_on(h.queue.stop(&d.id, Stop::Remove { delete_file: true })).unwrap();
    let t = Instant::now();
    while h.db.get_download(&d.id).unwrap().is_some() {
        assert!(t.elapsed() < Duration::from_secs(10), "la fila sigue ahí");
        std::thread::sleep(Duration::from_millis(100));
    }
    std::thread::sleep(Duration::from_millis(500));
    assert!(h.partial_files().is_empty(), "quedan temporales: {:?}", h.partial_files());
    assert!(h.events.lock().unwrap().iter().any(|e| matches!(e, AppEvent::Removed { id } if id == &d.id)));
}
