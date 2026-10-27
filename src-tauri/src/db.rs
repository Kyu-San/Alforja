//! Acceso a SQLite. Una conexión detrás de un Mutex: la app es de un solo
//! usuario y las escrituras son pocas y cortas.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::models::*;

const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/0001_init.sql"),
    include_str!("../migrations/0002_actual_quality.sql"),
    include_str!("../migrations/0003_engine_latest.sql"),
    include_str!("../migrations/0004_subscription_seen.sql"),
];

const DOWNLOAD_COLUMNS: &str = "id, source_url, video_id, extractor, title, uploader, thumbnail_url, duration_s, \
    kind, container, quality, actual_quality, audio_lang, subtitle_langs, subtitles_embedded, output_dir, \
    output_path, size_bytes, downloaded_bytes, status, error_code, error_message, attempts, position, \
    playlist_id, subscription_id, preset_id, created_at, finished_at";

pub struct Db {
    conn: Mutex<Connection>,
}

/// Datos de una descarga nueva (lo demás tiene valor por defecto).
#[derive(Debug, Clone, Default)]
pub struct NewDownload {
    pub source_url: String,
    pub video_id: Option<String>,
    pub extractor: Option<String>,
    pub title: Option<String>,
    pub uploader: Option<String>,
    pub thumbnail_url: Option<String>,
    pub duration_s: Option<i64>,
    pub size_bytes: Option<i64>,
    pub playlist_id: Option<String>,
    pub subscription_id: Option<String>,
    pub preset_id: Option<String>,
}

fn now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn row_to_download(r: &Row) -> rusqlite::Result<Download> {
    let subs: String = r.get(13)?;
    Ok(Download {
        id: r.get(0)?,
        source_url: r.get(1)?,
        video_id: r.get(2)?,
        extractor: r.get(3)?,
        title: r.get(4)?,
        uploader: r.get(5)?,
        thumbnail_url: r.get(6)?,
        duration_s: r.get(7)?,
        kind: Kind::parse(&r.get::<_, String>(8)?),
        container: r.get(9)?,
        quality: r.get(10)?,
        actual_quality: r.get(11)?,
        audio_lang: r.get(12)?,
        subtitle_langs: serde_json::from_str(&subs).unwrap_or_default(),
        subtitles_embedded: r.get::<_, i64>(14)? == 1,
        output_dir: r.get(15)?,
        output_path: r.get(16)?,
        size_bytes: r.get(17)?,
        downloaded_bytes: r.get(18)?,
        status: Status::parse(&r.get::<_, String>(19)?),
        error_code: r.get(20)?,
        error_message: r.get(21)?,
        attempts: r.get(22)?,
        position: r.get(23)?,
        playlist_id: r.get(24)?,
        subscription_id: r.get(25)?,
        preset_id: r.get(26)?,
        created_at: r.get(27)?,
        finished_at: r.get(28)?,
    })
}

fn row_to_preset(r: &Row) -> rusqlite::Result<Preset> {
    let subs: String = r.get(6)?;
    Ok(Preset {
        id: r.get(0)?,
        name: r.get(1)?,
        options: DownloadOptions {
            kind: Kind::parse(&r.get::<_, String>(2)?),
            container: r.get(3)?,
            quality: r.get(4)?,
            audio_lang: r.get(5)?,
            subtitle_langs: serde_json::from_str(&subs).unwrap_or_default(),
            subtitles_embedded: r.get::<_, i64>(7)? == 1,
            output_dir: r.get(8)?,
        },
        is_smart_mode: r.get::<_, i64>(9)? == 1,
    })
}

fn row_to_settings(r: &Row) -> rusqlite::Result<Settings> {
    Ok(Settings {
        output_dir: r.get(0)?,
        max_concurrent: r.get(1)?,
        ui_language: r.get(2)?,
        theme: r.get(3)?,
        proxy_url: r.get(4)?,
        filename_template: r.get(5)?,
        cookies_browser: r.get(6)?,
        subscription_every_h: r.get(7)?,
        engine_auto_update: r.get::<_, i64>(8)? == 1,
        notify_on_finish: r.get::<_, i64>(9)? == 1,
    })
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Db> {
        Self::init(Connection::open(path)?)
    }

    pub fn open_in_memory() -> AppResult<Db> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> AppResult<Db> {
        conn.pragma_update(None, "foreign_keys", "on")?;
        // En memoria (pruebas) devuelve "memory": no es un error.
        let _: String = conn.pragma_update_and_check(None, "journal_mode", "wal", |r| r.get(0))?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
        for (i, sql) in MIGRATIONS.iter().enumerate() {
            let v = i as i64 + 1;
            if version < v {
                conn.execute_batch(&format!("begin; {sql}\n; pragma user_version = {v}; commit;"))?;
            }
        }
        Ok(Db { conn: Mutex::new(conn) })
    }

    fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    // ---------- ajustes ----------

    pub fn ensure_settings(&self, default_output_dir: &str) -> AppResult<()> {
        self.conn().execute(
            "insert into settings (id, output_dir) values (1, ?1) on conflict(id) do nothing",
            params![default_output_dir],
        )?;
        Ok(())
    }

    pub fn get_settings(&self) -> AppResult<Settings> {
        Ok(self.conn().query_row(
            "select output_dir, max_concurrent, ui_language, theme, proxy_url, filename_template, \
             cookies_browser, subscription_every_h, engine_auto_update, notify_on_finish from settings where id = 1",
            [],
            row_to_settings,
        )?)
    }

    pub fn update_settings(&self, p: &SettingsPatch) -> AppResult<Settings> {
        {
            let c = self.conn();
            let empty_to_null = |v: &Option<String>| v.as_ref().map(|s| if s.trim().is_empty() { None } else { Some(s.trim().to_string()) });
            if let Some(v) = &p.output_dir { c.execute("update settings set output_dir = ?1 where id = 1", [v])?; }
            if let Some(v) = p.max_concurrent { c.execute("update settings set max_concurrent = ?1 where id = 1", [v])?; }
            if let Some(v) = &p.ui_language { c.execute("update settings set ui_language = ?1 where id = 1", [v])?; }
            if let Some(v) = &p.theme { c.execute("update settings set theme = ?1 where id = 1", [v])?; }
            if let Some(v) = empty_to_null(&p.proxy_url) { c.execute("update settings set proxy_url = ?1 where id = 1", [v])?; }
            if let Some(v) = &p.filename_template { c.execute("update settings set filename_template = ?1 where id = 1", [v])?; }
            if let Some(v) = empty_to_null(&p.cookies_browser) { c.execute("update settings set cookies_browser = ?1 where id = 1", [v])?; }
            if let Some(v) = p.subscription_every_h { c.execute("update settings set subscription_every_h = ?1 where id = 1", [v])?; }
            if let Some(v) = p.engine_auto_update { c.execute("update settings set engine_auto_update = ?1 where id = 1", [v as i64])?; }
            if let Some(v) = p.notify_on_finish { c.execute("update settings set notify_on_finish = ?1 where id = 1", [v as i64])?; }
        }
        self.get_settings()
    }

    /// (versión instalada, versión anterior, última vista, comprobada el)
    pub fn engine_meta(&self) -> AppResult<(Option<String>, Option<String>, Option<String>, Option<String>)> {
        Ok(self.conn().query_row(
            "select engine_version, engine_prev_version, engine_latest_version, engine_checked_at from settings where id = 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?)
    }

    pub fn set_engine_checked(&self, latest: &str) -> AppResult<()> {
        self.conn().execute(
            "update settings set engine_latest_version = ?1, engine_checked_at = ?2 where id = 1",
            params![latest, now()],
        )?;
        Ok(())
    }

    pub fn set_engine_installed(&self, version: &str, previous: Option<&str>) -> AppResult<()> {
        self.conn().execute(
            "update settings set engine_version = ?1, engine_prev_version = ?2 where id = 1",
            params![version, previous],
        )?;
        Ok(())
    }

    /// ¿Hay algo usando el motor ahora mismo?
    pub fn count_active(&self) -> AppResult<i64> {
        Ok(self.conn().query_row(
            "select count(*) from downloads where status in ('parsing','downloading','processing')",
            [],
            |r| r.get(0),
        )?)
    }

    // ---------- presets (Smart Mode y suscripciones) ----------

    pub fn get_preset(&self, id: &str) -> AppResult<Option<Preset>> {
        Ok(self
            .conn()
            .query_row(
                "select id, name, kind, container, quality, audio_lang, subtitle_langs, subtitles_embedded, output_dir, is_smart_mode from presets where id = ?1",
                [id],
                row_to_preset,
            )
            .optional()?)
    }

    /// Crea o sustituye un preset con id fijo (o nuevo si `id` es None).
    pub fn save_preset(&self, id: Option<&str>, name: &str, o: &DownloadOptions, is_smart_mode: bool) -> AppResult<Preset> {
        let id = id.map(str::to_string).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        self.conn().execute(
            "insert into presets (id, name, kind, container, quality, audio_lang, subtitle_langs, subtitles_embedded, output_dir, is_smart_mode) \
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) \
             on conflict(id) do update set name = excluded.name, kind = excluded.kind, container = excluded.container, \
             quality = excluded.quality, audio_lang = excluded.audio_lang, subtitle_langs = excluded.subtitle_langs, \
             subtitles_embedded = excluded.subtitles_embedded, output_dir = excluded.output_dir, is_smart_mode = excluded.is_smart_mode",
            params![
                id, name, o.kind.as_str(), o.container, o.quality, o.audio_lang,
                serde_json::to_string(&o.subtitle_langs).unwrap_or_else(|_| "[]".into()),
                o.subtitles_embedded as i64, o.output_dir, is_smart_mode as i64
            ],
        )?;
        Ok(self.get_preset(&id)?.expect("recién guardado"))
    }

    pub fn delete_preset_if_unused(&self, id: &str) -> AppResult<()> {
        self.conn().execute(
            "delete from presets where id = ?1 and is_smart_mode = 0 and not exists (select 1 from subscriptions where preset_id = ?1)",
            [id],
        )?;
        Ok(())
    }

    // ---------- suscripciones ----------

    pub fn insert_subscription(&self, url: &str, title: &str, kind: &str, preset_id: &str) -> AppResult<Subscription> {
        let id = uuid::Uuid::new_v4().to_string();
        self.conn().execute(
            "insert into subscriptions (id, source_url, title, kind, preset_id) values (?1, ?2, ?3, ?4, ?5)",
            params![id, url, title, kind, preset_id],
        ).map_err(|e| match e {
            rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation =>
                AppError::new("already_subscribed", "Ya estás suscrito a ese enlace."),
            e => e.into(),
        })?;
        Ok(self.get_subscription(&id)?.expect("recién creada"))
    }

    pub fn get_subscription(&self, id: &str) -> AppResult<Option<Subscription>> {
        Ok(self.list_subscriptions()?.into_iter().find(|s| s.id == id))
    }

    pub fn list_subscriptions(&self) -> AppResult<Vec<Subscription>> {
        let rows: Vec<(String, String, String, String, bool, String, Option<String>, Option<String>, i64, String)> = {
            let c = self.conn();
            let mut stmt = c.prepare(
                "select s.id, s.source_url, s.title, s.kind, s.enabled, s.preset_id, s.last_checked_at, s.last_error, \
                 (select count(*) from downloads d where d.subscription_id = s.id), s.created_at \
                 from subscriptions s order by s.created_at desc",
            )?;
            let it = stmt.query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get::<_, i64>(4)? == 1, r.get(5)?, r.get(6)?, r.get(7)?, r.get(8)?, r.get(9)?))
            })?;
            it.collect::<Result<_, _>>()?
        };
        rows.into_iter()
            .map(|(id, source_url, title, kind, enabled, preset_id, last_checked_at, last_error, download_count, created_at)| {
                let preset = self.get_preset(&preset_id)?.ok_or_else(|| AppError::new("db", "Falta el formato de la suscripción"))?;
                Ok(Subscription { id, source_url, title, kind, enabled, preset, last_checked_at, last_error, download_count, created_at })
            })
            .collect()
    }

    pub fn set_subscription_enabled(&self, id: &str, enabled: bool) -> AppResult<()> {
        self.conn().execute("update subscriptions set enabled = ?2 where id = ?1", params![id, enabled as i64])?;
        Ok(())
    }

    /// Borra la suscripción y su formato. Sus descargas se quedan en la lista.
    pub fn delete_subscription(&self, id: &str) -> AppResult<()> {
        let mut c = self.conn();
        let tx = c.transaction()?;
        let preset: Option<String> = tx.query_row("select preset_id from subscriptions where id = ?1", [id], |r| r.get(0)).optional()?;
        tx.execute("delete from subscriptions where id = ?1", [id])?;
        if let Some(p) = preset {
            tx.execute("delete from presets where id = ?1 and is_smart_mode = 0 and not exists (select 1 from subscriptions where preset_id = ?1)", [p])?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn seen_ids(&self, sub: &str) -> AppResult<std::collections::HashSet<String>> {
        let c = self.conn();
        let mut stmt = c.prepare("select video_id from subscription_seen where subscription_id = ?1")?;
        let ids = stmt.query_map([sub], |r| r.get(0))?.collect::<Result<_, _>>()?;
        Ok(ids)
    }

    pub fn mark_seen(&self, sub: &str, ids: &[String]) -> AppResult<()> {
        let mut c = self.conn();
        let tx = c.transaction()?;
        for v in ids {
            tx.execute("insert or ignore into subscription_seen (subscription_id, video_id) values (?1, ?2)", params![sub, v])?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn set_subscription_checked(&self, id: &str, error: Option<&str>) -> AppResult<()> {
        self.conn().execute(
            "update subscriptions set last_checked_at = ?2, last_error = ?3 where id = ?1",
            params![id, now(), error],
        )?;
        Ok(())
    }

    /// Las activas a las que ya les toca: nunca comprobadas o hace más de `every_h` horas.
    pub fn due_subscriptions(&self, every_h: i64) -> AppResult<Vec<Subscription>> {
        let limit = (chrono::Utc::now() - chrono::Duration::hours(every_h)).format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        Ok(self
            .list_subscriptions()?
            .into_iter()
            .filter(|s| s.enabled && s.last_checked_at.as_deref().map_or(true, |t| t < limit.as_str()))
            .collect())
    }

    // ---------- descargas ----------

    pub fn insert_download(&self, n: &NewDownload, o: &DownloadOptions, output_dir: &str) -> AppResult<Download> {
        let id = uuid::Uuid::new_v4().to_string();
        {
            let c = self.conn();
            let position: i64 = c.query_row("select coalesce(max(position), 0) + 1 from downloads", [], |r| r.get(0))?;
            c.execute(
                "insert into downloads (id, source_url, video_id, extractor, title, uploader, thumbnail_url, duration_s, \
                 kind, container, quality, audio_lang, subtitle_langs, subtitles_embedded, output_dir, size_bytes, \
                 position, playlist_id, subscription_id, preset_id, created_at, updated_at) \
                 values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?21)",
                params![
                    id, n.source_url, n.video_id, n.extractor, n.title, n.uploader, n.thumbnail_url, n.duration_s,
                    o.kind.as_str(), o.container, o.quality, o.audio_lang,
                    serde_json::to_string(&o.subtitle_langs).unwrap_or_else(|_| "[]".into()),
                    o.subtitles_embedded as i64, output_dir, n.size_bytes, position, n.playlist_id,
                    n.subscription_id, n.preset_id, now()
                ],
            )?;
        }
        self.get_download(&id)?.ok_or_else(|| AppError::new("db", "La descarga no se guardó"))
    }

    /// Crea la playlist y una descarga por cada video, todo o nada.
    pub fn insert_playlist(&self, info: &PlaylistInfo, entries: &[PlaylistEntry], o: &DownloadOptions, output_dir: &str) -> AppResult<Vec<Download>> {
        let playlist_id = uuid::Uuid::new_v4().to_string();
        let mut ids = Vec::new();
        {
            let mut c = self.conn();
            let tx = c.transaction()?;
            let ts = now();
            tx.execute(
                "insert into playlists (id, source_url, title, kind, item_count, created_at, updated_at) values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![playlist_id, info.url, info.title, info.kind, entries.len() as i64, ts],
            )?;
            let mut position: i64 = tx.query_row("select coalesce(max(position), 0) from downloads", [], |r| r.get(0))?;
            for e in entries {
                position += 1;
                let id = uuid::Uuid::new_v4().to_string();
                tx.execute(
                    "insert into downloads (id, source_url, video_id, title, thumbnail_url, duration_s, kind, container, quality, \
                     audio_lang, subtitle_langs, subtitles_embedded, output_dir, position, playlist_id, created_at, updated_at) \
                     values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16)",
                    params![
                        id, e.url, e.id, e.title, e.thumbnail, e.duration_s, o.kind.as_str(), o.container, o.quality,
                        o.audio_lang, serde_json::to_string(&o.subtitle_langs).unwrap_or_else(|_| "[]".into()),
                        o.subtitles_embedded as i64, output_dir, position, playlist_id, ts
                    ],
                )?;
                ids.push(id);
            }
            tx.commit()?;
        }
        ids.iter().map(|id| self.get_download(id).map(|d| d.expect("recién insertada"))).collect()
    }

    pub fn get_download(&self, id: &str) -> AppResult<Option<Download>> {
        Ok(self
            .conn()
            .query_row(&format!("select {DOWNLOAD_COLUMNS} from downloads where id = ?1"), [id], row_to_download)
            .optional()?)
    }

    /// Lo más nuevo arriba. `search` filtra por título (sin distinguir mayúsculas).
    pub fn list_downloads(&self, search: Option<&str>) -> AppResult<Vec<Download>> {
        let c = self.conn();
        let pattern = search.map(|s| format!("%{}%", s.trim().replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")));
        let mut stmt = c.prepare(&format!(
            "select {DOWNLOAD_COLUMNS} from downloads \
             where (?1 is null or title like ?1 escape '\\' or source_url like ?1 escape '\\') \
             order by position desc"
        ))?;
        let rows = stmt.query_map([pattern], row_to_download)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// La siguiente en cola que no esté ya en marcha.
    pub fn next_queued(&self, running: &[String]) -> AppResult<Option<Download>> {
        let c = self.conn();
        let mut stmt = c.prepare(&format!("select {DOWNLOAD_COLUMNS} from downloads where status = 'queued' order by position asc"))?;
        let mut rows = stmt.query([])?;
        while let Some(r) = rows.next()? {
            let d = row_to_download(r)?;
            if !running.contains(&d.id) {
                return Ok(Some(d));
            }
        }
        Ok(None)
    }

    pub fn set_status(&self, id: &str, status: Status) -> AppResult<()> {
        let c = self.conn();
        if status == Status::Queued {
            c.execute(
                "update downloads set status = 'queued', error_code = null, error_message = null where id = ?1",
                [id],
            )?;
        } else {
            c.execute("update downloads set status = ?2 where id = ?1", params![id, status.as_str()])?;
        }
        Ok(())
    }

    pub fn set_error(&self, id: &str, code: &str, message: &str) -> AppResult<()> {
        self.conn().execute(
            "update downloads set status = 'error', error_code = ?2, error_message = ?3 where id = ?1",
            params![id, code, message],
        )?;
        Ok(())
    }

    pub fn set_progress(&self, id: &str, downloaded: i64, total: Option<i64>) -> AppResult<()> {
        self.conn().execute(
            "update downloads set downloaded_bytes = ?2, size_bytes = coalesce(?3, size_bytes) where id = ?1",
            params![id, downloaded, total],
        )?;
        Ok(())
    }

    /// Completa lo que falte; nunca pisa lo que ya había.
    pub fn set_meta(&self, id: &str, m: &crate::engine::Meta) -> AppResult<()> {
        self.conn().execute(
            "update downloads set title = coalesce(title, ?2), video_id = coalesce(video_id, ?3), extractor = coalesce(extractor, ?4), \
             thumbnail_url = coalesce(thumbnail_url, ?5), duration_s = coalesce(duration_s, ?6), uploader = coalesce(uploader, ?7) where id = ?1",
            params![id, m.title, m.id, m.extractor, m.thumbnail, m.duration_s, m.uploader],
        )?;
        Ok(())
    }

    pub fn set_done(&self, id: &str, path: &str, size: Option<i64>, actual_quality: Option<&str>) -> AppResult<()> {
        self.conn().execute(
            "update downloads set status = 'done', output_path = ?2, size_bytes = coalesce(?3, size_bytes), \
             downloaded_bytes = coalesce(?3, downloaded_bytes), actual_quality = ?4, finished_at = ?5, \
             error_code = null, error_message = null where id = ?1",
            params![id, path, size, actual_quality, now()],
        )?;
        Ok(())
    }

    /// Error o cancelada → otra vez a la cola, desde cero si no queda el .part.
    pub fn requeue(&self, id: &str, count_attempt: bool) -> AppResult<()> {
        self.conn().execute(
            "update downloads set status = 'queued', error_code = null, error_message = null, finished_at = null, \
             output_path = null, attempts = attempts + ?2 where id = ?1",
            params![id, count_attempt as i64],
        )?;
        Ok(())
    }

    pub fn delete_download(&self, id: &str) -> AppResult<()> {
        self.conn().execute("delete from downloads where id = ?1", [id])?;
        Ok(())
    }

    /// Quita de la lista lo terminado. Devuelve los ids quitados.
    pub fn clear_finished(&self) -> AppResult<Vec<String>> {
        let c = self.conn();
        let ids: Vec<String> = c
            .prepare("select id from downloads where status in ('done','error','cancelled')")?
            .query_map([], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
        c.execute("delete from downloads where status in ('done','error','cancelled')", [])?;
        Ok(ids)
    }

    /// Al arrancar: lo que estaba a medias vuelve a la cola.
    pub fn recover_on_start(&self) -> AppResult<usize> {
        Ok(self.conn().execute(
            "update downloads set status = 'queued' where status in ('parsing','downloading','processing')",
            [],
        )?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> DownloadOptions {
        DownloadOptions {
            kind: Kind::Video,
            container: "mp4".into(),
            quality: "1080p".into(),
            audio_lang: None,
            subtitle_langs: vec!["es".into()],
            subtitles_embedded: false,
            output_dir: None,
        }
    }

    #[test]
    fn migrations_settings_and_queue_order() {
        let db = Db::open_in_memory().unwrap();
        db.ensure_settings("/tmp/x").unwrap();
        db.ensure_settings("/tmp/otra").unwrap();
        assert_eq!(db.get_settings().unwrap().output_dir, "/tmp/x");

        let n = NewDownload { source_url: "https://a".into(), title: Some("Primero".into()), ..Default::default() };
        let a = db.insert_download(&n, &opts(), "/tmp/x").unwrap();
        let b = db.insert_download(&NewDownload { source_url: "https://b".into(), ..Default::default() }, &opts(), "/tmp/x").unwrap();
        assert_eq!(a.subtitle_langs, vec!["es".to_string()]);
        assert!(b.position > a.position);
        assert_eq!(db.next_queued(&[]).unwrap().unwrap().id, a.id);
        assert_eq!(db.next_queued(&[a.id.clone()]).unwrap().unwrap().id, b.id);
        // La lista muestra lo más nuevo arriba.
        assert_eq!(db.list_downloads(None).unwrap()[0].id, b.id);
        assert_eq!(db.list_downloads(Some("prim")).unwrap().len(), 1);
        assert_eq!(db.list_downloads(Some("100%")).unwrap().len(), 0);
    }

    #[test]
    fn done_needs_path_and_recovery() {
        let db = Db::open_in_memory().unwrap();
        let d = db.insert_download(&NewDownload { source_url: "https://a".into(), ..Default::default() }, &opts(), "/x").unwrap();
        // 'done' sin ruta lo rechaza la base de datos.
        assert!(db.set_status(&d.id, Status::Done).is_err());
        db.set_status(&d.id, Status::Downloading).unwrap();
        assert_eq!(db.recover_on_start().unwrap(), 1);
        assert_eq!(db.get_download(&d.id).unwrap().unwrap().status, Status::Queued);
        db.set_done(&d.id, "/x/a.mp4", Some(10), Some("720p")).unwrap();
        let d2 = db.get_download(&d.id).unwrap().unwrap();
        assert_eq!((d2.status, d2.actual_quality.as_deref()), (Status::Done, Some("720p")));
        assert_eq!(db.clear_finished().unwrap(), vec![d.id.clone()]);
        assert!(db.get_download(&d.id).unwrap().is_none());
    }

    #[test]
    fn playlist_insert_is_atomic() {
        let db = Db::open_in_memory().unwrap();
        let info = PlaylistInfo { url: "https://l".into(), id: "L".into(), title: "Lista".into(), uploader: None, kind: "playlist".into(), entries: vec![] };
        let entries: Vec<PlaylistEntry> = (0..3)
            .map(|i| PlaylistEntry { id: format!("v{i}"), url: format!("https://v/{i}"), title: Some(format!("V{i}")), duration_s: None, thumbnail: None })
            .collect();
        let ds = db.insert_playlist(&info, &entries, &opts(), "/x/Lista").unwrap();
        assert_eq!(ds.len(), 3);
        assert!(ds.iter().all(|d| d.playlist_id.is_some() && d.output_dir == "/x/Lista"));
        assert!(ds[0].position < ds[2].position);
    }
}
