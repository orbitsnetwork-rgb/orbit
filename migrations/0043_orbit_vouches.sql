-- Одне підтвердження: пара «свідок → автор» лише раз за життя. Додаткова таблиця, нічого не видаляє.
create table if not exists orbit_vouches (
  witness_id text not null,
  author_id text not null,
  launch_id text not null,
  at bigint not null,
  primary key (witness_id, author_id)
);
create index if not exists orbit_vouches_author_idx on orbit_vouches (author_id);
insert into orbit_vouches (witness_id, author_id, launch_id, at)
select c.v->>'witnessId', l.user_id, l.id, coalesce(nullif(c.v->>'at', '')::bigint, 0)
from orbit_launches l cross join lateral jsonb_array_elements(l.confirms) as c(v)
where c.v->>'witnessId' is not null
on conflict (witness_id, author_id) do nothing;
