pub mod commands;
pub mod db;
pub mod engine;
pub mod models;
pub mod queue;
pub mod updater;

use std::sync::{Arc, RwLock};

use tauri::{Emitter, Manager};

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = Arc::new(db::Db::open(&data_dir.join("descargador.sqlite3"))?);
            db.ensure_settings(&queue::default_output_dir().to_string_lossy())?;
            let recovered = db.recover_on_start()?;
            if recovered > 0 {
                eprintln!("{recovered} descargas a medias vuelven a la cola");
            }
            let bin_dir = data_dir.join("bin");
            let engine = Arc::new(RwLock::new(engine::Engine::locate(Some(&bin_dir))));
            let handle = app.handle().clone();
            let sink: queue::Sink = Arc::new(move |ev| {
                let _ = handle.emit("app-event", ev);
            });
            let q = queue::Queue::start(queue::Ctx { db: db.clone(), engine: engine.clone(), sink: sink.clone() });
            q.wake();
            app.manage(AppState::new(db, engine, q, bin_dir, sink));
            // Motor: instalar si falta, comprobar una vez al día. Sin bloquear el arranque.
            let h = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = h.state::<AppState>();
                commands::startup_engine_check(&state).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::parse_url,
            commands::start_download,
            commands::start_playlist_download,
            commands::list_downloads,
            commands::pause_download,
            commands::resume_download,
            commands::cancel_download,
            commands::retry_download,
            commands::remove_download,
            commands::clear_finished,
            commands::open_file,
            commands::reveal_in_folder,
            commands::get_settings,
            commands::update_settings,
            commands::engine_status,
            commands::engine_check,
            commands::engine_update,
            commands::engine_rollback,
        ])
        .run(tauri::generate_context!())
        .expect("no se pudo arrancar la app");
}
