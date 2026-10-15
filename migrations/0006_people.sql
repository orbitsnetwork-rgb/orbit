create table if not exists people (
  key text primary key,
  name text not null,
  city text not null default '',
  updated_at timestamptz not null default now()
);
