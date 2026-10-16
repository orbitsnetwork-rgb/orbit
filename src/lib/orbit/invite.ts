/**
 * Посилання на підтвердження: /?c=123456.
 * Посилання ЛИШЕ підставляє код у поле «Підтвердити запуск». Надсилає завжди людина — кнопкою.
 */
const STORE = "orbits-code-in";
const EVENT = "orbit-invite";
/** Код живе 10 хв (CODE_MS у рушії). Старіше посилання вже не підставляємо. */
const KEEP_MS = 10 * 60 * 1000;

export type Invite = { code: string; at: number };

export function cleanCode(raw: string | null | undefined) {
  const code = String(raw ?? "").replace(/\D/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

export function inviteLink(code: string, origin = typeof window === "undefined" ? "" : window.location.origin) {
  return `${origin}/?c=${code}`;
}

/** Код групами 3+3 — легше продиктувати. */
export function groupCode(code: string) {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** Викликати один раз на старті: забрати ?c= з адреси і запам’ятати на час сесії. */
export function catchInvite() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("c")) return;
  const code = cleanCode(url.searchParams.get("c"));
  url.searchParams.delete("c");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  if (!code) return;
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ code, at: Date.now() } satisfies Invite));
  } catch {
    /* приватний режим */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function readInvite(): Invite | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = JSON.parse(sessionStorage.getItem(STORE) || "null") as Invite | null;
    const code = cleanCode(raw?.code);
    if (!raw || !code || typeof raw.at !== "number") return null;
    if (Date.now() - raw.at > KEEP_MS) {
      sessionStorage.removeItem(STORE);
      return null;
    }
    return { code, at: raw.at };
  } catch {
    return null;
  }
}

export function dropInvite() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORE);
  } catch {
    /* приватний режим */
  }
  window.dispatchEvent(new Event(EVENT));
}

export const INVITE_EVENT = EVENT;
