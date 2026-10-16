-- ORBIT: emission ledger (append-only). One row per world write: mass after, what explains the change, unexplained (must be 0).
create table if not exists orbit_emission (
  id bigserial primary key,
  at bigint not null,
  mass bigint not null,
  fund bigint not null,
  starter bigint not null default 0,
  witness bigint not null default 0,
  topup bigint not null default 0,
  returned bigint not null default 0,
  delta bigint not null default 0,
  unexplained bigint not null default 0,
  kind text not null default 'write'
);
create index if not exists orbit_emission_at on orbit_emission (at);
