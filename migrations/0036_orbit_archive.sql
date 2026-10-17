-- ORBIT v16, step 1 of moving history out of the single world JSON row: append-only archive tables.
-- The server writes them in the SAME transaction as every world write (dual-write); reads still use the world row.
-- Step 2 (later, separate approval): read history from these tables and trim old trades/finished launches from the row.
create table if not exists orbit_trades (
  seq integer primary key,          -- index of the trade in world.trades (world.trades is append-only)
  at bigint not null,
  amount integer not null,
  orbit_id integer not null,
  buyer_id text,                    -- null for trades made before v16 (the engine did not record it)
  seller_id text
);
create index if not exists orbit_trades_at on orbit_trades (at desc);
create index if not exists orbit_trades_buyer on orbit_trades (buyer_id, seq desc);
create index if not exists orbit_trades_seller on orbit_trades (seller_id, seq desc);
create table if not exists orbit_log (
  id bigserial primary key,
  at bigint not null,
  text text not null
);
create unique index if not exists orbit_log_once on orbit_log (at, md5(text));
create table if not exists orbit_launches (
  id text primary key,              -- creation id «c-…»
  user_id text not null,
  status text not null,             -- only final states: done | failed
  confirms jsonb not null,
  charge_started_at bigint,
  archived_at bigint not null
);
create index if not exists orbit_launches_user on orbit_launches (user_id);
