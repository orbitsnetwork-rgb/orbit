import type { BoardEight, BoardEvent } from "@/lib/board";

export const CONFIRM_RADIUS_M = 200;
export const MAX_FIX_ACCURACY_M = 65;

export type ActionKind = "draw" | "object" | "photo" | "video" | "event" | "install";
export type TransferKind = "gift" | "object" | "eight";
export type Life = "DRAFT" | "PLACED" | "WAITING_VERIFICATION" | "VERIFIED" | "ACTIVE" | "TRANSFERRED" | "ARCHIVED";
export type Derived = "created" | "submitted" | "verified" | "disputed";
export type EventKind =
  | "created"
  | "placed"
  | "submitted"
  | "observation"
  | "verification_requested"
  | "verified"
  | "activated"
  | "transfer"
  | "archived"
  | "commitment"
  | "report";

export interface ProofFile {
  id: string;
  kind: "image" | "video" | "link";
  name: string;
  caption: string;
  at: string;
  preview?: string;
  duration?: number;
  href?: string;
}

export interface Observation {
  id: string;
  by: string;
  at: string;
  text: string;
  revokedAt?: string;
}

export interface Transfer {
  id: string;
  from: string;
  to: string;
  at: string;
  kind: TransferKind;
  note: string;
}

export interface Commitment {
  id: string;
  by: string;
  at: string;
  what: string;
}

export interface Report {
  id: string;
  by: string;
  at: string;
  reason: string;
}

export interface HistoryEvent {
  id: string;
  at: string;
  kind: EventKind;
  text: string;
  by?: string;
  status?: string;
  lat?: number;
  lng?: number;
  photo?: string;
}

export interface ThreadNote {
  id: string;
  by: string;
  at: string;
  text: string;
}

export interface Eight {
  id: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  creator: string;
  holder: string;
  createdAt: string;
  state: "created" | "submitted";
  kind: ActionKind;
  story: string;
  proof: string;
  proofMedia?: "wall" | "coin" | "city";
  media?: ProofFile[];
  shot?: string;
  observations: Observation[];
  transfers: Transfer[];
  commitments: Commitment[];
  reports: Report[];
  history: HistoryEvent[];
  attention: number;
  anchor?: boolean;
  example?: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
  rewardOf?: string;
  archivedAt?: string;
  thread?: ThreadNote[];
}

export interface Profile {
  name: string;
  city: string;
  avatar?: string;
  joinedAt?: string;
  key?: string;
  recovery?: string;
}

export const CURRENCIES = ["UAH", "USD", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_LABEL: Record<Currency, string> = {
  UAH: "гривня",
  USD: "долар",
  EUR: "євро",
};

export interface Listing {
  id: string;
  eightId: string;
  side: "sell" | "buy";
  currency: Currency;
  amount?: number;
  by: string;
  at: string;
}

export interface Offer {
  id: string;
  title: string;
  body: string;
  area: string;
  authorName: string;
  at: string;
  photo?: string;
  status: "open" | "done";
}

export interface JournalEntry {
  id: string;
  at: string;
  kind: string;
  text: string;
  eightId?: string;
}

export const ACTION_LABEL: Record<ActionKind, string> = {
  draw: "Знак у дозволеному місці",
  object: "Фізичний об'єкт",
  photo: "Фото існуючого символу",
  video: "Відео дії",
  event: "Подія",
  install: "Інсталяція",
};

export const TRANSFER_LABEL: Record<TransferKind, string> = {
  gift: "Передача без обміну",
  object: "За фізичну річ",
  eight: "Передача 8",
};

export const STATUS_LABEL: Record<Derived, string> = {
  created: "Чернетка",
  submitted: "Чекає",
  verified: "Підтверджена",
  disputed: "Оскаржена",
};

const V1 = /^8-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;
const V2 = /^8-(?:[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-){6}[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{2}$/;

export const CREDENTIAL_ALPHABET = 32;
export const CREDENTIAL_SYMBOLS = 8;

export function credentialShape(raw: string) {
  const key = raw.trim().toUpperCase();
  if (V2.test(key)) return 2;
  if (V1.test(key)) return 1;
  return 0;
}

export function credentialAccepted(raw: string) {
  return credentialShape(raw) !== 0;
}

export function credentialBits() {
  return CREDENTIAL_SYMBOLS * Math.log2(CREDENTIAL_ALPHABET);
}

export function norm(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function placeFixError(accuracy: number | null | undefined) {
  if (accuracy == null || !Number.isFinite(accuracy)) return "Телефон не сказав, наскільки точне місце.";
  if (accuracy > MAX_FIX_ACCURACY_M) return `Точність ±${Math.round(accuracy)} м. Треба краще за ${MAX_FIX_ACCURACY_M} м.`;
  return "";
}

export function confirmDistanceError(meters: number) {
  if (meters > CONFIRM_RADIUS_M) return `Ти за ${Math.round(meters)} м. Підійти треба ближче ніж ${CONFIRM_RADIUS_M} м.`;
  return "";
}

export function eightNo(id: string) {
  const body = /^\d+$/.test(id) ? id.padStart(6, "0") : id;
  return `8 #${body}`;
}

export function lifeOf(entry: Eight): Life {
  if (entry.archivedAt) return "ARCHIVED";
  if (entry.transfers.length > 0 && norm(entry.holder) !== norm(entry.creator)) return "TRANSFERRED";
  if (entry.confirmedBy || entry.rewardOf) return "ACTIVE";
  if (entry.state === "submitted") return "WAITING_VERIFICATION";
  return "DRAFT";
}

export function lifeLabel(life: Life) {
  const text: Record<Life, string> = {
    DRAFT: "Чернетка",
    PLACED: "Поставлена на стіну",
    WAITING_VERIFICATION: "Чекає",
    VERIFIED: "Підтверджена",
    ACTIVE: "Підтверджена",
    TRANSFERRED: "Передана",
    ARCHIVED: "Прибрана",
  };
  return text[life];
}

export function sameDay(iso: string, now = new Date()) {
  const day = new Date(iso);
  return day.getFullYear() === now.getFullYear() && day.getMonth() === now.getMonth() && day.getDate() === now.getDate();
}

export function nextId(eights: { id: string }[]) {
  const nums = eights.map((entry) => Number(entry.id)).filter((value) => Number.isFinite(value));
  const max = nums.length > 0 ? Math.max(...nums) : 100000;
  return String(max + 1).padStart(6, "0");
}

export function independentObservers(entry: Eight) {
  const seen = new Set<string>();
  for (const item of entry.observations) {
    if (item.revokedAt) continue;
    const who = norm(item.by);
    if (!who || who === norm(entry.creator) || who === norm(entry.holder)) continue;
    seen.add(who);
  }
  return [...seen];
}

export function disputeReporters(entry: Eight) {
  return [...new Set(entry.reports.map((item) => norm(item.by)).filter(Boolean))];
}

export function derivedStatus(entry: Eight): Derived {
  if (!entry.anchor && disputeReporters(entry).length >= 3) return "disputed";
  if (entry.anchor || entry.confirmedBy || entry.rewardOf || independentObservers(entry).length >= 2) return "verified";
  if (entry.state === "submitted") return "submitted";
  return "created";
}

export function isPublic(entry: Eight) {
  return entry.state !== "created";
}

export function matchesQuery(entry: Eight, query: string) {
  const q = norm(query);
  if (!q) return true;
  return [entry.id, entry.city, entry.country, entry.creator, entry.holder, entry.story].some((part) => norm(part).includes(q));
}

export function firstInCountry(entries: Eight[], entry: Eight) {
  const peers = entries.filter((item) => isPublic(item) && norm(item.country) === norm(entry.country));
  const oldest = peers.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  return oldest?.id === entry.id;
}

export function atlasStats(entries: Eight[]) {
  const live = entries.filter((entry) => !entry.example);
  return {
    records: live.length,
    verified: live.filter((entry) => derivedStatus(entry) === "verified").length,
  };
}

export function fmtDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString("uk-UA");
}

export function fmtWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 16).replace("T", " ");
  return date.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function confirmEvents(
  history: HistoryEvent[],
  eightId: string,
  by: string,
  at: string,
  place?: { lat: number; lng: number },
): HistoryEvent[] {
  const next = history.slice();
  const add = (kind: EventKind, status: string, id: string, text: string) => {
    if (next.some((event) => event.kind === kind)) return;
    next.push({ id, at, kind, by, status, lat: place?.lat, lng: place?.lng, text });
  };
  add("verification_requested", "WAITING_VERIFICATION", `e-req-${eightId}`, "Запит на підтвердження.");
  add("verified", "VERIFIED", `e-ver-${eightId}`, "Підтверджена.");
  add("activated", "ACTIVE", `e-act-${eightId}`, "Активна.");
  return next;
}

export function archiveEvents(entry: Eight, by: string, at: string): Eight {
  if (entry.archivedAt || entry.history.some((event) => event.kind === "archived")) {
    return entry.archivedAt ? entry : { ...entry, archivedAt: at };
  }
  return {
    ...entry,
    archivedAt: at,
    history: [
      ...entry.history,
      { id: `e-arch-${entry.id}`, at, kind: "archived", by, status: "ARCHIVED", text: "Прибрана з «Поруч». Запис лишився." },
    ],
  };
}

export function mayArchive(actorId: string, wall: { ownerId: string | null; status: string; device: string | null }, _device: string) {
  if (!actorId || actorId !== wall.ownerId) return false;
  return wall.status === "waiting";
}

export function mayVerify(actorId: string, wall: { ownerId: string | null; status: string; device: string | null }, device: string) {
  if (!actorId || !wall.ownerId || actorId === wall.ownerId) return false;
  if (wall.status !== "waiting") return false;
  if (wall.device && device && wall.device === device) return false;
  return true;
}

function eventText(kind: BoardEvent["kind"]) {
  if (kind === "created") return "Чернетка.";
  if (kind === "placed") return "Поставлена на стіну.";
  if (kind === "verification_requested") return "Запит на підтвердження.";
  if (kind === "verified") return "Підтверджена.";
  if (kind === "activated") return "Активна.";
  if (kind === "archived") return "Прибрана.";
  return "Передана.";
}

export function mergeServerEight(existing: Eight | undefined, row: BoardEight): Eight {
  const history = (existing?.history ?? []).slice();
  for (const event of row.events) {
    if (history.some((item) => item.id === event.id || (item.kind === event.kind && event.kind !== "transfer"))) continue;
    history.push({
      id: event.id,
      at: event.at,
      kind: event.kind,
      by: event.by,
      status: event.status,
      lat: event.lat ?? undefined,
      lng: event.lng ?? undefined,
      text: eventText(event.kind),
    });
  }
  history.sort((a, b) => a.at.localeCompare(b.at));
  const photo = row.photo.startsWith("data:image/")
    ? [{ id: `p-${row.id}`, kind: "image" as const, name: "стіна", caption: "", at: row.createdAt, preview: row.photo }]
    : existing?.media ?? [];
  const confirmedAt = row.events.find((event) => event.kind === "verified")?.at;
  return {
    id: row.id,
    city: row.city,
    country: row.country,
    lat: row.lat,
    lng: row.lng,
    creator: row.creator,
    holder: existing?.holder ?? row.holder ?? row.creator,
    createdAt: existing?.createdAt ?? row.createdAt,
    state: "submitted",
    kind: existing?.kind ?? "draw",
    story: row.story || existing?.story || "",
    proof: existing?.proof ?? "",
    proofMedia: existing?.proofMedia,
    media: photo.length > 0 ? photo : existing?.media,
    shot: row.photo.startsWith("/") ? row.photo : existing?.shot,
    observations: existing?.observations ?? [],
    transfers: existing?.transfers ?? [],
    commitments: existing?.commitments ?? [],
    reports: existing?.reports ?? [],
    history,
    attention: existing?.attention ?? 0,
    anchor: existing?.anchor,
    example: existing?.example,
    confirmedBy: row.confirmedBy ?? existing?.confirmedBy,
    confirmedAt: row.status === "confirmed" ? existing?.confirmedAt ?? confirmedAt : existing?.confirmedAt,
    rewardOf: existing?.rewardOf,
    archivedAt: row.status === "gone" ? existing?.archivedAt ?? row.archivedAt ?? row.events.find((event) => event.kind === "archived")?.at ?? row.createdAt : existing?.archivedAt,
    thread: existing?.thread,
  };
}

function pack(text: string) {
  const bytes = new TextEncoder().encode(text);
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function unpack(raw: string) {
  const padded = raw.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((raw.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function passCode(entry: Eight) {
  return pack(JSON.stringify({
    id: entry.id,
    city: entry.city,
    country: entry.country,
    lat: entry.lat,
    lng: entry.lng,
    creator: entry.creator,
    kind: entry.kind,
    story: entry.story,
    proof: entry.proof,
    shot: entry.shot ?? "",
    at: entry.createdAt,
    note: entry.thread?.[0]?.text ?? "",
  }));
}

export function readPass(raw: string) {
  try {
    const data = JSON.parse(unpack(raw.trim())) as {
      id?: string;
      city?: string;
      country?: string;
      lat?: number;
      lng?: number;
      creator?: string;
      kind?: ActionKind;
      story?: string;
      proof?: string;
      shot?: string;
      at?: string;
      note?: string;
    };
    if (!data.id || !data.city || !data.creator || !data.kind || data.lat == null || data.lng == null) return null;
    return {
      id: data.id,
      city: data.city,
      country: data.country ?? "",
      lat: data.lat,
      lng: data.lng,
      creator: data.creator,
      kind: data.kind,
      story: data.story ?? "",
      proof: data.proof ?? "",
      shot: data.shot,
      at: data.at ?? new Date().toISOString(),
      note: data.note,
    };
  } catch {
    return null;
  }
}

const REFUSAL: Record<string, string> = {
  TOO_FAR: "Занадто далеко. Підійди ближче ніж 200 м.",
  GPS_COARSE: "GPS ширший за 65 м. Вийди відкритіше і спробуй ще.",
  SAME_PHOTO: "Це фото вже було або збігається з авторським. Зніми з цього місця ще раз.",
  SAME_PHONE: "З цього телефона підтвердити не можна.",
  OWN_WALL: "Свою стіну підтверджує інша людина.",
  DAY_LIMIT: "За останні 24 години з цього ключа вже є 8 підтверджень.",
  PAIR_LIMIT: "Ця пара за останні 24 години вже підтверджувала стіну.",
  ALREADY_CONFIRMED: "Цю стіну вже підтвердили.",
  GONE: "Стіну прибрано з «Поруч».",
  NOT_WAITING: "Підтвердити можна лише стіну, яка ще чекає.",
  NO_GPS: "Місце недоступне.",
  NO_PHOTO: "Потрібне фото цієї стіни.",
  NO_NAME: "Спочатку вкажи ім’я в профілі.",
};

export function refusalLine(error: string) {
  const exact = REFUSAL[error.trim()];
  if (exact) return exact;
  const text = error.toLowerCase();
  if (text.includes("геолокац") || text.includes("немає твоєї точки") || text.includes("місце недоступне") || text.includes("свіже місце")) return REFUSAL.NO_GPS;
  if (text.includes("точн") || text.includes("65")) return REFUSAL.GPS_COARSE;
  if (text.includes("те саме фото") || text.includes("вже було") || text.includes("зайняте")) return REFUSAL.SAME_PHOTO;
  if (text.includes("добу") || text.includes("вже підтвердив 8") || text.includes("8 підтверд")) return REFUSAL.DAY_LIMIT;
  if (text.includes("телефона") && text.includes("підтверд")) return REFUSAL.SAME_PHONE;
  if (text.includes("свою")) return REFUSAL.OWN_WALL;
  if (text.includes("цією людиною") || text.includes("пара")) return REFUSAL.PAIR_LIMIT;
  if (text.includes("вже підтверд")) return REFUSAL.ALREADY_CONFIRMED;
  if (text.includes("прибран")) return REFUSAL.GONE;
  if (text.includes("ще чека") || text.includes("статус")) return REFUSAL.NOT_WAITING;
  if (text.includes("фото")) return REFUSAL.NO_PHOTO;
  if (text.includes("ближче") || text.includes("метр") || text.includes(" м")) return REFUSAL.TOO_FAR;
  return error;
}
