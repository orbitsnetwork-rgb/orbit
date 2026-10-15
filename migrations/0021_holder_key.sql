alter table eights add column if not exists holder_key text;

update eights
set holder_key = owner_key
where holder_key is null
  and owner_key is not null
  and exists (
    select 1 from people
    where people.key = eights.owner_key
      and lower(trim(people.name)) = lower(trim(eights.holder))
  );

update eights
set holder_key = confirmer_key
where holder_key is null
  and confirmer_key is not null
  and exists (
    select 1 from people
    where people.key = eights.confirmer_key
      and lower(trim(people.name)) = lower(trim(eights.holder))
  );

update listings as l
set seller_key = p.key
from people as p
where l.seller_key is null
  and lower(trim(p.name)) = lower(trim(l.seller))
  and (
    select count(*) from people as same
    where lower(trim(same.name)) = lower(trim(l.seller))
  ) = 1;

update listings as l
set buyer_key = p.key
from people as p
where l.buyer_key is null
  and l.buyer is not null
  and lower(trim(p.name)) = lower(trim(l.buyer))
  and (
    select count(*) from people as same
    where lower(trim(same.name)) = lower(trim(l.buyer))
  ) = 1;
