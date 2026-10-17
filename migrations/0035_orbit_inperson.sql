-- ORBIT: «підтвердив особисто» — display-only mark: the witness confirmed by scanning the author's on-screen QR
-- (short-lived signed token). No effect on ✦, stability or any formula. Append-only, one row per (launch, witness).
create table if not exists orbit_inperson (
  cr text not null,
  witness_id text not null,
  at bigint not null,
  primary key (cr, witness_id)
);
