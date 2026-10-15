create table if not exists push_subs (
  id text primary key,
  person_key text not null references people(key) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subs_person on push_subs (person_key);
