alter table eight_events add column if not exists actor_key text;

update eights
set owner_key = null
where owner_key is not null
  and not exists (select 1 from people where people.key = eights.owner_key);

update eights
set confirmer_key = null
where confirmer_key is not null
  and not exists (select 1 from people where people.key = eights.confirmer_key);

update eight_events
set actor_key = null
where actor_key is not null
  and not exists (select 1 from people where people.key = eight_events.actor_key);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'eights_owner_fk') then
    alter table eights
      add constraint eights_owner_fk
      foreign key (owner_key) references people (key);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'eights_confirmer_fk') then
    alter table eights
      add constraint eights_confirmer_fk
      foreign key (confirmer_key) references people (key);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'eight_events_actor_fk') then
    alter table eight_events
      add constraint eight_events_actor_fk
      foreign key (actor_key) references people (key);
  end if;
end $$;
