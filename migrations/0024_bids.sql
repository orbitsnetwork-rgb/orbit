create table if not exists bids (
  id text primary key,
  person_key text not null default '',
  name text not null,
  currency text not null,
  amount double precision not null,
  city text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now()
);
