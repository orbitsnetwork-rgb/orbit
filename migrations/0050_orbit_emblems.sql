-- Емблема профілю: колір + знак, які бачать усі. Лише косметика, без ✦. Нова таблиця, нічого не видаляє.
create table if not exists orbit_emblems (
  user_id text primary key,
  hue integer not null,
  glyph text not null,
  at bigint not null
);
