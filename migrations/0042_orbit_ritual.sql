-- Щоденний «Заряд»: серія днів на акаунт. Лише вигляд (рамки профілю), ✦ не дає. Додаткова таблиця.
create table if not exists orbit_ritual (
  user_id text primary key,
  last_day text not null,
  streak integer not null default 0,
  best integer not null default 0,
  updated_at bigint not null
);
