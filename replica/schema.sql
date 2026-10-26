-- Esquema local (SQLite) del clon de 4K Video Downloader+.
-- Primera migración: src-tauri/migrations/0001_init.sql
--
-- App de escritorio de un solo usuario: no hay user_id ni reglas de acceso
-- por fila. Solo la propia app (proceso local) abre este archivo.
-- Ids: UUID v4 como texto. Fechas: texto ISO-8601 en UTC
-- (strftime('%Y-%m-%dT%H:%M:%fZ')). Se muestran en hora local en la interfaz.

-- foreign_keys y journal_mode = wal se fijan al abrir la conexión (db.rs):
-- no pueden ir dentro de la transacción de una migración.

-- Perfiles de formato. Smart Mode es el preset con is_smart_mode = 1.
create table presets (
  id                 text primary key,
  name               text not null,
  kind               text not null check (kind in ('video','audio')),
  container          text not null check (container in ('mp4','mkv','mp3','m4a','ogg')),
  quality            text not null,            -- '2160p', '1080p', 'best', '320k'...
  audio_lang         text,                     -- null = pista original
  subtitle_langs     text not null default '[]' check (json_valid(subtitle_langs)),
  subtitles_embedded integer not null default 0 check (subtitles_embedded in (0,1)),
  output_dir         text,                     -- null = carpeta por defecto de settings
  is_smart_mode      integer not null default 0 check (is_smart_mode in (0,1)),
  created_at         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  check ((kind = 'video' and container in ('mp4','mkv'))
      or (kind = 'audio' and container in ('mp3','m4a','ogg')))
);
-- Solo un preset puede ser el de Smart Mode.
create unique index presets_one_smart_mode on presets (is_smart_mode) where is_smart_mode = 1;

-- Playlists y canales pedidos en S04 (agrupan sus descargas).
create table playlists (
  id          text primary key,
  source_url  text not null,
  title       text not null,
  kind        text not null check (kind in ('playlist','channel')),
  item_count  integer check (item_count >= 0),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table subscriptions (
  id               text primary key,
  source_url       text not null unique,
  title            text not null,
  kind             text not null check (kind in ('playlist','channel')),
  -- Borrar un preset en uso no se permite: primero cambia la suscripción.
  preset_id        text not null references presets(id) on delete restrict,
  enabled          integer not null default 1 check (enabled in (0,1)),
  last_checked_at  text,
  last_error       text,
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index subscriptions_preset on subscriptions (preset_id);

create table downloads (
  id                 text primary key,
  source_url         text not null,
  video_id           text,                    -- id de yt-dlp, conocido tras el análisis
  extractor          text,                    -- 'youtube', 'vimeo'...
  title              text,
  uploader           text,
  thumbnail_url      text,
  duration_s         integer check (duration_s >= 0),
  kind               text not null check (kind in ('video','audio')),
  container          text not null check (container in ('mp4','mkv','mp3','m4a','ogg')),
  quality            text not null,
  audio_lang         text,
  subtitle_langs     text not null default '[]' check (json_valid(subtitle_langs)),
  subtitles_embedded integer not null default 0 check (subtitles_embedded in (0,1)),
  output_dir         text not null,
  output_path        text,                    -- se fija al terminar (la decide yt-dlp)
  size_bytes         integer check (size_bytes >= 0),
  downloaded_bytes   integer not null default 0 check (downloaded_bytes >= 0),
  status             text not null default 'queued'
    check (status in ('queued','parsing','downloading','processing','paused','done','error','cancelled')),
  error_code         text,                    -- 'unsupported','private','geo','age','http_403','disk_full','engine'...
  error_message      text,
  attempts           integer not null default 0 check (attempts >= 0),
  position           integer not null,        -- orden en la cola
  -- Borrar una playlist o suscripción deja sus descargas (y archivos) en la lista.
  playlist_id        text references playlists(id) on delete set null,
  subscription_id    text references subscriptions(id) on delete set null,
  preset_id          text references presets(id) on delete set null,
  created_at         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at        text,
  check ((kind = 'video' and container in ('mp4','mkv'))
      or (kind = 'audio' and container in ('mp3','m4a','ogg'))),
  check (status <> 'done' or (output_path is not null and finished_at is not null)),
  check (status <> 'error' or error_code is not null)
);
create index downloads_status_position on downloads (status, position);  -- el planificador de la cola
create index downloads_created_at      on downloads (created_at desc);   -- la lista de S01
create index downloads_playlist        on downloads (playlist_id);
create index downloads_subscription    on downloads (subscription_id);
create index downloads_preset          on downloads (preset_id);
create index downloads_video           on downloads (extractor, video_id);  -- "¿ya lo bajaste?"
-- Una suscripción nunca pone el mismo video dos veces en la cola,
-- aunque dos comprobaciones se crucen.
create unique index downloads_subscription_video
  on downloads (subscription_id, video_id)
  where subscription_id is not null and video_id is not null;

-- Ajustes globales: una sola fila.
create table settings (
  id                   integer primary key check (id = 1),
  output_dir           text not null,
  max_concurrent       integer not null default 3 check (max_concurrent between 1 and 10),
  ui_language          text not null default 'es',
  theme                text not null default 'system' check (theme in ('system','light','dark')),
  proxy_url            text,
  filename_template    text not null default '%(title).180B [%(id)s].%(ext)s',
  cookies_browser      text check (cookies_browser in ('firefox','chrome','edge','brave','safari','chromium')),
  subscription_every_h integer not null default 6 check (subscription_every_h between 1 and 168),
  engine_version       text,
  engine_prev_version  text,                  -- para volver atrás si una actualización falla
  engine_auto_update   integer not null default 1 check (engine_auto_update in (0,1)),
  engine_checked_at    text,
  notify_on_finish     integer not null default 1 check (notify_on_finish in (0,1)),
  updated_at           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- updated_at automático.
create trigger presets_touch after update on presets for each row
  when new.updated_at = old.updated_at
  begin update presets set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
create trigger playlists_touch after update on playlists for each row
  when new.updated_at = old.updated_at
  begin update playlists set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
create trigger subscriptions_touch after update on subscriptions for each row
  when new.updated_at = old.updated_at
  begin update subscriptions set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
create trigger downloads_touch after update on downloads for each row
  when new.updated_at = old.updated_at
  begin update downloads set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;
create trigger settings_touch after update on settings for each row
  when new.updated_at = old.updated_at
  begin update settings set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = new.id; end;

-- Migración 0002 (durante /replica-build): calidad real obtenida.
alter table downloads add column actual_quality text;

-- Migración 0003 (durante /replica-backend): última versión del motor vista.
alter table settings add column engine_latest_version text;
