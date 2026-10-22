-- М’яке видалення акаунта: контакти переносимо сюди (30 днів на відновлення через підтримку), вхід вимикаємо. Додаткова таблиця.
create table if not exists orbit_deleted (
  user_id text primary key,
  person jsonb not null,
  deleted_at bigint not null,
  reason text
);
