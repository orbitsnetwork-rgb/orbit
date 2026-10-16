-- ORBIT: personal events, thanks and orbit origins live outside the world document (append-only).
create table if not exists orbit_events (
  id bigserial primary key,
  user_id text not null,
  t text not null,
  at bigint not null,
  data jsonb not null default '{}'::jsonb
);
create index if not exists orbit_events_user on orbit_events (user_id, id desc);
create table if not exists orbit_thanks (
  cr text not null,
  witness_id text not null,
  author_id text not null,
  at bigint not null,
  primary key (cr, witness_id)
);
create index if not exists orbit_thanks_witness on orbit_thanks (witness_id);
create index if not exists orbit_thanks_author on orbit_thanks (author_id);
create table if not exists orbit_origins (
  orbit integer primary key,
  cr text not null,
  at bigint not null
);
create index if not exists orbit_origins_cr on orbit_origins (cr);
-- Paid Stripe sessions whose account was not found (audit K4): kept for manual review; the webhook answers 500 so Stripe retries.
create table if not exists orbit_orphans (
  id bigserial primary key,
  session_id text not null,
  user_id text not null,
  amount integer not null,
  reason text not null,
  at timestamptz not null default now()
);
create index if not exists orbit_orphans_session on orbit_orphans (session_id);
