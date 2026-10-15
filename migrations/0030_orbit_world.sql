create table if not exists orbit_world (
  id text primary key,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);
