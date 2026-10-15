alter table walks add column if not exists by_key text;
alter table flags add column if not exists by_key text;
alter table talks add column if not exists by_key text;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'walks_pkey') then
    alter table walks drop constraint walks_pkey;
  end if;
  if exists (select 1 from pg_constraint where conname = 'flags_pkey') then
    alter table flags drop constraint flags_pkey;
  end if;
end $$;

create unique index if not exists walks_eight_key on walks (eight_id, by_key);
create unique index if not exists flags_eight_key on flags (eight_id, by_key);
