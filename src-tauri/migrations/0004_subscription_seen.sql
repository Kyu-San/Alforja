-- Videos que una suscripción ya ha visto (descargados o no). Al suscribirte se
-- apuntan los que ya existían, para no bajar el canal entero.
create table subscription_seen (
  subscription_id text not null references subscriptions(id) on delete cascade,
  video_id        text not null,
  seen_at         text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (subscription_id, video_id)
);
