//! Suscripciones (F05): un canal o una lista que se vigila y cuyos videos
//! nuevos se ponen en la cola solos, con el formato elegido al suscribirse.
//!
//! - Al suscribirse se apuntan como "vistos" los videos que ya existen: no se
//!   baja el canal entero.
//! - Cada comprobación mira solo las últimas 30 entradas.
//! - Dos comprobaciones a la vez no duplican nada: `subscription_seen` y el
//!   índice único `downloads_subscription_video`.

use std::path::Path;

use crate::commands::safe_folder_name;
use crate::db::{Db, NewDownload};
use crate::engine::Engine;
use crate::models::*;
use crate::queue::Sink;

/// Cuántas entradas recientes se miran en cada comprobación.
pub const CHECK_LAST: u32 = 30;

async fn fetch(engine: &Engine, db: &Db, url: &str) -> AppResult<PlaylistInfo> {
    let settings = db.get_settings()?;
    match engine.parse_limited(url, &settings, Some(CHECK_LAST)).await? {
        ParseResult::Playlist(p) => Ok(p),
        ParseResult::Video(_) => Err(AppError::new("not_playlist", "Solo te puedes suscribir a un canal o a una lista, no a un video suelto.")),
    }
}

pub async fn subscribe(db: &Db, engine: &Engine, url: &str, options: &DownloadOptions) -> AppResult<Subscription> {
    let info = fetch(engine, db, url).await?;
    let preset = db.save_preset(None, &format!("Suscripción: {}", info.title), options, false)?;
    let sub = match db.insert_subscription(&info.url, &info.title, &info.kind, &preset.id) {
        Ok(s) => s,
        Err(e) => {
            let _ = db.delete_preset_if_unused(&preset.id);
            return Err(e);
        }
    };
    let ids: Vec<String> = info.entries.iter().map(|e| e.id.clone()).collect();
    db.mark_seen(&sub.id, &ids)?;
    db.set_subscription_checked(&sub.id, None)?;
    Ok(db.get_subscription(&sub.id)?.expect("recién creada"))
}

/// Comprueba una suscripción y pone en la cola lo nuevo. Devuelve cuántas.
pub async fn check(db: &Db, engine: &Engine, sink: &Sink, sub: &Subscription) -> AppResult<i64> {
    let info = match fetch(engine, db, &sub.source_url).await {
        Ok(i) => i,
        Err(e) => {
            db.set_subscription_checked(&sub.id, Some(e.message.lines().next().unwrap_or("Error")))?;
            (sink)(AppEvent::SubscriptionChecked { id: sub.id.clone(), new_downloads: 0 });
            return Err(e);
        }
    };
    let seen = db.seen_ids(&sub.id)?;
    let new: Vec<&PlaylistEntry> = info.entries.iter().filter(|e| !seen.contains(&e.id)).collect();
    let base = match &sub.preset.options.output_dir {
        Some(d) if !d.trim().is_empty() => d.clone(),
        _ => db.get_settings()?.output_dir,
    };
    let dir = Path::new(&base).join(safe_folder_name(&sub.title)).to_string_lossy().into_owned();

    let mut created = 0;
    // Las listas vienen de la más nueva a la más vieja: a la cola, en orden de publicación.
    for e in new.iter().rev() {
        let n = NewDownload {
            source_url: e.url.clone(),
            video_id: Some(e.id.clone()),
            title: e.title.clone(),
            thumbnail_url: e.thumbnail.clone(),
            duration_s: e.duration_s,
            subscription_id: Some(sub.id.clone()),
            preset_id: Some(sub.preset.id.clone()),
            ..Default::default()
        };
        match db.insert_download(&n, &sub.preset.options, &dir) {
            Ok(d) => {
                created += 1;
                (sink)(AppEvent::Download { download: d });
            }
            // Otra comprobación ya lo puso en la cola.
            Err(e) if e.message.contains("UNIQUE") => {}
            Err(e) => return Err(e),
        }
    }
    let ids: Vec<String> = new.iter().map(|e| e.id.clone()).collect();
    db.mark_seen(&sub.id, &ids)?;
    db.set_subscription_checked(&sub.id, None)?;
    (sink)(AppEvent::SubscriptionChecked { id: sub.id.clone(), new_downloads: created });
    Ok(created)
}
