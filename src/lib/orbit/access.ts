import { emptyWorld, type World } from "@/lib/orbit/engine";

export type DeviceSlot = { day: string; count: number };
export type Identity = {
  userId: string;
  given: string;
  family: string;
  birth: string;
  email: string;
  phone: string;
  confirmed: boolean;
  mailCode: string | null;
};

export type Topup = { id: string; userId: string; amount: number; status: "open" | "paid"; at: number };

export type Bag = {
  world: World;
  keys: Record<string, string>;
  devices: Record<string, DeviceSlot>;
  people: Identity[];
  topups: Topup[];
  limits: Record<string, Limit>;
};

/** Лічильник спроб: n спроб у вікні, що почалося в start; до until — блок. */
export type Limit = { n: number; start: number; until: number };

export const NAMES_PER_DEVICE = 3;

export function mailCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1_000_000).padStart(6, "0");
}

export function mintKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

export function unpackDoc(doc: unknown): Bag {
  const value = typeof doc === "string" ? parse(doc) : doc;
  if (!value || typeof value !== "object") return { world: emptyWorld(), keys: {}, devices: {}, people: [], topups: [], limits: {} };
  const bag = value as { world?: unknown; keys?: unknown; devices?: unknown; people?: unknown; topups?: unknown; limits?: unknown };
  const world = asWorld(bag.world) ?? asWorld(value);
  return {
    world: world ?? emptyWorld(),
    keys: asKeys(bag.world ? bag.keys : null),
    devices: asDevices(bag.devices),
    people: asPeople(bag.people),
    topups: asTopups(bag.topups),
    limits: asLimits(bag.limits),
  };
}

export function packDoc(
  world: World,
  keys: Record<string, string>,
  devices: Record<string, DeviceSlot> = {},
  people: Identity[] = [],
  topups: Topup[] = [],
  limits: Record<string, Limit> = {},
) {
  return JSON.stringify({ v: 2, world: { ...world, sessionId: null }, keys, devices, people, topups, limits });
}

/** Публічне ім’я: «Олена К.». Повне прізвище бачить лише сама людина. */
export function shortName(given: string, family: string) {
  const first = given.trim();
  const initial = family.trim().slice(0, 1).toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}

export function readPerson(raw: {
  given?: unknown;
  family?: unknown;
  birth?: unknown;
  email?: unknown;
  phone?: unknown;
}, now: number): { error: string } | { given: string; family: string; birth: string; email: string; phone: string } {
  const given = clipName(raw.given);
  const family = clipName(raw.family);
  const email = clipEmail(raw.email);
  const phone = clipPhone(raw.phone);
  const birth = typeof raw.birth === "string" ? raw.birth : "";
  if (!given || !family) return { error: "Ім’я і прізвище — щонайменше дві літери." };
  if (!email) return { error: "Пошта виглядає неправильно." };
  if (!phone) return { error: "Телефон — від 10 до 15 цифр." };
  if (!adult(birth, now)) return { error: "Потрібно мати 18 років." };
  return { given, family, birth, email, phone };
}

export function adult(birth: string, now: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const born = new Date(Date.UTC(year, month - 1, day));
  if (born.getUTCFullYear() !== year || born.getUTCMonth() !== month - 1 || born.getUTCDate() !== day) return false;
  if (born.getTime() > now) return false;
  const majority = new Date(Date.UTC(year + 18, month - 1, day));
  return now >= majority.getTime();
}

export function namesLeft(devices: Record<string, DeviceSlot>, deviceId: string, day: string) {
  const slot = devices[deviceId];
  const count = slot && slot.day === day ? slot.count : 0;
  return Math.max(0, NAMES_PER_DEVICE - count);
}

export function markDevice(devices: Record<string, DeviceSlot>, deviceId: string, day: string) {
  const count = devices[deviceId]?.day === day ? devices[deviceId].count : 0;
  return { ...devices, [deviceId]: { day, count: count + 1 } };
}

export function keyMatches(keys: Record<string, string>, id: string | null, key: string | null) {
  if (!id || !key) return false;
  const have = keys[id];
  if (typeof have !== "string" || have.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < have.length; i += 1) diff |= have.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

/** Чи заблоковано ключ лімітом зараз. */
export function limited(limits: Record<string, Limit>, id: string, now: number) {
  const row = limits[id];
  return Boolean(row && row.until > now);
}

/** Записує невдалу спробу. max спроб за windowMs, далі блок на lockMs. */
export function strike(limits: Record<string, Limit>, id: string, now: number, max: number, windowMs: number, lockMs: number) {
  const prev = limits[id];
  const fresh = !prev || now - prev.start > windowMs;
  const n = fresh ? 1 : prev.n + 1;
  const row: Limit = { n, start: fresh ? now : prev.start, until: n >= max ? now + lockMs : 0 };
  const next: Record<string, Limit> = {};
  // Прибираємо прострочені записи, щоб документ не ріс.
  for (const [key, value] of Object.entries(limits)) {
    if (value.until > now || now - value.start <= windowMs) next[key] = value;
  }
  next[id] = row;
  return next;
}

export function forgive(limits: Record<string, Limit>, id: string) {
  if (!limits[id]) return limits;
  const next = { ...limits };
  delete next[id];
  return next;
}

function asLimits(raw: unknown): Record<string, Limit> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Limit> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || id.length > 120) continue;
    const row = value as Limit;
    if (typeof row.n !== "number" || typeof row.start !== "number" || typeof row.until !== "number") continue;
    out[id] = { n: row.n, start: row.start, until: row.until };
  }
  return out;
}

function asTopups(raw: unknown): Topup[] {
  if (!Array.isArray(raw)) return [];
  const rows: Topup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Topup;
    if (!row.id?.startsWith("cs_") || !row.userId?.startsWith("u-")) continue;
    if (row.amount !== 100 && row.amount !== 500 && row.amount !== 1000) continue;
    if (row.status !== "open" && row.status !== "paid") continue;
    rows.push({ id: row.id, userId: row.userId, amount: row.amount, status: row.status, at: Number(row.at) || 0 });
  }
  return trimTopups(rows);
}

function asDevices(raw: unknown): Record<string, DeviceSlot> {
  if (!raw || typeof raw !== "object") return {};
  const devices: Record<string, DeviceSlot> = {};
  for (const [id, slot] of Object.entries(raw)) {
    if (!id.startsWith("d-") || !slot || typeof slot !== "object") continue;
    const row = slot as { day?: unknown; count?: unknown };
    if (typeof row.day !== "string" || typeof row.count !== "number") continue;
    devices[id] = { day: row.day, count: row.count };
  }
  return devices;
}
function clipName(value: unknown) {
  if (typeof value !== "string") return "";
  const name = value.trim().slice(0, 32);
  return name.length >= 2 ? name : "";
}

function clipEmail(value: unknown) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase().slice(0, 80);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function clipPhone(value: unknown) {
  if (typeof value !== "string") return "";
  const phone = value.trim().replace(/[^\d+]/g, "");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "";
  return phone.startsWith("+") ? `+${digits}` : digits;
}

function asPeople(raw: unknown): Identity[] {
  if (!Array.isArray(raw)) return [];
  const people: Identity[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as Identity;
    if (!item.userId?.startsWith("u-") || !item.email || !item.phone) continue;
    people.push({
      userId: item.userId,
      given: String(item.given || "").slice(0, 32),
      family: String(item.family || "").slice(0, 32),
      birth: String(item.birth || "").slice(0, 10),
      email: String(item.email).toLowerCase().slice(0, 80),
      phone: String(item.phone).slice(0, 16),
      confirmed: item.confirmed !== false,
      mailCode: typeof item.mailCode === "string" && /^\d{6}$/.test(item.mailCode) ? item.mailCode : null,
    });
  }
  return people;
}
function asKeys(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const keys: Record<string, string> = {};
  for (const [id, key] of Object.entries(raw)) {
    if (id.startsWith("u-") && typeof key === "string" && key.length >= 8 && key.length <= 64) keys[id] = key;
  }
  return keys;
}

function asWorld(doc: unknown): World | null {
  if (!doc || typeof doc !== "object") return null;
  const world = doc as World;
  if (!Array.isArray(world.accounts) || !Array.isArray(world.orbits) || !Array.isArray(world.queue)) return null;
  return world;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}


/**
 * Оплачені записи зберігаються назавжди: це журнал ідемпотентності, щоб одну
 * оплату не зарахувати двічі. Обрізаються лише відкриті (незавершені) сесії.
 */
export function trimTopups(rows: Topup[]): Topup[] {
  const paidIds = new Set(rows.filter((row) => row.status === "paid").map((row) => row.id));
  const seen = new Set<string>();
  const paid: Topup[] = [];
  for (const row of rows) {
    if (row.status !== "paid" || seen.has(row.id)) continue;
    seen.add(row.id);
    paid.push(row);
  }
  const open = rows.filter((row) => row.status === "open" && !paidIds.has(row.id)).slice(-200);
  return [...paid, ...open];
}
