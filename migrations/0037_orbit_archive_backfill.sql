-- ORBIT v16: one-time backfill of the archive tables (0036) from the current world row. Idempotent (on conflict do nothing).
-- Runs once (tracked in _migrations); the server's dual-write keeps the tables current afterwards.
insert into orbit_trades (seq, at, amount, orbit_id, buyer_id, seller_id)
select (t.ord - 1)::int, (t.v->>'at')::bigint, (t.v->>'amount')::int, (t.v->>'orbitId')::int, t.v->>'buyerId', t.v->>'sellerId'
from orbit_world w,
     jsonb_array_elements(coalesce(w.doc->'world'->'trades', w.doc->'trades', '[]'::jsonb)) with ordinality as t(v, ord)
where w.id = 'world'
on conflict (seq) do nothing;
insert into orbit_log (at, text)
select (l.v->>'at')::bigint, l.v->>'text'
from orbit_world w,
     jsonb_array_elements(coalesce(w.doc->'world'->'log', w.doc->'log', '[]'::jsonb)) with ordinality as l(v, ord)
where w.id = 'world'
order by l.ord desc
on conflict do nothing;
insert into orbit_launches (id, user_id, status, confirms, charge_started_at, archived_at)
select c.v->>'id', c.v->>'userId', c.v->>'status', coalesce(c.v->'confirms', '[]'::jsonb), nullif(c.v->>'chargeStartedAt', '')::bigint, (extract(epoch from now()) * 1000)::bigint
from orbit_world w,
     jsonb_array_elements(coalesce(w.doc->'world'->'creations', w.doc->'creations', '[]'::jsonb)) as c(v)
where w.id = 'world' and c.v->>'status' in ('done', 'failed')
on conflict (id) do nothing;
