//! Suscripciones con yt-dlp real: un RSS servido aquí mismo, que va
//! "publicando" videos nuevos, con enlaces a los clips de scripts/test_server.py.
//!
//!     ALFORJA_TEST_SERVER=http://127.0.0.1:8766 cargo test --test subscriptions_e2e

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use alforja_lib::db::Db;
use alforja_lib::engine::Engine;
use alforja_lib::models::*;
use alforja_lib::queue::{Ctx, Queue, Sink};
use alforja_lib::subscriptions;

/// Un RSS que cambia: cada item es (guid, archivo del servidor de clips).
static FEED_DOWN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn feed_server(items: Arc<Mutex<Vec<(String, String)>>>, clips: String) -> String {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = format!("http://{}", l.local_addr().unwrap());
    std::thread::spawn(move || {
        for s in l.incoming().flatten() {
            let mut r = BufReader::new(&s);
            let mut line = String::new();
            loop {
                let mut h = String::new();
                if r.read_line(&mut h).unwrap_or(0) <= 2 {
                    break;
                }
                line.push_str(&h);
            }
            let body = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Canal de prueba</title><link>{clips}/</link>{}</channel></rss>"#,
                items
                    .lock()
                    .unwrap()
                    .iter()
                    .rev() // lo más nuevo primero, como los canales
                    .map(|(g, f)| format!(r#"<item><title>Video {g}</title><guid>{g}</guid><enclosure url="{clips}/{f}" type="video/mp4" length="1"/></item>"#))
                    .collect::<String>()
            );
            let mut s = &s;
            if FEED_DOWN.load(std::sync::atomic::Ordering::SeqCst) {
                let _ = write!(s, "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                continue;
            }
            let _ = write!(s, "HTTP/1.1 200 OK\r\nContent-Type: application/rss+xml\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
        }
    });
    format!("{addr}/canal.xml")
}

struct H {
    db: Arc<Db>,
    engine: Engine,
    sink: Sink,
    queue: Queue,
    dir: tempfile::TempDir,
    items: Arc<Mutex<Vec<(String, String)>>>,
    feed: String,
}

fn setup() -> Option<H> {
    let clips = std::env::var("ALFORJA_TEST_SERVER").ok()?;
    std::env::set_var("NO_PROXY", "127.0.0.1,localhost");
    std::env::set_var("no_proxy", "127.0.0.1,localhost");
    let dir = tempfile::tempdir().unwrap();
    let db = Arc::new(Db::open(&dir.path().join("t.sqlite3")).unwrap());
    db.ensure_settings(&dir.path().join("out").to_string_lossy()).unwrap();
    let engine = Engine::locate(None).expect("yt-dlp en el PATH");
    let sink: Sink = Arc::new(|_| {});
    let queue = Queue::start(Ctx { db: db.clone(), engine: Arc::new(RwLock::new(Some(engine.clone()))), sink: sink.clone() });
    let items = Arc::new(Mutex::new(vec![("c1".to_string(), "clip1.mp4".to_string()), ("c2".to_string(), "clip2.mp4".to_string())]));
    let feed = feed_server(items.clone(), clips);
    Some(H { db, engine, sink, queue, dir, items, feed })
}

fn opts() -> DownloadOptions {
    DownloadOptions { kind: Kind::Audio, container: "mp3".into(), quality: "128k".into(), audio_lang: None, subtitle_langs: vec![], subtitles_embedded: false, output_dir: None }
}

#[tokio::test(flavor = "multi_thread")]
async fn subscribe_skips_existing_and_queues_only_new_videos() {
    let Some(h) = setup() else { return };

    // Suscribirse no baja lo que ya existe.
    let sub = subscriptions::subscribe(&h.db, &h.engine, &h.feed, &opts()).await.unwrap();
    assert_eq!((sub.title.as_str(), sub.kind.as_str()), ("Canal de prueba", "playlist"));
    assert_eq!(h.db.seen_ids(&sub.id).unwrap().len(), 2);
    assert_eq!(subscriptions::check(&h.db, &h.engine, &h.sink, &sub).await.unwrap(), 0);
    assert!(h.db.list_downloads(None).unwrap().is_empty());

    // Se publica uno nuevo: solo ese va a la cola, con el formato de la suscripción.
    h.items.lock().unwrap().push(("c3".into(), "clip2.mp4".into()));
    assert_eq!(subscriptions::check(&h.db, &h.engine, &h.sink, &sub).await.unwrap(), 1);
    let ds = h.db.list_downloads(None).unwrap();
    assert_eq!(ds.len(), 1);
    assert_eq!((ds[0].kind, ds[0].container.as_str(), ds[0].subscription_id.as_deref()), (Kind::Audio, "mp3", Some(sub.id.as_str())));
    assert!(ds[0].output_dir.ends_with("Canal de prueba"));

    // Y se descarga de verdad.
    h.queue.wake();
    let t = Instant::now();
    let d = loop {
        let d = h.db.get_download(&ds[0].id).unwrap().unwrap();
        if d.status.is_finished() {
            break d;
        }
        assert!(t.elapsed() < Duration::from_secs(60));
        tokio::time::sleep(Duration::from_millis(100)).await;
    };
    assert_eq!(d.status, Status::Done, "{:?}", d.error_message);
    assert!(d.output_path.unwrap().ends_with(".mp3"));

    // Dos comprobaciones a la vez no duplican.
    h.items.lock().unwrap().push(("c4".into(), "clip1.mp4".into()));
    let (a, b) = tokio::join!(
        subscriptions::check(&h.db, &h.engine, &h.sink, &sub),
        subscriptions::check(&h.db, &h.engine, &h.sink, &sub)
    );
    assert_eq!(a.unwrap() + b.unwrap(), 1);
    assert_eq!(h.db.list_downloads(None).unwrap().len(), 2);
    assert_eq!(h.db.get_subscription(&sub.id).unwrap().unwrap().download_count, 2);
}

#[tokio::test(flavor = "multi_thread")]
async fn rules_and_unsubscribe() {
    let Some(h) = setup() else { return };
    let clip = format!("{}/clip1.mp4", std::env::var("ALFORJA_TEST_SERVER").unwrap());
    assert_eq!(subscriptions::subscribe(&h.db, &h.engine, &clip, &opts()).await.unwrap_err().code, "not_playlist");

    let sub = subscriptions::subscribe(&h.db, &h.engine, &h.feed, &opts()).await.unwrap();
    assert_eq!(subscriptions::subscribe(&h.db, &h.engine, &h.feed, &opts()).await.unwrap_err().code, "already_subscribed");
    // El intento fallido no deja formatos huérfanos.
    let presets: i64 = rusqlite::Connection::open(h.dir.path().join("t.sqlite3")).unwrap().query_row("select count(*) from presets", [], |r| r.get(0)).unwrap();
    assert_eq!(presets, 1);

    // Pausar la suscripción la saca de las pendientes.
    h.db.set_subscription_enabled(&sub.id, false).unwrap();
    assert!(h.db.due_subscriptions(0).unwrap().is_empty());
    h.db.set_subscription_enabled(&sub.id, true).unwrap();
    assert_eq!(h.db.due_subscriptions(0).unwrap().len(), 1);
    assert!(h.db.due_subscriptions(6).unwrap().is_empty(), "recién comprobada: aún no toca");

    // Darse de baja deja las descargas y borra su formato.
    h.items.lock().unwrap().push(("c3".into(), "clip2.mp4".into()));
    subscriptions::check(&h.db, &h.engine, &h.sink, &sub).await.unwrap();
    h.db.delete_subscription(&sub.id).unwrap();
    assert!(h.db.list_subscriptions().unwrap().is_empty());
    let left = h.db.list_downloads(None).unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].subscription_id, None);
    assert!(h.db.get_preset(&sub.preset.id).unwrap().is_none());
}

#[tokio::test(flavor = "multi_thread")]
async fn f05_e7_a_failing_source_is_recorded_and_recovers() {
    let Some(h) = setup() else { return };
    let sub = subscriptions::subscribe(&h.db, &h.engine, &h.feed, &opts()).await.unwrap();
    h.items.lock().unwrap().push(("c3".into(), "clip2.mp4".into()));

    FEED_DOWN.store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(subscriptions::check(&h.db, &h.engine, &h.sink, &sub).await.is_err());
    let s = h.db.get_subscription(&sub.id).unwrap().unwrap();
    assert!(s.last_error.is_some(), "el fallo queda apuntado para S05");
    assert!(h.db.list_downloads(None).unwrap().is_empty());

    // Vuelve la fuente: el video que se publicó mientras tanto no se pierde.
    FEED_DOWN.store(false, std::sync::atomic::Ordering::SeqCst);
    assert_eq!(subscriptions::check(&h.db, &h.engine, &h.sink, &sub).await.unwrap(), 1);
    assert_eq!(h.db.get_subscription(&sub.id).unwrap().unwrap().last_error, None);
}
