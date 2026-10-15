create unique index if not exists eight_events_kind on eight_events (eight_id, kind);

create index if not exists eights_owner on eights (owner_key);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'eight_events_eight_fk') then
    alter table eight_events
      add constraint eight_events_eight_fk
      foreign key (eight_id) references eights (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'eights_status_chk') then
    alter table eights
      add constraint eights_status_chk
      check (status in ('waiting', 'confirmed', 'gone', 'hidden'));
  end if;
end $$;
