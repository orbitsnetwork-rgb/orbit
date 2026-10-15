create table if not exists gate (
  bucket text primary key,
  n int not null,
  at timestamptz not null default now()
);

create table if not exists thumbs (
  eight_id text primary key,
  data text not null
);
