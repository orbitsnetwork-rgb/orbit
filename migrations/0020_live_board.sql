delete from listings where eight_id like '90010%';
update eights set status = 'hidden' where id like '90010%';

update listings as l
set seller_key = p.key
from eights as e
join people as p on p.key = e.owner_key
where l.eight_id = e.id
  and l.seller_key is null
  and lower(trim(p.name)) = lower(trim(l.seller));
