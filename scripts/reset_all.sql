-- ORBIT: ПОВНИЙ ЧИСТИЙ СТАРТ (один раз перед запуском). Видаляє ВСІ дані, включно з акаунтами.
-- Схема і таблиця _migrations лишаються. Світ (orbit_world) застосунок створює заново з 8 000 000 ✦.
-- Запускати ЛИШЕ через scripts/reset-all.mjs (там захист від випадкового запуску на проді).
do $$
declare t text;
declare names text := '';
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> '_migrations' loop
    names := names || case when names = '' then '' else ', ' end || quote_ident(t);
  end loop;
  if names <> '' then
    execute 'truncate table ' || names || ' restart identity cascade';
  end if;
end $$;
