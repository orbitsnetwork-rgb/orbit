-- ORBIT: особисті розмови (DM), блокування, картки «Шукаю орбіту». Additive only (світовий чат лише вимкнено, таблиці не чіпаємо).
create table if not exists orbit_dm (
  room text primary key,
  a text not null,
  b text not null,
  at bigint not null,
  last_at bigint not null
);
create index if not exists orbit_dm_a on orbit_dm (a, last_at desc);
create index if not exists orbit_dm_b on orbit_dm (b, last_at desc);
create table if not exists orbit_blocks (
  user_id text not null,
  blocked text not null,
  at bigint not null,
  primary key (user_id, blocked)
);
create table if not exists orbit_seek (
  user_id text primary key,
  text text not null,
  at bigint not null,
  expires_at bigint not null,
  hidden boolean not null default false,
  hidden_at bigint,
  hidden_by text
);
create index if not exists orbit_seek_live on orbit_seek (expires_at desc);
create table if not exists orbit_seek_reports (
  card_user text not null,
  reporter text not null,
  at bigint not null,
  primary key (card_user, reporter)
)
