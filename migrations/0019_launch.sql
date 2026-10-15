create table if not exists launch (
  id text primary key,
  at timestamptz not null,
  issued integer not null,
  people integer not null
);
