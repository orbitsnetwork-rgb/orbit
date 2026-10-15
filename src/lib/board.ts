import { createServerFn } from "@tanstack/react-start";
import { confirmDistanceError, eightNo, haversine, mayArchive, mayVerify, MAX_FIX_ACCURACY_M, placeFixError } from "@/lib/model";
import { coordError, kmBetween, nearbyBounds, nearbyError, nearbyRequest, photoOpen, selectNearby, type NearbyHit } from "@/lib/nearby";
import { resolveKey } from "@/lib/account";
import { dropShare, share } from "@/lib/share";

export type NearbyCard = NearbyHit & {
  photo: string;
  story: string;
  creator: string;
  open: boolean;
  presence: string;
  own: boolean;
};

export type BoardEvent = {
  id: string;
  at: string;
  kind: "created" | "placed" | "verification_requested" | "verified" | "activated" | "archived" | "transfer";
  by: string;
  status: string;
  lat: number | null;
  lng: number | null;
};

export type BoardEight = {
  id: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  creator: string;
  holder: string;
  createdAt: string;
  story: string;
  photo: string;
  status: "waiting" | "confirmed" | "gone";
  confirmedBy: string | null;
  confirmPhoto: string | null;
  archivedAt: string | null;
  events: BoardEvent[];
  presence?: string;
  own?: boolean;
  holds?: boolean;
  rewardId?: string;
  firstInCity?: boolean;
  hintSeen?: number;
};

export type BoardTalk = {
  id: string;
  eightId: string;
  by: string;
  text: string;
  at: string;
  chalk: number;
  mine: boolean;
  replyTo: string;
  replyText: string;
};

export type BoardRoom = {
  id: string;
  city: string;
  photo: string;
  status: "waiting" | "confirmed";
  lane: "wall" | "deal";
  lastBy: string;
  lastText: string;
  lastAt: string;
  closed?: boolean;
};

type PublishInput = {
  id: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  creator: string;
  story: string;
  photo: string;
  thumb?: string;
  device: string;
  personKey?: string;
};

type ConfirmInput = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  accuracy: number;
  photo: string;
  device: string;
  personKey?: string;
};

function photoFile(photo: string, limit: number) {
  return /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(photo) && photo.length <= limit;
}

function photoKey(photo: string) {
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(photo.length / 500));
  for (let i = 0; i < photo.length; i += step) hash = Math.imul(hash ^ photo.charCodeAt(i), 16777619);
  return `${photo.length}:${hash >>> 0}`;
}

function dayAgo() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

async function confirmedCount(sql: Awaited<ReturnType<typeof sqlClient>>) {
  const rows = await sql<{ n: string | number }>`
    select count(*)::bigint as n from eights
    where status = 'confirmed' and id not like '90010%'
  `;
  return Number(rows[0]?.n ?? 0);
}

function wallId(n: number) {
  const raw = String(n);
  return raw.length >= 6 ? raw : raw.padStart(6, "0");
}

async function nextFreeId(sql: Awaited<ReturnType<typeof sqlClient>>) {
  const top = await sql<{ id: string }>`
    select id from eights
    where id ~ '^[0-9]+$'
    order by length(id) desc, id desc
    limit 1
  `;
  let n = Math.max(100000, Number(top[0]?.id ?? 99999) + 1);
  for (let step = 0; step < 40 && Number.isSafeInteger(n); step += 1) {
    const candidate = wallId(n);
    const taken = await sql`select id from eights where id = ${candidate} limit 1`;
    if (!taken[0]) return candidate;
    n += 1;
  }
  return "";
}

function validDevice(value: string) {
  return /^[a-z0-9]{16,32}$/.test(value);
}

function asText(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

async function cityFirst(sql: Awaited<ReturnType<typeof sqlClient>>, id: string, city: string) {
  const name = city.trim();
  if (name.length < 2) return false;
  const prior = await sql<{ n: number }>`
    select case
      when exists (select 1 from eights where id = ${id} and reward_of is not null) then 1
      else (
        select count(*)::int from eights
        where id <> ${id}
          and id not like '90010%'
          and reward_of is null
          and lower(trim(city)) = lower(trim(${name}))
          and created_at < (select created_at from eights where id = ${id})
      )
    end as n
  `;
  return Number(prior[0]?.n ?? 1) === 0;
}

function rowEight(row: Record<string, unknown>): BoardEight {
  return {
    id: String(row.id),
    city: String(row.city),
    country: String(row.country),
    lat: Number(row.lat),
    lng: Number(row.lng),
    creator: String(row.creator),
    holder: String(row.holder),
    createdAt: asText(row.created_at),
    story: String(row.story ?? ""),
    photo: String(row.photo ?? ""),
    status: row.status === "confirmed" ? "confirmed" : row.status === "gone" || row.status === "hidden" ? "gone" : "waiting",
    confirmedBy: row.confirmed_by ? String(row.confirmed_by) : null,
    confirmPhoto: typeof row.confirm_photo === "string" && (row.confirm_photo.startsWith("data:image/") || row.confirm_photo.startsWith("/")) ? row.confirm_photo : null,
    archivedAt: row.archived_at ? asText(row.archived_at) : null,
    events: [],
  };
}

async function sqlClient() {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  void sweepOldShots(sql);
  return sql;
}

let shotSweep: Promise<void> | null = null;

async function sweepOldShots(sql: Awaited<ReturnType<typeof sqlClient>>) {
  if (shotSweep) return shotSweep;
  shotSweep = (async () => {
    const { keepShot } = await import("@/lib/shot.server");
    const photos = await sql<{ id: string; photo: string }>`
      select id, photo from eights where photo like 'data:image/%' limit 8
    `;
    for (const row of photos) {
      if (!/^[0-9]{6}$/.test(row.id)) continue;
      const path = await keepShot(row.id, row.photo);
      if (path.startsWith("/")) await sql`update eights set photo = ${path} where id = ${row.id}`;
    }
    const confirms = await sql<{ id: string; confirm_photo: string }>`
      select id, confirm_photo from eights where confirm_photo like 'data:image/%' limit 8
    `;
    for (const row of confirms) {
      if (!/^[0-9]{6}$/.test(row.id)) continue;
      const path = await keepShot(`${row.id}-c`, row.confirm_photo);
      if (path.startsWith("/")) await sql`update eights set confirm_photo = ${path} where id = ${row.id}`;
    }
  })().catch(() => undefined);
  return shotSweep;
}

async function writeEvent(
  sql: Awaited<ReturnType<typeof sqlClient>>,
  event: { id: string; eightId: string; at: string; kind: BoardEvent["kind"]; by: string; actorId?: string; status: string; lat?: number; lng?: number },
) {
  const actor = event.actorId || null;
  await sql`
    insert into eight_events (id, eight_id, at, kind, by_name, status, lat, lng, actor_key)
    values (${event.id}, ${event.eightId}, ${event.at}, ${event.kind}, ${event.by}, ${event.status}, ${event.lat ?? null}, ${event.lng ?? null}, ${actor})
    on conflict (eight_id, kind) do update
      set actor_key = coalesce(eight_events.actor_key, excluded.actor_key)
  `;
}

async function ensureLife(sql: Awaited<ReturnType<typeof sqlClient>>, row: Record<string, unknown>) {
  const id = String(row.id);
  const at = asText(row.created_at);
  const by = String(row.creator ?? "");
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  const owner = typeof row.owner_key === "string" ? row.owner_key : "";
  const confirmer = typeof row.confirmer_key === "string" ? row.confirmer_key : "";
  await writeEvent(sql, { id: `e-created-${id}`, eightId: id, at, kind: "created", by, actorId: owner, status: "DRAFT" });
  await writeEvent(sql, { id: `e-placed-${id}`, eightId: id, at, kind: "placed", by, actorId: owner, status: "PLACED", lat, lng });
  if (row.confirmed_by) {
    const when = row.confirmed_at ? asText(row.confirmed_at) : at;
    const who = String(row.confirmed_by);
    await writeEvent(sql, { id: `e-req-${id}`, eightId: id, at: when, kind: "verification_requested", by: who, actorId: confirmer, status: "WAITING_VERIFICATION", lat, lng });
    await writeEvent(sql, { id: `e-ver-${id}`, eightId: id, at: when, kind: "verified", by: who, actorId: confirmer, status: "VERIFIED", lat, lng });
    await writeEvent(sql, { id: `e-act-${id}`, eightId: id, at: when, kind: "activated", by: who, actorId: confirmer, status: "ACTIVE" });
  }
  if (row.status === "gone" || row.status === "hidden") {
    const when = row.archived_at ? asText(row.archived_at) : at;
    await writeEvent(sql, { id: `e-arch-${id}`, eightId: id, at: when, kind: "archived", by, actorId: owner, status: "ARCHIVED" });
  }
}

async function loadEvents(sql: Awaited<ReturnType<typeof sqlClient>>, ids: string[]) {
  const map = new Map<string, BoardEvent[]>();
  if (ids.length === 0) return map;
  const rows = await sql.query<Record<string, unknown>>(
    `select id, eight_id, at, kind, by_name, status, lat, lng from eight_events where eight_id in (${ids.map((_, index) => `$${index + 1}`).join(", ")}) order by at asc`,
    ids,
  );
  for (const row of rows) {
    const eightId = String(row.eight_id);
    const list = map.get(eightId) ?? [];
    list.push({
      id: String(row.id),
      at: asText(row.at),
      kind: String(row.kind) as BoardEvent["kind"],
      by: String(row.by_name ?? ""),
      status: String(row.status ?? ""),
      lat: row.lat == null ? null : Number(row.lat),
      lng: row.lng == null ? null : Number(row.lng),
    });
    map.set(eightId, list);
  }
  return map;
}

async function withEvents(sql: Awaited<ReturnType<typeof sqlClient>>, raw: Record<string, unknown>[]): Promise<BoardEight[]> {
  for (const row of raw) await ensureLife(sql, row);
  const events = await loadEvents(sql, raw.map((row) => String(row.id)));
  return raw.map((row) => ({ ...rowEight(row), events: events.get(String(row.id)) ?? [] }));
}

function sellerMatch(row: { seller: string; seller_key: string | null }, name: string, actorId?: string) {
  if (row.seller_key) return Boolean(actorId && actorId === row.seller_key);
  return row.seller.trim().toLowerCase() === name.trim().toLowerCase();
}

async function actorOf(personKey: string | undefined) {
  const id = await resolveKey(personKey ?? "");
  if (!id) return null;
  const sql = await sqlClient();
  const rows = await sql<{ name: string }>`select name from people where key = ${id} limit 1`;
  if (!rows[0]) return null;
  return { id, name: rows[0].name.trim() };
}

function tell(personId: string, body: string, eightId: string, path?: string) {
  if (!personId) return;
  void import("@/lib/push-send.server")
    .then((mod) => mod.tellPerson(personId, body, path ?? `/open/${eightId}`))
    .catch(() => undefined);
}

let sweptAt = 0;

export const listBoard = createServerFn({ method: "POST" })
  .inputValidator((input: string | { name?: string; personKey?: string }) =>
    typeof input === "string" ? { name: input, personKey: "" } : { name: input.name ?? "", personKey: input.personKey ?? "" },
  )
  .handler(async ({ data }): Promise<BoardEight[]> => {
    const sql = await sqlClient();
    const who = data.name.trim();
    const now = Date.now();
    if (now - sweptAt > 60_000) {
      sweptAt = now;
      const old = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
      const freshWalk = new Date(now - 45 * 60 * 1000).toISOString();
      await sql`
        update eights set status = 'gone', archived_at = coalesce(archived_at, now())
        where status = 'waiting'
          and created_at < ${old}
          and not exists (
            select 1 from walks where walks.eight_id = eights.id and walks.at >= ${freshWalk}
          )
      `;
    }
    const actor = await actorOf(data.personKey);
    const key = actor?.id ?? "";
    const rows = await sql<Record<string, unknown>>`
      select eights.id, eights.city, eights.country, eights.lat, eights.lng, eights.creator, eights.holder, eights.created_at, eights.story,
        case when eights.photo like '/%' then eights.photo else coalesce(thumbs.data, '') end as photo,
        eights.status, eights.confirmed_by, eights.owner_key, eights.confirmer_key, eights.archived_at,
        case
          when eights.status = 'confirmed' and (
            (${key} <> '' and (eights.owner_key = ${key} or eights.holder_key = ${key} or eights.confirmer_key = ${key}))
            or (${key} = '' and (lower(eights.creator) = lower(${who}) or lower(eights.confirmed_by) = lower(${who})))
          )
          then eights.confirm_photo
          else null
        end as confirm_photo
      from eights
      left join thumbs on thumbs.eight_id = eights.id
      where eights.status = 'waiting'
         or (
           eights.status = 'confirmed' and (
             (${key} <> '' and (eights.owner_key = ${key} or eights.holder_key = ${key} or eights.confirmer_key = ${key}))
             or (${key} = '' and (lower(eights.creator) = lower(${who}) or lower(eights.confirmed_by) = lower(${who})))
           )
         )
      order by eights.created_at desc
      limit 40
    `;
    const owners = new Map(rows.map((item) => [String(item.id), item.owner_key ? String(item.owner_key) : ""]));
    const found = await withEvents(sql, rows);
    return found.map((row) => {
      const keyed = Boolean(actor && owners.get(row.id) === actor.id);
      const loose = !owners.get(row.id) && Boolean(actor && actor.name.toLowerCase() === row.creator.trim().toLowerCase());
      if (photoOpen({ status: row.status, creator: row.creator, viewer: actor?.name ?? "", owner: keyed || loose, distanceM: null, accuracy: null })) return row;
      return { ...row, photo: "" };
    });
  });

export function loadBoard(name: string, personKey = "") {
  const stamp = personKey ? personKey.slice(-8) : "0";
  return share(`board:${name.trim().toLowerCase()}:${stamp}`, 8000, () => listBoard({ data: { name, personKey } }));
}

export function forgetBoard() {
  dropShare("board:");
}

export function loadDone(limit: number) {
  return share(`done:${limit}`, 20_000, () => listDone({ data: limit }));
}

export const listDone = createServerFn({ method: "POST" })
  .inputValidator((limit: number) => limit)
  .handler(async ({ data: limit }): Promise<Pick<BoardEight, "id" | "city" | "creator" | "confirmedBy" | "photo">[]> => {
    const sql = await sqlClient();
    const rows = await sql<{ id: string; city: string; creator: string; confirmed_by: string | null; photo: string }>`
      select id, city, creator, confirmed_by,
        case when eights.photo like '/%' then eights.photo else coalesce(thumbs.data, '') end as photo
      from eights
      left join thumbs on thumbs.eight_id = eights.id
      where status = 'confirmed' and reward_of is null and id not like '90010%' and (eights.photo like '/%' or thumbs.data is not null)
      order by confirmed_at desc nulls last
      limit ${Math.min(12, Math.max(1, limit || 8))}
    `;
    return rows.map((row) => ({
      id: row.id,
      city: row.city,
      creator: row.creator,
      confirmedBy: row.confirmed_by,
      photo: row.photo,
    }));
  });

export const readBoard = createServerFn({ method: "POST" })
  .inputValidator((input: string | { id: string; name?: string; personKey?: string; lat?: number; lng?: number; accuracy?: number }) => {
    if (typeof input === "string") return { id: input, name: "", personKey: "", lat: null as number | null, lng: null as number | null, accuracy: null as number | null };
    return {
      id: input.id,
      name: input.name ?? "",
      personKey: input.personKey ?? "",
      lat: typeof input.lat === "number" && Number.isFinite(input.lat) ? input.lat : null,
      lng: typeof input.lng === "number" && Number.isFinite(input.lng) ? input.lng : null,
      accuracy: typeof input.accuracy === "number" && Number.isFinite(input.accuracy) ? input.accuracy : null,
    };
  })
  .handler(async ({ data }): Promise<BoardEight | null> => {
    const sql = await sqlClient();
    const rows = await sql<Record<string, unknown>>`
      select id, city, country, lat, lng, creator, holder, created_at, story, status, confirmed_by, owner_key, confirmer_key, holder_key, archived_at,
        case when presence_until > now() then left(presence, 80) else '' end as presence,
        (select id from eights reward where reward.reward_of = eights.id limit 1) as reward_id,
        case
          when photo like '/%' then photo
          else coalesce((select data from thumbs where eight_id = eights.id), '')
        end as photo,
        case
          when status in ('confirmed', 'gone')
          then confirm_photo
          else null
        end as confirm_photo
      from eights where id = ${data.id} limit 1
    `;
    if (!rows[0]) return null;
    const actor = await actorOf(data.personKey);
    const ownerKey = rows[0].owner_key ? String(rows[0].owner_key) : "";
    const loose = !ownerKey && Boolean(actor && actor.name.toLowerCase() === String(rows[0].creator ?? "").trim().toLowerCase());
    const owner = Boolean(actor && ownerKey && actor.id === ownerKey);
    const [found] = await withEvents(sql, [rows[0]]);
    if (!found) return null;
    found.presence = String(rows[0].presence ?? "");
    found.own = owner;
    found.holds = Boolean(actor && rows[0].holder_key && actor.id === String(rows[0].holder_key));
    found.rewardId = rows[0].reward_id ? String(rows[0].reward_id) : undefined;
    found.firstInCity = await cityFirst(sql, found.id, found.city);
    if (found.status === "waiting") {
      await ensureLane(sql);
      const seen = await sql<{ n: number }>`
        select count(distinct c.person_key)::int as n
        from talk_chalk c
        join talks t on t.id = c.talk_id
        where t.eight_id = ${found.id} and coalesce(t.lane, 'wall') = 'wall'
      `;
      found.hintSeen = Number(seen[0]?.n ?? 0);
    }
    const distance = data.lat != null && data.lng != null && Number.isFinite(found.lat) && Number.isFinite(found.lng)
      ? kmBetween(data.lat, data.lng, found.lat, found.lng) * 1000
      : null;
    if (photoOpen({ status: found.status, creator: found.creator, viewer: actor?.name ?? "", owner: owner || loose, distanceM: distance, accuracy: data.accuracy })) {
      const full = await sql<{ photo: string; confirm_photo: string | null }>`select photo, confirm_photo from eights where id = ${data.id} limit 1`;
      if (full[0]?.photo) found.photo = String(full[0].photo);
      const confirm = full[0]?.confirm_photo;
      found.confirmPhoto = typeof confirm === "string" && confirm.startsWith("data:image/") ? confirm : found.confirmPhoto;
    } else {
      found.photo = found.photo.startsWith("/") || found.photo.startsWith("data:image/") ? found.photo : "";
      found.confirmPhoto = null;
    }
    return found;
  });

export const nearbyBoard = createServerFn({ method: "POST" })
  .inputValidator((input: { lat: number; lng: number; radiusM: number; accuracy?: number | null; personKey?: string }) => nearbyRequest(input))
  .handler(async ({ data }): Promise<{ ok: true; rows: NearbyCard[] } | { ok: false; error: string }> => {
    const problem = nearbyError(data);
    if (problem) return { ok: false, error: problem };
    const box = nearbyBounds(data.lat, data.lng, data.radiusM);
    const sql = await sqlClient();
    await clearExamples(sql);
    const rows = await sql<{ id: string; status: string; lat: number; lng: number; city: string; country: string; created_at: string; photo: string; story: string; creator: string; owner_key: string | null; presence: string }>`
      select eights.id, eights.status, eights.lat, eights.lng, eights.city, eights.country, eights.created_at, eights.creator, eights.owner_key,
        left(eights.story, 160) as story,
        case when eights.presence_until > now() then left(eights.presence, 80) else '' end as presence,
        case when eights.photo like '/%' then eights.photo else coalesce(thumbs.data, '') end as photo
      from eights
      left join thumbs on thumbs.eight_id = eights.id
      where eights.status = 'waiting'
        and eights.id not like '90010%'
        and eights.lat between ${box.minLat} and ${box.maxLat}
        and (
          (${box.minLng} <= ${box.maxLng} and eights.lng between ${box.minLng} and ${box.maxLng})
          or (${box.minLng} > ${box.maxLng} and (eights.lng >= ${box.minLng} or eights.lng <= ${box.maxLng}))
        )
      limit 400
    `;
    const actor = await actorOf(data.personKey);
    const face = new Map(rows.map((row) => [row.id, row]));
    return {
      ok: true,
      rows: selectNearby(
        rows.map((row) => ({
          id: row.id,
          status: row.status,
          lat: row.lat,
          lng: row.lng,
          city: row.city,
          country: row.country,
          placedAt: asText(row.created_at),
        })),
        data,
        data.radiusM,
      ).map((hit) => {
        const row = face.get(hit.id);
        const keyed = Boolean(actor && row?.owner_key && actor.id === row.owner_key);
        const loose = !row?.owner_key && Boolean(actor && actor.name.toLowerCase() === (row?.creator ?? "").trim().toLowerCase());
        const open = photoOpen({
          status: hit.status,
          creator: row?.creator ?? "",
          viewer: actor?.name ?? "",
          owner: keyed || loose,
          distanceM: hit.distanceM,
          accuracy: data.accuracy,
        });
        return {
          ...hit,
          photo: open ? row?.photo ?? "" : "",
          story: row?.story ?? "",
          creator: row?.creator ?? "",
          open,
          presence: row?.presence ?? "",
          own: keyed,
        };
      }),
    };
  });

export const setPresence = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; personKey?: string; text: string }) => ({
    id: input.id,
    personKey: input.personKey ?? "",
    text: (input.text ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const actor = await actorOf(data.personKey);
    if (!actor) return { ok: false, error: "Це може сказати лише той, хто намалював." };
    const sql = await sqlClient();
    const rows = await sql<{ owner_key: string | null; status: string }>`
      select owner_key, status from eights where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row || row.status !== "waiting") return { ok: false, error: "Сказати можна лише про стіну, яка ще чекає." };
    if (row.owner_key !== actor.id) return { ok: false, error: "Це каже лише той, хто намалював." };
    if (!data.text) {
      await sql`update eights set presence = '', presence_until = null where id = ${data.id} and owner_key = ${actor.id}`;
      return { ok: true };
    }
    const until = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    await sql`update eights set presence = ${data.text}, presence_until = ${until} where id = ${data.id} and owner_key = ${actor.id}`;
    return { ok: true };
  });

export type LifeNote = {
  id: string;
  eightId: string;
  city: string;
  kind: string;
  at: string;
  photo: string;
};

export const myLife = createServerFn({ method: "POST" })
  .inputValidator((input: { personKey?: string }) => ({ personKey: input.personKey ?? "" }))
  .handler(async ({ data }): Promise<LifeNote[]> => {
    const actor = await actorOf(data.personKey);
    if (!actor) return [];
    const sql = await sqlClient();
    const rows = await sql<{ id: string; eight_id: string; city: string; kind: string; at: string; photo: string }>`
      select ev.id, ev.eight_id, ev.kind, ev.at, e.city,
        case when e.photo like '/%' then e.photo else coalesce(thumbs.data, '') end as photo
      from eight_events ev
      join eights e on e.id = ev.eight_id
      left join thumbs on thumbs.eight_id = e.id
      where e.id not like '90010%'
        and (e.owner_key = ${actor.id} or e.holder_key = ${actor.id} or e.confirmer_key = ${actor.id})
      order by ev.at desc
      limit 12
    `;
    return rows.map((row) => ({
      id: row.id,
      eightId: row.eight_id,
      city: row.city,
      kind: row.kind,
      at: asText(row.at),
      photo: row.photo ?? "",
    }));
  });

export const confirmQuota = createServerFn({ method: "POST" })
  .inputValidator((input: { personKey?: string }) => ({ personKey: input.personKey ?? "" }))
  .handler(async ({ data }): Promise<{ used: number; left: number }> => {
    const actor = await actorOf(data.personKey);
    if (!actor) return { used: 0, left: 8 };
    const sql = await sqlClient();
    const since = dayAgo();
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from eights
      where confirmer_key = ${actor.id} and confirmed_at > ${since}
    `;
    const used = Math.min(8, Number(rows[0]?.n ?? 0));
    return { used, left: 8 - used };
  });

export const dropBoard = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; name: string; personKey?: string; device: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const name = data.name.trim();
    if (name.length < 2) return { ok: false, error: "Спочатку вкажи ім'я." };
    const sql = await sqlClient();
    const actor = await actorOf(data.personKey);
    if (!actor) return { ok: false, error: "Прибрати може лише власник цієї 8." };
    const rows = await sql<{ creator: string; status: string; owner_key: string | null; device: string | null }>`
      select creator, status, owner_key, device from eights where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row || row.status !== "waiting") return { ok: false, error: "Прибрати можна лише 8, яка ще чекає." };
    if (!mayArchive(actor.id, { ownerId: row.owner_key, status: row.status, device: row.device }, data.device)) {
      return { ok: false, error: "Прибрати може лише власник цієї 8." };
    }
    const gone = await sql<{ id: string; archived_at: string }>`
      update eights set status = 'gone', archived_at = coalesce(archived_at, now())
      where id = ${data.id} and status = 'waiting'
      returning id, archived_at
    `;
    if (!gone[0]) return { ok: false, error: "Прибрати можна лише 8, яка ще чекає." };
    await writeEvent(sql, { id: `e-arch-${data.id}`, eightId: data.id, at: asText(gone[0].archived_at), kind: "archived", by: actor.name, actorId: actor.id, status: "ARCHIVED" });
    return { ok: true };
  });

export const flagBoard = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; name: string; reason: string; personKey?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; left: number } | { ok: false; error: string }> => {
    const reason = data.reason.trim().slice(0, 80);
    if (reason.length < 3) return { ok: false, error: "Напиши, чого знака не має бути." };
    const actor = await actorOf(data.personKey);
    if (!actor) return { ok: false, error: "Скаргу може залишити лише людина з ключем." };
    const sql = await sqlClient();
    const rows = await sql<{ creator: string; status: string; owner_key: string | null }>`select creator, status, owner_key from eights where id = ${data.id} limit 1`;
    const row = rows[0];
    if (!row || row.status !== "waiting") return { ok: false, error: "Ця 8 вже не чекає на місці." };
    if (row.owner_key ? row.owner_key === actor.id : row.creator.trim().toLowerCase() === actor.name.toLowerCase()) {
      return { ok: false, error: "Свою 8 не скаржать. Її можна прибрати." };
    }
    await sql`
      insert into flags (eight_id, by_name, by_key, reason)
      values (${data.id}, ${actor.name.slice(0, 40)}, ${actor.id}, ${reason})
      on conflict (eight_id, by_key) do nothing
    `;
    const count = await sql<{ n: number }>`select count(*)::int as n from flags where eight_id = ${data.id}`;
    const n = Number(count[0]?.n ?? 0);
    if (n >= 3) await sql`update eights set status = 'hidden' where id = ${data.id} and status = 'waiting'`;
    return { ok: true, left: Math.max(0, 3 - n) };
  });

export const goBoard = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; name: string; lat: number; lng: number; personKey?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const actor = await actorOf(data.personKey);
    if (!actor) return { ok: false, error: "«Йду» може сказати лише людина з ключем." };
    const sql = await sqlClient();
    const rows = await sql<{ creator: string; status: string; lat: number; lng: number; owner_key: string | null; city: string }>`
      select creator, status, lat, lng, owner_key, city from eights where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row || row.status !== "waiting") return { ok: false, error: "Ця 8 вже не чекає." };
    if (row.owner_key ? row.owner_key === actor.id : row.creator.trim().toLowerCase() === actor.name.toLowerCase()) {
      return { ok: false, error: "До своєї стіни «Йду» не ставиться." };
    }
    const meters = haversine({ lat: data.lat, lng: data.lng }, row) * 1000;
    if (meters > 2000) return { ok: false, error: "«Йду» можна сказати ближче ніж за 2 км." };
    await sql`
      insert into walks (eight_id, by_name, by_key, at)
      values (${data.id}, ${actor.name.slice(0, 40)}, ${actor.id}, now())
      on conflict (eight_id, by_key) do update set at = now(), by_name = excluded.by_name
    `;
    const ownerKey = row.owner_key ? String(row.owner_key) : "";
    if (ownerKey) tell(ownerKey, `${actor.name} іде до твоєї стіни в ${row.city}.`, data.id);
    return { ok: true };
  });

export const walksBoard = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }): Promise<{ name: string; at: string }[]> => {
    const sql = await sqlClient();
    const since = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    await sql`delete from walks where eight_id = ${id} and at < ${since}`;
    const rows = await sql<{ by_name: string; at: string }>`
      select by_name, at from walks where eight_id = ${id} order by at desc limit 5
    `;
    return rows.map((row) => ({ name: row.by_name, at: new Date(row.at).toISOString() }));
  });

export const myWalks = createServerFn({ method: "POST" })
  .inputValidator((name: string) => name)
  .handler(async ({ data: name }): Promise<{ id: string; city: string; name: string; at: string }[]> => {
    const who = name.trim();
    if (who.length < 2) return [];
    const sql = await sqlClient();
    const since = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const rows = await sql<{ id: string; city: string; by_name: string; at: string }>`
      select e.id, e.city, w.by_name, w.at
      from walks w
      join eights e on e.id = w.eight_id
      where lower(e.creator) = lower(${who}) and e.status = 'waiting' and w.at >= ${since}
      order by w.at desc
      limit 5
    `;
    return rows.map((row) => ({ id: row.id, city: row.city, name: row.by_name, at: new Date(row.at).toISOString() }));
  });

export const publishBoard = createServerFn({ method: "POST" })
  .inputValidator((input: PublishInput) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!/^\d{6}$/.test(data.id)) return { ok: false, error: "Невірний номер." };
    if (data.creator.trim().length < 2) return { ok: false, error: "Потрібне ім'я." };
    if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return { ok: false, error: "Немає місця." };
    const place = coordError(data.lat, data.lng);
    if (place) return { ok: false, error: place };
    if (!photoFile(data.photo, 500_000)) return { ok: false, error: "Фото стіни не підійшло." };
    if (data.story.trim().length < 8 || data.story.trim().startsWith("Намальована")) return { ok: false, error: "Напиши, де шукати цю стіну." };
    if (!validDevice(data.device)) return { ok: false, error: "Телефон не впізнано." };
    const sql = await sqlClient();
    const actor = await actorOf(data.personKey);
    if (!actor) return { ok: false, error: "Спочатку запиши ім'я, щоб з'явився ключ." };
    const have = await sql<{ status: string; owner_key: string | null }>`select status, owner_key from eights where id = ${data.id} limit 1`;
    if (have[0]?.status === "gone" || have[0]?.status === "hidden") {
      return { ok: false, error: "Цю 8 прибрано з реєстру." };
    }
    if (have[0]) {
      if (have[0].owner_key !== actor.id) return { ok: false, error: "Цю 8 може змінювати лише власник." };
      const updated = await sql<{ id: string }>`
        update eights set device = coalesce(device, ${data.device})
        where id = ${data.id}
          and owner_key = ${actor.id}
          and status in ('waiting', 'confirmed')
        returning id
      `;
      if (!updated[0]) return { ok: false, error: "Цю 8 може змінювати лише власник." };
      return { ok: true };
    }
    const since = dayAgo();
    const burst = await sql<{ by_device: number; by_key: number }>`
      select
        count(*) filter (where device = ${data.device})::int as by_device,
        count(*) filter (where owner_key = ${actor.id})::int as by_key
      from eights
      where created_at > ${since} and reward_of is null
    `;
    if (Number(burst[0]?.by_key ?? 0) >= 8) return { ok: false, error: "За останні 24 години цим ключем уже 8 знаків." };
    if (Number(burst[0]?.by_device ?? 0) >= 8) return { ok: false, error: "За останні 24 години з цього телефона вже 8 знаків." };
    const issued = await confirmedCount(sql);
    if (issued >= NEXT_PHOTOS) return { ok: false, error: "8 мільярдів фото вже є. Нову стіну не ставлять. Ту, що чекає, ще можна підтвердити." };
    const key = photoKey(data.photo);
    const dup = await sql`select id from eights where photo_hash = ${key} or confirm_hash = ${key} limit 1`;
    if (dup.length > 0) return { ok: false, error: "Це фото вже стоїть на іншій 8." };
    const { keepShot } = await import("@/lib/shot.server");
    const stored = await keepShot(data.id, data.photo);
    if (!stored.startsWith("/")) return { ok: false, error: "Фото не збереглось." };
    const placedAt = new Date().toISOString();
    await sql`
      insert into eights (id, city, country, lat, lng, creator, holder, created_at, story, photo, status, device, photo_hash, owner_key, holder_key)
      values (
        ${data.id},
        ${data.city.slice(0, 80)},
        ${data.country.slice(0, 80)},
        ${data.lat},
        ${data.lng},
        ${actor.name.slice(0, 40)},
        ${actor.name.slice(0, 40)},
        ${placedAt},
        ${data.story.slice(0, 240)},
        ${stored},
        'waiting',
        ${data.device},
        ${key},
        ${actor.id},
        ${actor.id}
      )
    `;
    if (data.thumb && data.thumb.startsWith("data:image/") && data.thumb.length < 80_000) {
      await sql`
        insert into thumbs (eight_id, data) values (${data.id}, ${data.thumb})
        on conflict (eight_id) do update set data = excluded.data
      `;
    }
    await writeEvent(sql, { id: `e-created-${data.id}`, eightId: data.id, at: placedAt, kind: "created", by: actor.name, actorId: actor.id, status: "DRAFT" });
    await writeEvent(sql, { id: `e-placed-${data.id}`, eightId: data.id, at: placedAt, kind: "placed", by: actor.name, actorId: actor.id, status: "PLACED", lat: data.lat, lng: data.lng });
    return { ok: true };
  });

export const confirmBoard = createServerFn({ method: "POST" })
  .inputValidator((input: ConfirmInput) => input)
  .handler(async ({ data }): Promise<{ ok: true; row: BoardEight; rewardId: string; openedCity: boolean } | { ok: false; error: string }> => {
    const name = data.name.trim();
    if (name.length < 2) return { ok: false, error: "NO_NAME" };
    if (!photoFile(data.photo, 500_000)) return { ok: false, error: "NO_PHOTO" };
    const { keepShot } = await import("@/lib/shot.server");
    const stored = await keepShot(`${data.id}-c`, data.photo);
    if (!stored.startsWith("/")) return { ok: false, error: "Фото не збереглось." };
    if (!Number.isFinite(data.lat) || !Number.isFinite(data.lng)) return { ok: false, error: "NO_GPS" };
    if (placeFixError(data.accuracy)) return { ok: false, error: data.accuracy > MAX_FIX_ACCURACY_M ? "GPS_COARSE" : "NO_GPS" };
    if (!validDevice(data.device)) return { ok: false, error: "Телефон не впізнано." };
    const key = photoKey(data.photo);
    const sql = await sqlClient();
    const actor = await actorOf(data.personKey);
    if (!actor) return { ok: false, error: "Підтвердити може інша людина, зі своїм ключем." };
    const rows = await sql<Record<string, unknown>>`select * from eights where id = ${data.id} limit 1`;
    const row = rows[0];
    if (!row) return { ok: false, error: "Цієї 8 немає в додатку." };
    if (row.status === "gone" || row.status === "hidden") return { ok: false, error: "GONE" };
    if (row.status === "confirmed") return { ok: false, error: "ALREADY_CONFIRMED" };
    if (row.status !== "waiting") return { ok: false, error: "NOT_WAITING" };
    if (row.owner_key && actor.id === String(row.owner_key)) return { ok: false, error: "OWN_WALL" };
    if (!row.owner_key && actor.name.toLowerCase() === String(row.creator).trim().toLowerCase()) return { ok: false, error: "OWN_WALL" };
    if (row.device && String(row.device) === data.device) return { ok: false, error: "SAME_PHONE" };
    if (!mayVerify(actor.id, { ownerId: row.owner_key ? String(row.owner_key) : null, status: String(row.status), device: row.device ? String(row.device) : null }, data.device)) {
      return { ok: false, error: "Підтвердити може інша людина, зі своїм ключем." };
    }
    if (row.photo_hash && key === String(row.photo_hash)) return { ok: false, error: "SAME_PHOTO" };
    const sameShot = await sql`select id from eights where (photo_hash = ${key} or confirm_hash = ${key}) and id <> ${data.id} limit 1`;
    if (sameShot.length > 0) return { ok: false, error: "SAME_PHOTO" };
    const since = dayAgo();
    if (actor.id) {
      const byKey = await sql<{ n: number }>`
        select count(*)::int as n from eights
        where confirmer_key = ${actor.id} and confirmed_at > ${since}
      `;
      if (Number(byKey[0]?.n ?? 0) >= 8) return { ok: false, error: "DAY_LIMIT" };
    } else {
      const byName = await sql<{ n: number }>`
        select count(*)::int as n from eights
        where lower(confirmed_by) = lower(${actor.name}) and confirmed_at > ${since}
      `;
      if (Number(byName[0]?.n ?? 0) >= 8) return { ok: false, error: "DAY_LIMIT" };
    }
    const byDevice = await sql<{ n: number }>`
      select count(*)::int as n from eights
      where confirmer_device = ${data.device} and confirmed_at > ${since}
    `;
    if (Number(byDevice[0]?.n ?? 0) >= 8) return { ok: false, error: "DAY_LIMIT" };
    const ownerId = row.owner_key ? String(row.owner_key) : "";
    const pair = ownerId
      ? await sql<{ n: number }>`
          select count(*)::int as n from eights
          where owner_key = ${ownerId} and confirmer_key = ${actor.id} and confirmed_at > ${since} and reward_of is null
        `
      : await sql<{ n: number }>`
          select count(*)::int as n from eights
          where lower(creator) = lower(${String(row.creator)}) and lower(confirmed_by) = lower(${actor.name}) and confirmed_at > ${since}
        `;
    if (Number(pair[0]?.n ?? 0) >= 1) return { ok: false, error: "PAIR_LIMIT" };
    const meters = kmBetween(data.lat, data.lng, Number(row.lat), Number(row.lng)) * 1000;
    if (confirmDistanceError(meters)) return { ok: false, error: "TOO_FAR" };
    const at = new Date().toISOString();
    const won = await sql<{ id: string }>`
      update eights
      set status = 'confirmed', confirmed_by = ${actor.name.slice(0, 40)}, confirmed_at = ${at}, confirmer_device = ${data.device}, confirmer_key = ${actor.id}, confirm_photo = ${stored}, confirm_hash = ${key}
      where id = ${data.id} and status = 'waiting'
      returning id
    `;
    if (!won[0]) return { ok: false, error: "ALREADY_CONFIRMED" };
    const next = await sql<Record<string, unknown>>`
      select id, city, country, lat, lng, creator, holder, created_at, story, photo, status, confirmed_by, confirm_photo
      from eights where id = ${data.id} limit 1
    `;
    if (!next[0]) return { ok: false, error: "Не вдалося зарахувати." };
    const who = actor.name.slice(0, 40);
    await writeEvent(sql, { id: `e-req-${data.id}`, eightId: data.id, at, kind: "verification_requested", by: who, actorId: actor.id, status: "WAITING_VERIFICATION", lat: data.lat, lng: data.lng });
    await writeEvent(sql, { id: `e-ver-${data.id}`, eightId: data.id, at, kind: "verified", by: who, actorId: actor.id, status: "VERIFIED", lat: data.lat, lng: data.lng });
    await writeEvent(sql, { id: `e-act-${data.id}`, eightId: data.id, at, kind: "activated", by: who, actorId: actor.id, status: "ACTIVE" });
    const ids = await nextFreeId(sql);
    const rewardId = ids;
    if (!rewardId) return { ok: false, error: "Немає вільного номера для другої 8." };
    await sql`
      insert into eights (id, city, country, lat, lng, creator, holder, created_at, story, photo, status, confirmed_by, confirmed_at, reward_of, owner_key, holder_key)
      values (
        ${rewardId},
        ${String(next[0].city)},
        ${String(next[0].country)},
        ${Number(next[0].lat)},
        ${Number(next[0].lng)},
        ${who},
        ${who},
        ${at},
        ${`Підтвердження 8 ${data.id}. Одна 8 за спільну дію.`},
        ${String(next[0].photo ?? "")},
        'confirmed',
        ${who},
        ${at},
        ${data.id},
        ${actor.id},
        ${actor.id}
      )
    `;
    await writeEvent(sql, { id: `e-created-${rewardId}`, eightId: rewardId, at, kind: "created", by: who, actorId: actor.id, status: "DRAFT" });
    await writeEvent(sql, { id: `e-ver-${rewardId}`, eightId: rewardId, at, kind: "verified", by: who, actorId: actor.id, status: "VERIFIED" });
    await writeEvent(sql, { id: `e-act-${rewardId}`, eightId: rewardId, at, kind: "activated", by: who, actorId: actor.id, status: "ACTIVE" });
    const owner = await sql<{ owner_key: string | null; city: string }>`select owner_key, city from eights where id = ${data.id} limit 1`;
    const ownerKey = owner[0]?.owner_key ? String(owner[0].owner_key) : "";
    if (ownerKey && ownerKey !== actor.id) {
      tell(ownerKey, `${who} підтвердив ${eightNo(data.id)}. Твій номер лишився. Його 8 — ${eightNo(rewardId)}.`, data.id);
    }
    const openedCity = await cityFirst(sql, data.id, String(next[0].city ?? ""));
    return { ok: true, row: rowEight(next[0]), rewardId, openedCity };
  });

const HALL = "hall";

export const listHall = createServerFn({ method: "POST" })
  .inputValidator((input: { personKey?: string }) => ({ personKey: input.personKey ?? "" }))
  .handler(async (): Promise<{ ok: true; rows: BoardTalk[] } | { ok: false; error: string }> => {
    const sql = await sqlClient();
    const rows = await sql<Record<string, unknown>>`
      select id, eight_id, by_name, body, at from talks
      where eight_id = ${HALL}
      order by at desc
      limit 80
    `;
    return {
      ok: true,
      rows: rows.map((row) => ({
        id: String(row.id),
        eightId: HALL,
        by: String(row.by_name),
        text: String(row.body),
        at: asText(row.at),
        chalk: 0,
        mine: false,
        replyTo: "",
        replyText: "",
      })),
    };
  });

export const postHall = createServerFn({ method: "POST" })
  .inputValidator((input: { personKey?: string; text: string }) => ({ personKey: input.personKey ?? "", text: input.text ?? "" }))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const actor = await actorOf(data.personKey);
    if (!actor) return { ok: false, error: "Писати в залі може лише людина з ключем." };
    if (actor.name.trim().length < 2) return { ok: false, error: "Спочатку запиши ім’я в профілі." };
    const text = data.text.trim();
    if (text.length < 2) return { ok: false, error: "Напиши хоча б пару слів." };
    if (text.length > 280) return { ok: false, error: "Повідомлення коротше за 280 знаків." };
    if (/8-[A-Z0-9]{4}/i.test(text)) return { ok: false, error: "Ключ сюди не пишуть." };
    const sql = await sqlClient();
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const burst = await sql<{ n: number }>`
      select count(*)::int as n from talks
      where eight_id = ${HALL} and by_key = ${actor.id} and at > ${since}
    `;
    if (Number(burst[0]?.n ?? 0) >= 20) return { ok: false, error: "За 24 години в залі вже 20 повідомлень з цього ключа." };
    const id = `h-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await sql`
      insert into talks (id, eight_id, by_name, by_key, body, at)
      values (${id}, ${HALL}, ${actor.name.slice(0, 40)}, ${actor.id}, ${text}, ${new Date().toISOString()})
    `;
    return { ok: true };
  });

let laneReady: Promise<void> | null = null;

function ensureLane(sql: Awaited<ReturnType<typeof sqlClient>>) {
  laneReady ??= (async () => {
    await sql`alter table talks add column if not exists lane text not null default 'wall'`;
    await sql`alter table talks add column if not exists listing_id text`;
    await sql`alter table talks add column if not exists reply_to text`;
    await sql`
      create table if not exists talk_seen (
        eight_id text not null,
        lane text not null,
        listing_id text not null default '',
        person_key text not null,
        at timestamptz not null,
        primary key (eight_id, lane, listing_id, person_key)
      )
    `;
    await sql`
      create table if not exists talk_chalk (
        talk_id text not null,
        person_key text not null,
        primary key (talk_id, person_key)
      )
    `;
  })().catch((error) => {
    laneReady = null;
    throw error;
  });
  return laneReady;
}

async function dealDoor(sql: Awaited<ReturnType<typeof sqlClient>>, eightId: string, actor: { id: string; name: string }, write: boolean) {
  const rows = await sql<{ id: string; status: string; seller: string; seller_key: string | null; reserved_by: string | null; buyer: string | null; buyer_key: string | null; reserved_at: string | null; created_at: string }>`
    select id, status, seller, seller_key, reserved_by, buyer, buyer_key, reserved_at, created_at
    from listings
    where eight_id = ${eightId} and status in ('reserved', 'sold')
    order by coalesce(sold_at, reserved_at, created_at) desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return { ok: false as const, error: "Писати в угоді можна лише поки є бронь." };
  const sellerOk = row.seller_key ? row.seller_key === actor.id : row.seller.trim().toLowerCase() === actor.name.trim().toLowerCase();
  const buyerName = String((row.status === "sold" ? row.buyer : row.reserved_by) ?? "");
  const buyerOk = row.buyer_key ? row.buyer_key === actor.id : buyerName.trim().toLowerCase() === actor.name.trim().toLowerCase();
  if (!sellerOk && !buyerOk) return { ok: false as const, error: "Ця угода не твоя." };
  if (write && row.status !== "reserved") return { ok: false as const, error: "Угода вже закрита." };
  const otherKey = sellerOk ? String(row.buyer_key ?? "") : String(row.seller_key ?? "");
  return {
    ok: true as const,
    otherKey,
    status: String(row.status),
    listingId: String(row.id),
    since: asText(row.reserved_at || row.created_at),
  };
}

export const listRooms = createServerFn({ method: "POST" })
  .inputValidator((input: string | { name?: string; personKey?: string }) =>
    typeof input === "string" ? { name: input, personKey: "" } : { name: input.name ?? "", personKey: input.personKey ?? "" },
  )
  .handler(async ({ data }): Promise<BoardRoom[]> => {
    const actor = await actorOf(data.personKey);
    const who = (actor?.name || data.name).trim();
    const key = actor?.id ?? "";
    if (!key && who.length < 2) return [];
    const sql = await sqlClient();
    await ensureLane(sql);
    const rows = await sql<Record<string, unknown>>`
      select e.id, e.city, e.status, m.by_name, m.body, m.at,
        case when e.photo like '/%' then e.photo else coalesce(th.data, '') end as photo
      from eights e
      join talks m on m.id = (
        select id from talks t where t.eight_id = e.id and coalesce(t.lane, 'wall') = 'wall' order by at desc limit 1
      )
      left join thumbs th on th.eight_id = e.id
      where e.id <> 'hall'
        and (
          (${key} <> '' and (
            e.owner_key = ${key} or e.holder_key = ${key} or e.confirmer_key = ${key}
            or (${who} <> '' and exists (
              select 1 from talks mine
              where mine.eight_id = e.id and lower(mine.by_name) = lower(${who}) and coalesce(mine.lane, 'wall') = 'wall'
            ))
          ))
          or (${key} = '' and (
            lower(e.creator) = lower(${who})
            or lower(coalesce(e.holder, '')) = lower(${who})
            or lower(coalesce(e.confirmed_by, '')) = lower(${who})
            or exists (
              select 1 from talks mine
              where mine.eight_id = e.id and lower(mine.by_name) = lower(${who}) and coalesce(mine.lane, 'wall') = 'wall'
            )
          ))
        )
      order by m.at desc
      limit 40
    `;
    const deals = await sql<Record<string, unknown>>`
      select e.id, e.city, e.status, l.status as deal_status, m.by_name, m.body, coalesce(m.at, l.sold_at, l.reserved_at) as at,
        case when e.photo like '/%' then e.photo else coalesce(th.data, '') end as photo
      from listings l
      join eights e on e.id = l.eight_id
      left join talks m on m.id = (
        select id from talks t
        where t.eight_id = e.id and t.lane = 'deal'
          and (
            t.listing_id = l.id
            or (t.listing_id is null and t.at >= coalesce(l.reserved_at, l.created_at))
          )
        order by at desc limit 1
      )
      left join thumbs th on th.eight_id = e.id
      where l.id = (
        select x.id from listings x
        where x.eight_id = l.eight_id and x.status in ('reserved', 'sold')
        order by coalesce(x.sold_at, x.reserved_at, x.created_at) desc
        limit 1
      )
        and (
          (${key} <> '' and (l.seller_key = ${key} or l.buyer_key = ${key}))
          or (${key} = '' and ${who} <> '' and (
            lower(l.seller) = lower(${who})
            or lower(coalesce(case when l.status = 'sold' then l.buyer else l.reserved_by end, '')) = lower(${who})
          ))
        )
      order by coalesce(m.at, l.sold_at, l.reserved_at) desc
      limit 20
    `;
    const room = (row: Record<string, unknown>, lane: "wall" | "deal"): BoardRoom => ({
      id: String(row.id),
      city: String(row.city),
      photo: String(row.photo ?? ""),
      status: row.status === "confirmed" ? "confirmed" : "waiting",
      lane,
      lastBy: String(row.by_name ?? ""),
      lastText: String(row.body ?? ""),
      lastAt: row.at ? asText(row.at) : "",
      ...(lane === "deal" && String(row.deal_status ?? "") === "sold" ? { closed: true } : {}),
    });
    return [...deals.map((row) => room(row, "deal")), ...rows.map((row) => room(row, "wall"))]
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0))
      .slice(0, 40);
  });

export const listTalks = createServerFn({ method: "POST" })
  .inputValidator((input: string | { id: string; lane?: string; personKey?: string }) =>
    typeof input === "string"
      ? { id: input, lane: "wall" as const, personKey: "" }
      : { id: input.id, lane: input.lane === "deal" ? "deal" as const : "wall" as const, personKey: input.personKey ?? "" },
  )
  .handler(async ({ data }): Promise<{ rows: BoardTalk[]; note: string; otherRead: string }> => {
    const sql = await sqlClient();
    await ensureLane(sql);
    let note = "";
    let listingId = "";
    let since = "1970-01-01T00:00:00.000Z";
    const actor = data.personKey ? await actorOf(data.personKey) : null;
    if (data.lane === "deal") {
      const have = await sql`select id from eights where id = ${data.id} limit 1`;
      if (have.length === 0) return { rows: [], note: "Цієї 8 ще немає в додатку.", otherRead: "" };
      if (!actor) return { rows: [], note: "Писати може лише людина з ключем.", otherRead: "" };
      const door = await dealDoor(sql, data.id, actor, false);
      if (!door.ok) return { rows: [], note: door.error, otherRead: "" };
      if (door.status !== "reserved") note = "Угода вже закрита.";
      listingId = door.listingId;
      since = door.since;
    }
    const rows = await sql<Record<string, unknown>>`
      select id, eight_id, by_name, body, at, reply_to from talks
      where eight_id = ${data.id} and coalesce(lane, 'wall') = ${data.lane}
        and (
          ${data.lane} <> 'deal'
          or listing_id = ${listingId}
          or (listing_id is null and at >= ${since})
        )
      order by at asc
      limit 80
    `;
    const marks = new Map<string, { n: number; mine: boolean }>();
    if (data.lane === "wall") {
      const chalk = await sql<{ talk_id: string; n: number; mine: boolean }>`
        select c.talk_id, count(*)::int as n, bool_or(c.person_key = ${actor?.id ?? ""}) as mine
        from talk_chalk c
        join talks t on t.id = c.talk_id
        where t.eight_id = ${data.id} and coalesce(t.lane, 'wall') = 'wall'
        group by c.talk_id
      `;
      for (const mark of chalk) {
        const mine = mark.mine as unknown;
        marks.set(String(mark.talk_id), { n: Number(mark.n ?? 0), mine: mine === true || mine === "t" });
      }
    }
    let otherRead = "";
    if (data.lane === "deal" && actor && listingId) {
      const latest = rows.length > 0 ? asText(rows[rows.length - 1].at) : "";
      if (latest) {
        await sql`
          insert into talk_seen (eight_id, lane, listing_id, person_key, at)
          values (${data.id}, 'deal', ${listingId}, ${actor.id}, ${latest})
          on conflict (eight_id, lane, listing_id, person_key) do update set at = excluded.at
        `;
      }
      const seen = await sql<{ at: string }>`
        select max(at) as at from talk_seen
        where eight_id = ${data.id} and lane = 'deal' and listing_id = ${listingId} and person_key <> ${actor.id}
      `;
      otherRead = seen[0]?.at ? asText(seen[0].at) : "";
    }
    return {
      note,
      otherRead,
      rows: rows.map((row) => {
        const id = String(row.id);
        const mark = marks.get(id);
        const replyTo = row.reply_to ? String(row.reply_to) : "";
        const parent = replyTo ? rows.find((item) => String(item.id) === replyTo) : undefined;
        return {
          id,
          eightId: String(row.eight_id),
          by: String(row.by_name),
          text: String(row.body),
          at: asText(row.at),
          chalk: mark?.n ?? 0,
          mine: mark?.mine ?? false,
          replyTo,
          replyText: parent ? String(parent.body ?? "").slice(0, 80) : "",
        };
      }),
    };
  });

export const postTalk = createServerFn({ method: "POST" })
  .inputValidator((input: { eightId: string; name?: string; text: string; personKey?: string; lane?: string; replyTo?: string }) => ({
    eightId: input.eightId,
    text: input.text ?? "",
    personKey: input.personKey ?? "",
    lane: input.lane === "deal" ? "deal" as const : "wall" as const,
    replyTo: (input.replyTo ?? "").trim().slice(0, 40),
  }))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const actor = await actorOf(data.personKey);
    if (!actor) return { ok: false, error: "Писати може лише людина з ключем." };
    if (actor.name.trim().length < 2) return { ok: false, error: "Спочатку запиши ім’я в профілі." };
    const text = data.text.trim();
    if (text.length < 2) return { ok: false, error: "Напиши хоча б пару слів." };
    if (text.length > 280) return { ok: false, error: "Повідомлення коротше за 280 знаків." };
    if (/8-[A-Z0-9]{4}/i.test(text) || /\bключ\b/i.test(text) && /8-/.test(text)) return { ok: false, error: "Ключ сюди не пишуть." };
    const sql = await sqlClient();
    await ensureLane(sql);
    const have = await sql<{ owner_key: string | null; holder_key: string | null; confirmer_key: string | null }>`
      select owner_key, holder_key, confirmer_key from eights where id = ${data.eightId} limit 1
    `;
    if (have.length === 0) return { ok: false, error: "Цієї 8 ще немає в додатку." };
    const door = data.lane === "deal" ? await dealDoor(sql, data.eightId, actor, true) : null;
    if (door && !door.ok) return door;
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const burst = await sql<{ n: number }>`
      select count(*)::int as n from talks
      where eight_id = ${data.eightId} and by_key = ${actor.id} and coalesce(lane, 'wall') = ${data.lane} and at > ${since}
    `;
    if (Number(burst[0]?.n ?? 0) >= 40) return { ok: false, error: "За 24 години в цьому чаті вже досить повідомлень." };
    const id = `n-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
    const listingId = door?.ok ? door.listingId : null;
    let replyTo: string | null = null;
    if (data.replyTo) {
      const parent = await sql`select id from talks where id = ${data.replyTo} and eight_id = ${data.eightId} and coalesce(lane, 'wall') = ${data.lane} limit 1`;
      if (parent[0]) replyTo = data.replyTo;
    }
    await sql`
      insert into talks (id, eight_id, by_name, by_key, body, at, lane, listing_id, reply_to)
      values (${id}, ${data.eightId}, ${actor.name.slice(0, 40)}, ${actor.id}, ${text}, ${new Date().toISOString()}, ${data.lane}, ${listingId}, ${replyTo})
    `;
    if (door?.ok && door.otherKey && door.otherKey !== actor.id) {
      tell(door.otherKey, `${actor.name} написав в угоді ${eightNo(data.eightId)}.`, data.eightId, `/talk/${data.eightId}?deal=1`);
    } else if (!door) {
      const heard = new Set(
        [have[0]?.owner_key, have[0]?.holder_key, have[0]?.confirmer_key].filter((key): key is string => Boolean(key) && key !== actor.id),
      );
      for (const key of heard) tell(key, `${actor.name} написав про ${eightNo(data.eightId)}.`, data.eightId, `/talk/${data.eightId}`);
    }
    return { ok: true };
  });

export const markChalk = createServerFn({ method: "POST" })
  .inputValidator((input: { talkId?: string; personKey?: string }) => ({
    talkId: (input.talkId ?? "").trim().slice(0, 40),
    personKey: input.personKey ?? "",
  }))
  .handler(async ({ data }): Promise<{ ok: true; mine: boolean; chalk: number } | { ok: false; error: string }> => {
    const actor = await actorOf(data.personKey);
    if (!actor) return { ok: false, error: "Спочатку ключ." };
    if (!data.talkId) return { ok: false, error: "Немає повідомлення." };
    const sql = await sqlClient();
    await ensureLane(sql);
    const rows = await sql<{ eight_id: string; by_key: string | null; lane: string | null }>`
      select eight_id, by_key, lane from talks where id = ${data.talkId} limit 1
    `;
    const talk = rows[0];
    if (!talk) return { ok: false, error: "Повідомлення зникло." };
    if (String(talk.eight_id) === HALL || String(talk.lane ?? "wall") !== "wall") return { ok: false, error: "Тут лише читають." };
    if (talk.by_key && String(talk.by_key) === actor.id) return { ok: false, error: "Своє не позначають." };
    const have = await sql`select talk_id from talk_chalk where talk_id = ${data.talkId} and person_key = ${actor.id} limit 1`;
    if (have[0]) await sql`delete from talk_chalk where talk_id = ${data.talkId} and person_key = ${actor.id}`;
    else await sql`insert into talk_chalk (talk_id, person_key) values (${data.talkId}, ${actor.id})`;
    const count = await sql<{ n: number }>`select count(*)::int as n from talk_chalk where talk_id = ${data.talkId}`;
    return { ok: true, mine: !have[0], chalk: Number(count[0]?.n ?? 0) };
  });

export const pullTalk = createServerFn({ method: "POST" })
  .inputValidator((input: { talkId?: string; personKey?: string }) => ({
    talkId: (input.talkId ?? "").trim().slice(0, 40),
    personKey: input.personKey ?? "",
  }))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const actor = await actorOf(data.personKey);
    if (!actor) return { ok: false, error: "Спочатку ключ." };
    if (!data.talkId) return { ok: false, error: "Немає повідомлення." };
    const sql = await sqlClient();
    await ensureLane(sql);
    const rows = await sql<{ eight_id: string; by_key: string | null; lane: string | null; at: string }>`
      select eight_id, by_key, lane, at from talks where id = ${data.talkId} limit 1
    `;
    const talk = rows[0];
    if (!talk) return { ok: false, error: "Повідомлення зникло." };
    if (String(talk.eight_id) === HALL) return { ok: false, error: "У форумі рядок лишається." };
    if (String(talk.by_key ?? "") !== actor.id) return { ok: false, error: "Прибрати можна лише свій рядок." };
    const at = new Date(asText(talk.at)).getTime();
    if (!Number.isFinite(at) || Date.now() - at > 15 * 60 * 1000) return { ok: false, error: "Пізно прибирати. Рядок лишається." };
    const lane = String(talk.lane ?? "wall");
    if (lane === "deal") {
      const door = await dealDoor(sql, String(talk.eight_id), actor, true);
      if (!door.ok) return door;
    } else if (lane !== "wall") return { ok: false, error: "Цей рядок не прибрати." };
    await sql`delete from talk_chalk where talk_id = ${data.talkId}`;
    await sql`delete from talks where id = ${data.talkId} and by_key = ${actor.id}`;
    return { ok: true };
  });

export type MarketCard = {
  listingId: string;
  eightId: string;
  city: string;
  photo: string;
  seller: string;
  currency: "UAH" | "USD" | "EUR";
  amount: number;
  reservedBy: string | null;
  reservedAt: string | null;
};

export type PassedDeal = {
  eightId: string;
  buyer: string;
  amount: number;
  currency: string;
};

const MONEY = new Set(["UAH", "USD", "EUR"]);

let bidsReady: Promise<void> | null = null;

function ensureBids(sql: Awaited<ReturnType<typeof sqlClient>>) {
  bidsReady ??= sql`
    create table if not exists bids (
      id text primary key,
      person_key text not null default '',
      name text not null,
      currency text not null,
      amount double precision not null,
      city text not null default '',
      status text not null default 'open',
      created_at timestamptz not null default now()
    )
  `.then(() => undefined).catch((error) => {
    bidsReady = null;
    throw error;
  });
  return bidsReady;
}
export const RESERVE_MS = 2 * 60 * 60 * 1000;

async function releaseStale(sql: Awaited<ReturnType<typeof sqlClient>>) {
  const cutoff = new Date(Date.now() - RESERVE_MS).toISOString();
  const dropped = await sql<{ eight_id: string; seller_key: string | null; buyer_key: string | null }>`
    update listings
    set status = 'open', reserved_by = null, reserved_at = null, buyer_key = null
    where status = 'reserved' and reserved_at is not null and reserved_at < ${cutoff}
    returning eight_id, seller_key, buyer_key
  `;
  for (const row of dropped) {
    const id = String(row.eight_id);
    const line = `Бронь на ${eightNo(id)} зійшла. 8 знову на дошці.`;
    if (row.seller_key) tell(String(row.seller_key), line, id, "/exchange");
    if (row.buyer_key && row.buyer_key !== row.seller_key) tell(String(row.buyer_key), line, id, "/exchange");
  }
}

async function clearExamples(sql: Awaited<ReturnType<typeof sqlClient>>) {
  await sql`delete from listings where eight_id like '90010%'`;
  await sql`update eights set status = 'hidden' where id like '90010%' and status <> 'hidden'`;
}

export const salePulse = createServerFn({ method: "POST" })
  .inputValidator((input: string | { name?: string; personKey?: string }) =>
    typeof input === "string" ? { name: input, personKey: "" } : { name: input.name ?? "", personKey: input.personKey ?? "" },
  )
  .handler(async ({ data }): Promise<number> => {
    const who = data.name.trim();
    const actor = await actorOf(data.personKey);
    if (!actor && who.length < 2) return 0;
    const sql = await sqlClient();
    await releaseStale(sql);
    const key = actor?.id ?? "";
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from listings
      where status = 'reserved'
        and (
          (${key} <> '' and (seller_key = ${key} or buyer_key = ${key}))
          or (${key} = '' and (lower(seller) = lower(${who}) or lower(reserved_by) = lower(${who})))
        )
    `;
    return Number(rows[0]?.n ?? 0);
  });

export const listMarket = createServerFn({ method: "POST" })
  .inputValidator((input: string | { name?: string; personKey?: string }) =>
    typeof input === "string" ? { name: input, personKey: "" } : { name: input.name ?? "", personKey: input.personKey ?? "" },
  )
  .handler(async ({ data }): Promise<{ open: MarketCard[]; mine: BoardEight[]; passed: PassedDeal[]; bought: PassedDeal[] }> => {
    const sql = await sqlClient();
    const who = data.name.trim();
    const actor = await actorOf(data.personKey);
    const key = actor?.id ?? "";
    await releaseStale(sql);
    await clearExamples(sql);
    const openRows = await sql<Record<string, unknown>>`
      select l.id, l.eight_id, l.seller, l.currency, l.amount, l.reserved_by, l.reserved_at, e.city,
        case when e.photo like '/%' then e.photo else coalesce(t.data, '') end as photo
      from listings l
      join eights e on e.id = l.eight_id
      left join thumbs t on t.eight_id = e.id
      where l.status in ('open', 'reserved')
        and l.eight_id not like '90010%'
      order by l.amount asc
      limit 80
    `;
    const mineRows = await sql<Record<string, unknown>>`
      select eights.id, eights.city, eights.country, eights.lat, eights.lng, eights.creator, eights.holder, eights.created_at, eights.story, eights.status, eights.confirmed_by,
        case when eights.photo like '/%' then eights.photo else coalesce(thumbs.data, '') end as photo
      from eights
      left join thumbs on thumbs.eight_id = eights.id
      where eights.status = 'confirmed'
        and (
          (${key} <> '' and eights.holder_key = ${key})
          or (${key} = '' and lower(eights.holder) = lower(${who}))
        )
      order by eights.created_at desc
      limit 20
    `;
    const passedRows = await sql<Record<string, unknown>>`
      select eight_id, buyer, amount, currency
      from listings
      where status = 'sold'
        and (
          (${key} <> '' and seller_key = ${key})
          or (${key} = '' and lower(seller) = lower(${who}))
        )
      order by sold_at desc
      limit 20
    `;
    const boughtRows = await sql<Record<string, unknown>>`
      select eight_id, seller, amount, currency
      from listings
      where status = 'sold'
        and (
          (${key} <> '' and buyer_key = ${key})
          or (${key} = '' and lower(buyer) = lower(${who}))
        )
      order by sold_at desc
      limit 20
    `;
    return {
      open: openRows.map((row) => ({
        listingId: String(row.id),
        eightId: String(row.eight_id),
        city: String(row.city),
        photo: String(row.photo ?? ""),
        seller: String(row.seller),
        currency: (MONEY.has(String(row.currency)) ? String(row.currency) : "UAH") as MarketCard["currency"],
        amount: Number(row.amount),
        reservedBy: row.reserved_by ? String(row.reserved_by) : null,
        reservedAt: row.reserved_at ? asText(row.reserved_at) : null,
      })),
      mine: mineRows.map(rowEight),
      passed: passedRows.map((row) => ({
        eightId: String(row.eight_id),
        buyer: String(row.buyer ?? ""),
        amount: Number(row.amount),
        currency: String(row.currency),
      })),
      bought: boughtRows.map((row) => ({
        eightId: String(row.eight_id),
        buyer: String(row.seller ?? ""),
        amount: Number(row.amount),
        currency: String(row.currency),
      })),
    };
  });

export const NEXT_PHOTOS = 8_000_000_000;

export type MarketPulse = {
  issued: number;
  cities: number;
  need: number;
  left: number;
};

export const marketPulse = createServerFn({ method: "POST" })
  .inputValidator(() => ({}))
  .handler(async (): Promise<MarketPulse> => {
    const sql = await sqlClient();
    const issued = await confirmedCount(sql);
    const cityRows = await sql<{ n: number }>`
      select count(distinct lower(trim(city)))::int as n from eights
      where status = 'confirmed' and id not like '90010%' and length(trim(city)) > 1
    `;
    const need = NEXT_PHOTOS;
    return {
      issued,
      cities: Number(cityRows[0]?.n ?? 0),
      need,
      left: Math.max(0, need - issued),
    };
  });

export type CityMark = {
  city: string;
  country: string;
  held: number;
  waiting: number;
  selling: number;
  ask: number | null;
  askCurrency: string;
};

let cityIndex: Promise<void> | null = null;

export const cityAtlas = createServerFn({ method: "POST" })
  .inputValidator(() => ({}))
  .handler(async (): Promise<CityMark[]> => {
    const sql = await sqlClient();
    cityIndex ??= sql`
      create index if not exists eights_city_status_idx on eights (lower(city), status)
    `.then(() => undefined).catch((error) => {
      cityIndex = null;
      throw error;
    });
    await cityIndex;
    const rows = await sql<{ city: string; country: string; held: number; waiting: number }>`
      select max(trim(city)) as city,
             max(trim(country)) as country,
             sum(case when status = 'confirmed' then 1 else 0 end)::int as held,
             sum(case when status = 'waiting' then 1 else 0 end)::int as waiting
      from eights
      where id not like '90010%'
        and status in ('waiting', 'confirmed')
        and length(trim(city)) > 1
      group by lower(trim(city)), lower(trim(country))
      order by held desc, waiting desc, city asc
      limit 60
    `;
    const sales = await sql<{ ckey: string; kcountry: string; amount: number; currency: string }>`
      select lower(trim(e.city)) as ckey,
             lower(trim(e.country)) as kcountry,
             l.amount,
             l.currency
      from listings l
      join eights e on e.id = l.eight_id
      where l.status = 'open'
        and e.id not like '90010%'
        and length(trim(e.city)) > 1
      limit 300
    `;
    const book = new Map<string, { n: number; amount: number; currency: string }>();
    for (const sale of sales) {
      const key = `${sale.ckey}|${sale.kcountry}`;
      const amount = Number(sale.amount);
      const prev = book.get(key);
      if (!prev) book.set(key, { n: 1, amount, currency: String(sale.currency) });
      else {
        prev.n += 1;
        if (amount < prev.amount) {
          prev.amount = amount;
          prev.currency = String(sale.currency);
        }
      }
    }
    return rows
      .map((row) => {
        const city = String(row.city);
        const country = String(row.country ?? "");
        const sale = book.get(`${city.toLowerCase()}|${country.toLowerCase()}`);
        return {
          city,
          country,
          held: Number(row.held),
          waiting: Number(row.waiting),
          selling: sale?.n ?? 0,
          ask: sale ? sale.amount : null,
          askCurrency: sale?.currency ?? "",
        };
      })
      .sort((a, b) => b.selling - a.selling || b.held - a.held || b.waiting - a.waiting || a.city.localeCompare(b.city, "uk"));
  });

export type CityWall = {
  id: string;
  status: "waiting" | "confirmed";
  photo: string;
  hint: string;
  ask: number | null;
  askCurrency: string;
};

export const cityWalls = createServerFn({ method: "POST" })
  .inputValidator((input: { city?: string; country?: string }) => ({
    city: (input?.city ?? "").trim().slice(0, 80),
    country: (input?.country ?? "").trim().slice(0, 80),
  }))
  .handler(async ({ data }): Promise<CityWall[]> => {
    if (data.city.length < 2) return [];
    const sql = await sqlClient();
    const rows = await sql<{ id: string; status: string; photo: string; story: string; ask: number | null; ask_currency: string | null }>`
      select eights.id, eights.status,
        left(eights.story, 120) as story,
        case
          when eights.status = 'confirmed' and eights.photo like '/%' then eights.photo
          when eights.status = 'confirmed' then coalesce(thumbs.data, '')
          else ''
        end as photo,
        sale.amount as ask,
        sale.currency as ask_currency
      from eights
      left join thumbs on thumbs.eight_id = eights.id
      left join lateral (
        select amount, currency from listings
        where listings.eight_id = eights.id and listings.status = 'open'
        order by amount asc
        limit 1
      ) sale on true
      where eights.id not like '90010%'
        and eights.status in ('waiting', 'confirmed')
        and lower(trim(eights.city)) = lower(${data.city})
        and lower(trim(eights.country)) = lower(${data.country})
      order by case when sale.amount is null then 1 else 0 end,
               case when eights.status = 'waiting' then 0 else 1 end,
               eights.created_at desc
      limit 40
    `;
    return rows.map((row) => {
      const story = String(row.story ?? "").trim();
      const hint = story.startsWith("Намальована") ? "" : story;
      const status = row.status === "waiting" ? "waiting" : "confirmed";
      const ask = row.ask == null ? null : Number(row.ask);
      return {
        id: String(row.id),
        status,
        photo: status === "confirmed" ? String(row.photo ?? "") : "",
        hint,
        ask: ask != null && Number.isFinite(ask) ? ask : null,
        askCurrency: row.ask_currency ? String(row.ask_currency) : "",
      };
    });
  });

export type BookLevel = { amount: number; n: number };
export type TapeTick = { eightId: string; amount: number; currency: string };
export type MyBid = { id: string; amount: number; currency: string };

export const marketBook = createServerFn({ method: "POST" })
  .inputValidator((input: { currency?: string; personKey?: string }) => ({
    currency: input?.currency ?? "UAH",
    personKey: input?.personKey ?? "",
  }))
  .handler(async ({ data }): Promise<{ bids: BookLevel[]; asks: BookLevel[]; tape: TapeTick[]; mine: MyBid[]; topId: string | null; topAmount: number | null }> => {
    const currency = MONEY.has(data.currency) ? data.currency : "UAH";
    const sql = await sqlClient();
    await ensureBids(sql);
    const actor = await actorOf(data.personKey);
    const [bidRows, askRows, tapeRows, mineRows, topRows] = await Promise.all([
      sql<{ amount: number; n: number }>`
        select amount, count(*)::int as n from bids
        where status = 'open' and currency = ${currency}
        group by amount order by amount desc limit 6
      `,
      sql<{ amount: number; n: number }>`
        select amount, count(*)::int as n from listings
        where status = 'open' and currency = ${currency} and eight_id not like '90010%'
        group by amount order by amount asc limit 6
      `,
      sql<{ eight_id: string; amount: number; currency: string }>`
        select eight_id, amount, currency from listings
        where status = 'sold' and eight_id not like '90010%'
        order by sold_at desc nulls last
        limit 6
      `,
      actor
        ? sql<{ id: string; amount: number; currency: string }>`
            select id, amount, currency from bids where status = 'open' and person_key = ${actor.id} order by created_at desc limit 3
          `
        : Promise.resolve([] as { id: string; amount: number; currency: string }[]),
      sql<{ id: string; amount: number }>`
        select id, amount from bids
        where status = 'open' and currency = ${currency}
          and person_key <> ${actor?.id ?? ""}
        order by amount desc, created_at asc
        limit 1
      `,
    ]);
    return {
      bids: bidRows.map((row) => ({ amount: Number(row.amount), n: Number(row.n) })),
      asks: askRows.map((row) => ({ amount: Number(row.amount), n: Number(row.n) })),
      tape: tapeRows.map((row) => ({ eightId: String(row.eight_id), amount: Number(row.amount), currency: String(row.currency) })),
      mine: mineRows.map((row) => ({ id: row.id, amount: Number(row.amount), currency: row.currency })),
      topId: topRows[0]?.id ?? null,
      topAmount: topRows[0] ? Number(topRows[0].amount) : null,
    };
  });

export const placeBid = createServerFn({ method: "POST" })
  .inputValidator((input: { name?: string; personKey?: string; currency?: string; amount?: number; city?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const name = (data.name ?? "").trim();
    if (name.length < 2) return { ok: false, error: "Спочатку вкажи ім'я в профілі." };
    const currency = data.currency ?? "";
    if (!MONEY.has(currency)) return { ok: false, error: "Обери валюту." };
    if (!Number.isFinite(data.amount) || (data.amount ?? 0) <= 0) return { ok: false, error: "Вкажи ціну більшу за нуль." };
    const amount = Math.round(Number(data.amount) * 100) / 100;
    const sql = await sqlClient();
    await ensureBids(sql);
    const actor = await actorOf(data.personKey);
    if (!actor) return { ok: false, error: "Заявка тільки з ключем." };
    const open = await sql<{ n: number }>`select count(*)::int as n from bids where status = 'open' and person_key = ${actor.id}`;
    if (Number(open[0]?.n ?? 0) >= 3) return { ok: false, error: "Уже три відкриті заявки. Зніми одну." };
    const id = `b-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
    await sql`
      insert into bids (id, person_key, name, currency, amount, city, status, created_at)
      values (${id}, ${actor.id}, ${name.slice(0, 40)}, ${currency}, ${amount}, ${(data.city ?? "").slice(0, 80)}, 'open', ${new Date().toISOString()})
    `;
    return { ok: true };
  });

export const cancelBid = createServerFn({ method: "POST" })
  .inputValidator((input: { bidId?: string; personKey?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const actor = await actorOf(data.personKey);
    if (!actor || !data.bidId) return { ok: false, error: "Зняти заявку може лише її автор." };
    const sql = await sqlClient();
    await ensureBids(sql);
    const rows = await sql<{ id: string }>`
      update bids set status = 'cancelled'
      where id = ${data.bidId} and status = 'open' and person_key = ${actor.id}
      returning id
    `;
    if (!rows[0]) return { ok: false, error: "Цієї заявки вже немає." };
    return { ok: true };
  });

export const fillBid = createServerFn({ method: "POST" })
  .inputValidator((input: { bidId?: string; eightId?: string; name?: string; personKey?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const name = (data.name ?? "").trim();
    const bidId = data.bidId ?? "";
    const eightId = data.eightId ?? "";
    if (!bidId || !eightId) return { ok: false, error: "Немає заявки або 8." };
    if (eightId.startsWith("90010")) return { ok: false, error: "Приклад не продається." };
    const actor = await actorOf(data.personKey);
    if (!actor) return { ok: false, error: "Віддати 8 можна лише зі свого ключа." };
    const { withTransaction } = await import("@/lib/db");
    const result = await withTransaction(async (sql) => {
      await ensureBids(sql);
      const bids = await sql<{ id: string; person_key: string; name: string; currency: string; amount: number }>`
        select id, person_key, name, currency, amount from bids where id = ${bidId} and status = 'open' limit 1
      `;
      const bid = bids[0];
      if (!bid) return { ok: false as const, error: "Заявку вже забрали." };
      if (bid.person_key === actor.id) return { ok: false as const, error: "Свою заявку не закривають своєю 8." };
      const walls = await sql<{ holder_key: string | null; status: string }>`
        select holder_key, status from eights where id = ${eightId} limit 1
      `;
      const wall = walls[0];
      if (!wall || wall.status !== "confirmed") return { ok: false as const, error: "Потрібна твоя підтверджена 8." };
      if (wall.holder_key !== actor.id) return { ok: false as const, error: "Це не твоя 8." };
      const listed = await sql`select id from listings where eight_id = ${eightId} and status in ('open', 'reserved') limit 1`;
      if (listed.length > 0) return { ok: false as const, error: "Ця 8 вже стоїть на продажі." };
      const listingId = `l-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
      const at = new Date().toISOString();
      const taken = await sql<{ id: string }>`
        update bids set status = 'filled' where id = ${bidId} and status = 'open' returning id
      `;
      if (!taken[0]) return { ok: false as const, error: "Заявку вже забрали." };
      await sql`
        insert into listings (id, eight_id, seller, seller_key, currency, amount, status, reserved_by, reserved_at, buyer_key, created_at)
        values (
          ${listingId}, ${eightId}, ${name.slice(0, 40)}, ${actor.id}, ${bid.currency}, ${Number(bid.amount)},
          'reserved', ${bid.name.slice(0, 40)}, ${at}, ${bid.person_key}, ${at}
        )
      `;
      return { ok: true as const, buyerKey: bid.person_key };
    });
    if (!result.ok) return result;
    tell(result.buyerKey, `${name} віддав ${eightNo(eightId)} під твою заявку. Гроші поза додатком.`, eightId, "/exchange");
    return { ok: true };
  });

export const placeSale = createServerFn({ method: "POST" })
  .inputValidator((input: { eightId: string; seller: string; currency: string; amount: number; city: string; country: string; lat: number; lng: number; creator: string; photo: string; story: string; personKey?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; listingId: string } | { ok: false; error: string }> => {
    if (data.eightId.startsWith("90010")) return { ok: false, error: "Приклад не продається." };
    const seller = data.seller.trim();
    if (seller.length < 2) return { ok: false, error: "Спочатку вкажи ім'я в профілі." };
    if (!MONEY.has(data.currency)) return { ok: false, error: "Обери валюту." };
    if (!Number.isFinite(data.amount) || data.amount <= 0) return { ok: false, error: "Вкажи ціну більшу за нуль." };
    const amount = Math.round(data.amount * 100) / 100;
    const sql = await sqlClient();
    const actor = await actorOf(data.personKey);
    const rows = await sql<Record<string, unknown>>`select holder, status, holder_key from eights where id = ${data.eightId} limit 1`;
    const row = rows[0];
    if (!row) return { ok: false, error: "Цієї 8 ще немає в реєстрі." };
    if (row.status !== "confirmed") return { ok: false, error: "Продається лише підтверджена 8." };
    if (row.holder_key) {
      if (!actor || actor.id !== String(row.holder_key)) return { ok: false, error: "Продає лише той, кому 8 зарахована." };
    } else if (String(row.holder).trim().toLowerCase() !== seller.toLowerCase()) {
      return { ok: false, error: "Продає лише той, кому 8 зарахована." };
    }
    const open = await sql`select id from listings where eight_id = ${data.eightId} and status in ('open', 'reserved') limit 1`;
    if (open.length > 0) return { ok: false, error: "Ця 8 вже стоїть на продажі." };
    const listingId = `l-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
    const sellerKey = actor && (row.holder_key ? actor.id === String(row.holder_key) : actor.name.toLowerCase() === seller.toLowerCase()) ? actor.id : null;
    await sql`
      insert into listings (id, eight_id, seller, seller_key, currency, amount, status, created_at)
      values (${listingId}, ${data.eightId}, ${seller.slice(0, 40)}, ${sellerKey}, ${data.currency}, ${amount}, 'open', ${new Date().toISOString()})
    `;
    return { ok: true, listingId };
  });

export const pullSale = createServerFn({ method: "POST" })
  .inputValidator((input: { listingId: string; name: string; personKey?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const sql = await sqlClient();
    const actor = await actorOf(data.personKey);
    const rows = await sql<{ seller: string; seller_key: string | null }>`select seller, seller_key from listings where id = ${data.listingId} and status = 'open' limit 1`;
    if (!rows[0]) return { ok: false, error: "Цієї виставки вже немає." };
    if (!sellerMatch(rows[0], data.name, actor?.id)) return { ok: false, error: "Зняти може лише той, хто виставив." };
    await sql`update listings set status = 'cancelled' where id = ${data.listingId} and status = 'open'`;
    return { ok: true };
  });

export const repriceSale = createServerFn({ method: "POST" })
  .inputValidator((input: { listingId: string; name: string; currency: string; amount: number; personKey?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!MONEY.has(data.currency)) return { ok: false, error: "Обери валюту." };
    if (!Number.isFinite(data.amount) || data.amount <= 0) return { ok: false, error: "Вкажи ціну більшу за нуль." };
    const amount = Math.round(data.amount * 100) / 100;
    const sql = await sqlClient();
    const actor = await actorOf(data.personKey);
    const rows = await sql<{ seller: string; seller_key: string | null }>`select seller, seller_key from listings where id = ${data.listingId} and status = 'open' limit 1`;
    if (!rows[0]) return { ok: false, error: "Ціну можна змінити, поки ніхто не забронював." };
    if (!sellerMatch(rows[0], data.name, actor?.id)) return { ok: false, error: "Ціну змінює лише той, хто виставив." };
    await sql`
      update listings set amount = ${amount}, currency = ${data.currency}
      where id = ${data.listingId} and status = 'open'
    `;
    return { ok: true };
  });

export const takeSale = createServerFn({ method: "POST" })
  .inputValidator((input: { listingId: string; name: string; personKey?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const name = data.name.trim();
    if (name.length < 2) return { ok: false, error: "Спочатку вкажи ім'я в профілі." };
    const actor = await actorOf(data.personKey);
    if (actor && actor.name.toLowerCase() !== name.toLowerCase()) return { ok: false, error: "Бронює той, чиє ім'я на ключі." };
    const sql = await sqlClient();
    const held = await sql<{ n: number }>`
      select count(*)::int as n from listings
      where status = 'reserved'
        and (
          (${actor?.id ?? ""} <> '' and buyer_key = ${actor?.id ?? ""})
          or (${actor?.id ?? ""} = '' and lower(reserved_by) = lower(${name}))
        )
    `;
    if (Number(held[0]?.n ?? 0) >= 3) return { ok: false, error: "У тебе вже три незакриті покупки. Закрий їх, перш ніж брати ще." };
    const rows = await sql<Record<string, unknown>>`
      select id, seller, seller_key, eight_id from listings where id = ${data.listingId} and status = 'open' limit 1
    `;
    const listing = rows[0];
    if (!listing) return { ok: false, error: "Цієї 8 вже немає на продажі." };
    if (String(listing.eight_id).startsWith("90010")) return { ok: false, error: "Приклад не продається." };
    if (actor && listing.seller_key && String(listing.seller_key) === actor.id) return { ok: false, error: "Свою 8 не купують. Її можна зняти." };
    if (!listing.seller_key && String(listing.seller).trim().toLowerCase() === name.toLowerCase()) return { ok: false, error: "Свою 8 не купують. Її можна зняти." };
    const taken = await sql<{ id: string }>`
      update listings
      set status = 'reserved', reserved_by = ${name.slice(0, 40)}, reserved_at = ${new Date().toISOString()}, buyer_key = ${actor?.id ?? null}
      where id = ${data.listingId} and status = 'open'
      returning id
    `;
    if (!taken[0]) return { ok: false, error: "Цю 8 вже взяли." };
    const sellerKey = listing.seller_key ? String(listing.seller_key) : "";
    tell(sellerKey, `${name} забронював ${eightNo(String(listing.eight_id))} на дві години. Гроші поза додатком.`, String(listing.eight_id), "/exchange");
    return { ok: true };
  });

export const settleSale = createServerFn({ method: "POST" })
  .inputValidator((input: { listingId: string; name: string; personKey?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const name = data.name.trim();
    const actor = await actorOf(data.personKey);
    const sql = await sqlClient();
    const rows = await sql<Record<string, unknown>>`
      select eight_id, seller, seller_key, reserved_by, reserved_at, buyer_key from listings where id = ${data.listingId} and status = 'reserved' limit 1
    `;
    const listing = rows[0];
    if (!listing) return { ok: false, error: "Немає покупця, який чекає на цю 8." };
    if (!sellerMatch({ seller: String(listing.seller ?? ""), seller_key: listing.seller_key ? String(listing.seller_key) : null }, name, actor?.id)) {
      return { ok: false, error: "Гроші підтверджує лише продавець." };
    }
    const buyer = String(listing.reserved_by ?? "").slice(0, 40);
    if (!buyer) return { ok: false, error: "Покупець не записаний." };
    const reservedAt = listing.reserved_at ? new Date(asText(listing.reserved_at)).getTime() : 0;
    if (!reservedAt || Date.now() - reservedAt > RESERVE_MS) {
      await sql`
        update listings set status = 'open', reserved_by = null, reserved_at = null, buyer_key = null
        where id = ${data.listingId} and status = 'reserved'
      `;
      return { ok: false, error: "Бронь уже зійшла. 8 знову на дошці." };
    }
    const at = new Date().toISOString();
    const cutoff = new Date(Date.now() - RESERVE_MS).toISOString();
    const sold = await sql<{ id: string }>`
      update listings
      set status = 'sold', buyer = ${buyer}, sold_at = ${at}
      where id = ${data.listingId} and status = 'reserved' and reserved_at >= ${cutoff}
      returning id
    `;
    if (!sold[0]) return { ok: false, error: "Бронь уже зійшла. 8 знову на дошці." };
    await sql`update eights set holder = ${buyer}, holder_key = ${listing.buyer_key ? String(listing.buyer_key) : null} where id = ${String(listing.eight_id)}`;
    const eightId = String(listing.eight_id);
    await sql`
      insert into eight_events (id, eight_id, at, kind, by_name, status)
      values (${`e-xfer-${eightId}`}, ${eightId}, ${at}, 'transfer', ${buyer}, 'TRANSFERRED')
      on conflict (eight_id, kind) do update
        set by_name = excluded.by_name, at = excluded.at, status = excluded.status
    `;
    const buyerKey = listing.buyer_key ? String(listing.buyer_key) : "";
    tell(buyerKey, `${name} підтвердив гроші. ${eightNo(eightId)} тепер у тебе. Номер той самий.`, eightId);
    return { ok: true };
  });

export const cancelHold = createServerFn({ method: "POST" })
  .inputValidator((input: { listingId: string; name: string; personKey?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const shown = data.name.trim();
    const name = shown.toLowerCase();
    const actor = await actorOf(data.personKey);
    const sql = await sqlClient();
    const rows = await sql<{ eight_id: string; seller: string; reserved_by: string | null; seller_key: string | null; buyer_key: string | null }>`
      select eight_id, seller, reserved_by, seller_key, buyer_key from listings where id = ${data.listingId} and status = 'reserved' limit 1
    `;
    const listing = rows[0];
    if (!listing) return { ok: false, error: "Цієї броні вже немає." };
    const byKey = Boolean(actor && (actor.id === listing.seller_key || actor.id === listing.buyer_key));
    const seller = listing.seller.trim().toLowerCase();
    const buyer = String(listing.reserved_by ?? "").trim().toLowerCase();
    const byName = !listing.seller_key && !listing.buyer_key && (name === seller || name === buyer);
    if (!byKey && !byName) return { ok: false, error: "Скасувати можуть лише продавець і покупець." };
    await sql`
      update listings set status = 'open', reserved_by = null, reserved_at = null, buyer_key = null
      where id = ${data.listingId} and status = 'reserved'
    `;
    const line = `${shown || "Хтось"} відпустив бронь ${eightNo(listing.eight_id)}. 8 знову на дошці.`;
    for (const key of new Set([listing.seller_key, listing.buyer_key].filter((key): key is string => Boolean(key) && key !== actor?.id))) {
      tell(key, line, listing.eight_id, "/exchange");
    }
    return { ok: true };
  });

export type PersonEight = {
  id: string;
  city: string;
  status: "waiting" | "confirmed" | "gone";
  role: "drew" | "confirmed" | "holds";
  photo: string;
  ask: number | null;
  currency: string | null;
  reserved: boolean;
  held: boolean;
};

export const findPeople = createServerFn({ method: "POST" })
  .inputValidator((input: { q?: string }) => ({ q: (input.q ?? "").trim().slice(0, 40) }))
  .handler(async ({ data }): Promise<{ name: string; city: string }[]> => {
    const q = data.q.replace(/[%_]/g, "");
    if (q.length < 2) return [];
    const sql = await sqlClient();
    const rows = await sql<{ name: string; city: string }>`
      select name, coalesce(max(city), '') as city
      from people
      where length(trim(name)) > 1 and name ilike ${"%" + q + "%"}
      group by name
      order by name
      limit 8
    `;
    return rows.map((row) => ({ name: row.name, city: row.city ?? "" }));
  });

export const personBoard = createServerFn({ method: "POST" })
  .inputValidator((input: string | { name?: string; personKey?: string }) =>
    typeof input === "string" ? { name: input, personKey: "" } : { name: input.name ?? "", personKey: input.personKey ?? "" },
  )
  .handler(async ({ data }): Promise<{ drew: number; confirmed: number; holds: number; rows: PersonEight[] } | null> => {
    const who = data.name.trim();
    const actor = await actorOf(data.personKey);
    const key = actor?.id ?? "";
    if (!key && who.length < 2) return null;
    const sql = await sqlClient();
    const counts = key
      ? await sql<{ drew: number; confirmed: number; holds: number }>`
          select
            count(*) filter (where owner_key = ${key} and reward_of is null)::int as drew,
            count(*) filter (where confirmer_key = ${key})::int as confirmed,
            count(*) filter (where holder_key = ${key} and status = 'confirmed')::int as holds
          from eights
          where id not like '90010%'
        `
      : await sql<{ drew: number; confirmed: number; holds: number }>`
          select
            count(*) filter (where lower(creator) = lower(${who}) and reward_of is null)::int as drew,
            count(*) filter (where lower(confirmed_by) = lower(${who}))::int as confirmed,
            count(*) filter (where lower(holder) = lower(${who}) and status = 'confirmed')::int as holds
          from eights
          where id not like '90010%'
        `;
    const rows = await sql<Record<string, unknown>>`
      select eights.id, eights.city, eights.status, eights.creator, eights.confirmed_by, eights.holder,
        eights.owner_key, eights.confirmer_key, eights.holder_key, eights.reward_of,
        case when eights.photo like '/%' then eights.photo else coalesce(thumbs.data, '') end as photo,
        (select amount from listings where eight_id = eights.id and status in ('open', 'reserved') order by created_at desc limit 1) as ask_amount,
        (select currency from listings where eight_id = eights.id and status in ('open', 'reserved') order by created_at desc limit 1) as ask_currency,
        (select reserved_by from listings where eight_id = eights.id and status in ('open', 'reserved') order by created_at desc limit 1) as ask_by
      from eights
      left join thumbs on thumbs.eight_id = eights.id
      where eights.id not like '90010%'
        and (
          (${key} <> '' and (eights.owner_key = ${key} or eights.confirmer_key = ${key} or eights.holder_key = ${key}))
          or (${key} = '' and (lower(eights.creator) = lower(${who}) or lower(eights.confirmed_by) = lower(${who}) or lower(eights.holder) = lower(${who})))
        )
      order by eights.created_at desc
      limit 40
    `;
    const tally = counts[0] ?? { drew: 0, confirmed: 0, holds: 0 };
    return {
      drew: Number(tally.drew ?? 0),
      confirmed: Number(tally.confirmed ?? 0),
      holds: Number(tally.holds ?? 0),
      rows: rows.map((row) => {
        const ownerKey = String(row.owner_key ?? "");
        const confirmerKey = String(row.confirmer_key ?? "");
        const creator = String(row.creator ?? "");
        const confirmedBy = String(row.confirmed_by ?? "");
        const raw = String(row.status ?? "");
        const status: PersonEight["status"] = raw === "confirmed" ? "confirmed" : raw === "waiting" ? "waiting" : "gone";
        const role = key
          ? ownerKey === key && !row.reward_of
            ? "drew"
            : confirmerKey === key || (ownerKey === key && row.reward_of)
              ? "confirmed"
              : "holds"
          : creator.toLowerCase() === who.toLowerCase()
            ? "drew"
            : confirmedBy.toLowerCase() === who.toLowerCase()
              ? "confirmed"
              : "holds";
        const held = status === "confirmed" && (key ? String(row.holder_key ?? "") === key : String(row.holder ?? "").trim().toLowerCase() === who.toLowerCase());
        return {
          id: String(row.id),
          city: String(row.city ?? ""),
          status,
          role,
          photo: status === "waiting" && !key ? "" : String(row.photo ?? ""),
          ask: row.ask_amount == null ? null : Number(row.ask_amount),
          currency: row.ask_currency ? String(row.ask_currency) : null,
          reserved: Boolean(row.ask_by),
          held,
        } satisfies PersonEight;
      }),
    };
  });



