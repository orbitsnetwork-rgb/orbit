-- ORBIT: full fund payout history (append-only), written by the server wrapper after each distribution.
create table if not exists orbit_payouts (
  id bigserial primary key,
  at bigint not null,
  user_id text not null,
  amount integer not null
);
create index if not exists orbit_payouts_user on orbit_payouts (user_id, id desc);
create index if not exists orbit_payouts_at on orbit_payouts (at desc);
