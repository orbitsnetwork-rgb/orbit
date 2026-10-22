-- Вхід / відновлення акаунта кодом з пошти. Лише хеш коду, строк 15 хв, до 5 спроб. Додаткова таблиця.
create table if not exists orbit_login_codes (
  email text primary key,
  code_hash text not null,
  expires_at bigint not null,
  tries integer not null default 0,
  sent_at bigint not null
);
-- Ліміти зовнішнього входу за мережею (вікно 10 хв).
create table if not exists orbit_auth_hits (
  tag text primary key,
  n integer not null default 0,
  window_start bigint not null
);
