-- C1 (масштабування), крок 1 з 3: окремі таблиці для людей, ключів, пристроїв і запусків.
-- Лише ДОДАЄ. Джерело правди поки — orbit_world.doc; тригер дзеркалить його в таблиці в тій самій транзакції
-- (подвійний запис без змін у коді застосунку). Звірка — orbit_split_diff() і /api/reconcile (поле split).
-- Крок 2: читання з таблиць; крок 3: прибрати секції з doc (окремим рішенням, після тижня нульових розбіжностей).

create table if not exists orbit_person (
  user_id text primary key,
  email text not null,
  phone_key text not null,
  ord integer not null default 0,
  row jsonb not null
);
create index if not exists orbit_person_email on orbit_person (email);
create index if not exists orbit_person_phone on orbit_person (phone_key);

create table if not exists orbit_key (
  user_id text primary key,
  hash text not null
);

create table if not exists orbit_device_seen (
  device text primary key,
  ids jsonb not null
);

create table if not exists orbit_device_day (
  device text primary key,
  day text not null,
  count integer not null
);

create table if not exists orbit_creation (
  id text primary key,
  user_id text not null,
  status text not null,
  ord integer not null default 0,
  row jsonb not null
);
create index if not exists orbit_creation_user on orbit_creation (user_id);
create index if not exists orbit_creation_status on orbit_creation (status) where status in ('collecting', 'charging');

create or replace function orbit_phone_key(raw text) returns text language sql immutable as $$
  select case when length(d) = 10 and left(d, 1) = '0' then '380' || substr(d, 2) else d end
  from (select regexp_replace(coalesce(raw, ''), '\D', '', 'g') as d) x
$$;

-- Синхронізує одну секцію лише якщо вона змінилась (prev null — повна синхронізація).
create or replace function orbit_mirror(doc jsonb, prev jsonb) returns void language plpgsql as $$
begin
  if prev is null or doc->'people' is distinct from prev->'people' then
    delete from orbit_person where user_id not in (select e->>'userId' from jsonb_array_elements(coalesce(doc->'people', '[]'::jsonb)) e where e->>'userId' is not null);
    insert into orbit_person (user_id, email, phone_key, ord, row)
      select distinct on (e->>'userId') e->>'userId', lower(coalesce(e->>'email', '')), orbit_phone_key(e->>'phone'), i::int, e
      from jsonb_array_elements(coalesce(doc->'people', '[]'::jsonb)) with ordinality as x(e, i) where e->>'userId' is not null
      order by e->>'userId', i
    on conflict (user_id) do update set email = excluded.email, phone_key = excluded.phone_key, ord = excluded.ord, row = excluded.row
      where (orbit_person.row, orbit_person.ord) is distinct from (excluded.row, excluded.ord);
  end if;
  if prev is null or doc->'keys' is distinct from prev->'keys' then
    delete from orbit_key where user_id not in (select k from jsonb_object_keys(coalesce(doc->'keys', '{}'::jsonb)) k);
    insert into orbit_key (user_id, hash)
      select key, value from jsonb_each_text(coalesce(doc->'keys', '{}'::jsonb))
    on conflict (user_id) do update set hash = excluded.hash where orbit_key.hash is distinct from excluded.hash;
  end if;
  if prev is null or doc->'seen' is distinct from prev->'seen' then
    delete from orbit_device_seen where device not in (select k from jsonb_object_keys(coalesce(doc->'seen', '{}'::jsonb)) k);
    insert into orbit_device_seen (device, ids)
      select key, value from jsonb_each(coalesce(doc->'seen', '{}'::jsonb))
    on conflict (device) do update set ids = excluded.ids where orbit_device_seen.ids is distinct from excluded.ids;
  end if;
  if prev is null or doc->'devices' is distinct from prev->'devices' then
    delete from orbit_device_day where device not in (select k from jsonb_object_keys(coalesce(doc->'devices', '{}'::jsonb)) k);
    insert into orbit_device_day (device, day, count)
      select key, coalesce(value->>'day', ''), coalesce((value->>'count')::int, 0) from jsonb_each(coalesce(doc->'devices', '{}'::jsonb))
    on conflict (device) do update set day = excluded.day, count = excluded.count
      where (orbit_device_day.day, orbit_device_day.count) is distinct from (excluded.day, excluded.count);
  end if;
  if prev is null or doc->'world'->'creations' is distinct from prev->'world'->'creations' then
    delete from orbit_creation where id not in (select e->>'id' from jsonb_array_elements(coalesce(doc->'world'->'creations', '[]'::jsonb)) e where e->>'id' is not null);
    insert into orbit_creation (id, user_id, status, ord, row)
      select distinct on (e->>'id') e->>'id', coalesce(e->>'userId', ''), coalesce(e->>'status', ''), i::int, e
      from jsonb_array_elements(coalesce(doc->'world'->'creations', '[]'::jsonb)) with ordinality as x(e, i) where e->>'id' is not null
      order by e->>'id', i
    on conflict (id) do update set user_id = excluded.user_id, status = excluded.status, ord = excluded.ord, row = excluded.row
      where (orbit_creation.row, orbit_creation.ord) is distinct from (excluded.row, excluded.ord);
  end if;
end $$;

create or replace function orbit_world_mirror() returns trigger language plpgsql as $$
begin
  if new.id = 'world' then
    -- Дзеркало НІКОЛИ не ламає запис світу: помилка лише відкочує дзеркало (підтранзакція) і видна в звірці.
    begin
      perform orbit_mirror(new.doc, case when tg_op = 'UPDATE' then old.doc else null end);
    exception when others then
      raise warning 'orbit_mirror failed: %', sqlerrm;
    end;
  end if;
  return new;
end $$;

create or replace trigger orbit_world_mirror after insert or update of doc on orbit_world
  for each row execute function orbit_world_mirror();

-- Звірка: скільки рядків у таблицях не збігається з документом (0 — усе гаразд).
create or replace function orbit_split_diff() returns table (section text, missing bigint, extra bigint, changed bigint) language sql stable as $$
  with d as (select doc from orbit_world where id = 'world'),
  p as (select e->>'userId' as id, e as row, i::int as ord from d, jsonb_array_elements(coalesce(d.doc->'people', '[]'::jsonb)) with ordinality as x(e, i) where e->>'userId' is not null),
  k as (select key as id, value as v from d, jsonb_each_text(coalesce(d.doc->'keys', '{}'::jsonb))),
  s as (select key as id, value as v from d, jsonb_each(coalesce(d.doc->'seen', '{}'::jsonb))),
  v as (select key as id, coalesce(value->>'day', '') as day, coalesce((value->>'count')::int, 0) as n from d, jsonb_each(coalesce(d.doc->'devices', '{}'::jsonb))),
  c as (select e->>'id' as id, e as row, i::int as ord from d, jsonb_array_elements(coalesce(d.doc->'world'->'creations', '[]'::jsonb)) with ordinality as x(e, i) where e->>'id' is not null)
  select 'people', (select count(*) from p where not exists (select 1 from orbit_person t where t.user_id = p.id)),
                   (select count(*) from orbit_person t where not exists (select 1 from p where p.id = t.user_id)),
                   (select count(*) from p join orbit_person t on t.user_id = p.id where (t.row, t.ord) is distinct from (p.row, p.ord))
  union all select 'keys', (select count(*) from k where not exists (select 1 from orbit_key t where t.user_id = k.id)),
                   (select count(*) from orbit_key t where not exists (select 1 from k where k.id = t.user_id)),
                   (select count(*) from k join orbit_key t on t.user_id = k.id where t.hash is distinct from k.v)
  union all select 'seen', (select count(*) from s where not exists (select 1 from orbit_device_seen t where t.device = s.id)),
                   (select count(*) from orbit_device_seen t where not exists (select 1 from s where s.id = t.device)),
                   (select count(*) from s join orbit_device_seen t on t.device = s.id where t.ids is distinct from s.v)
  union all select 'devices', (select count(*) from v where not exists (select 1 from orbit_device_day t where t.device = v.id)),
                   (select count(*) from orbit_device_day t where not exists (select 1 from v where v.id = t.device)),
                   (select count(*) from v join orbit_device_day t on t.device = v.id where (t.day, t.count) is distinct from (v.day, v.n))
  union all select 'creations', (select count(*) from c where not exists (select 1 from orbit_creation t where t.id = c.id)),
                   (select count(*) from orbit_creation t where not exists (select 1 from c where c.id = t.id)),
                   (select count(*) from c join orbit_creation t on t.id = c.id where (t.row, t.ord) is distinct from (c.row, c.ord))
$$;

-- Початкове заповнення з поточного документа.
select orbit_mirror(doc, null) from orbit_world where id = 'world';
