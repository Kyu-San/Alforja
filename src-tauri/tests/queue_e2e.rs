//! La cola de punta a punta con yt-dlp y ffmpeg de verdad, contra un servidor
//! local (scripts/test_server.py). Sin internet.
//!
//!     python3 scripts/test_server.py <carpeta-con-videos> 8766 &
//!     DESCARGADOR_TEST_SERVER=http://127.0.0.1:8766 cargo test --test queue_e2e -- --test-threads=1
//!
//! La carpeta necesita: hls/master.m3u8 (720p + 360p + audio aparte),
//! clip1.mp4, big.mp4 y big2.mp4 (unos 5 MB cada uno) y feed.xml (RSS con clip1 y clip2).
//! Sin DESCARGADOR_TEST_SERVER, las pruebas se saltan.

use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use descargador_lib::db::{Db, NewDownload};
use descargador_lib::engine::Engine;
use descargador_lib::models::*;
use descargador_lib::queue::{Ctx, Queue, Stop};

struct Harness {
    db: Arc<Db>,
    queue: Queue,
    events: Arc<Mutex<Vec<AppEvent>>>,
    dir: tempfile::TempDir,
    server: String,
}

fn harness() -> Option<Harness> {
    let server = std::env::var("DESCARGADOR_TEST_SERVER").ok()?;
    std::env::set_var("NO_PROXY", "127.0.0.1,localhost");
    std::env::set_var("no_proxy", "127.0.0.1,localhost");
    let dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Db::open(&dir.path().join("t.sqlite3")).unwrap());
    db.ensure_settings(&dir.path().join("out").to_string_lossy()).unwrap();
    let engine = Engine::locate(None).expect("yt-dlp en el PATH");
    let events = Arc::new(Mutex::new(Vec::new()));
    let ev = events.clone();
    let queue = Queue::start(Ctx {
        db: db.clone(),
        engine: Arc::new(RwLock::new(Some(engine))),
        sink: Arc::new(move |e| ev.lock().unwrap().push(e)),
    });
    Some(Harness { db, queue, events, dir, server })
}

impl Harness {
    fn add(&self, path: &str, kind: Kind, container: &str, quality: &str) -> Download {
        let o = DownloadOptions {
            kind,
            container: container.into(),
            quality: quality.into(),
            audio_lang: None,
            subtitle_langs: vec![],
            subtitles_embedded: false,
            output_dir: None,
        };
        let out = self.db.get_settings().unwrap().output_dir;
        let d = self.db.insert_download(&NewDownload { source_url: format!("{}{}", self.server, path), ..Default::default() }, &o, &out).unwrap();
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
