/** Чат: час, дні і безпечний розбір тексту на шматки. Без HTML — лише рядки. */
const two = (n: number) => String(n).padStart(2, "0");
export function hm(at: number) {
  const d = new Date(at);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
}
export function dayKey(at: number) {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
export function dayLabel(at: number, now = Date.now()) {
  const k = dayKey(at);
  if (k === dayKey(now)) return "Сьогодні";
  if (k === dayKey(now - 86_400_000)) return "Вчора";
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", ...(new Date(at).getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}) }).format(at);
}

export type ChatToken = { kind: "text"; text: string } | { kind: "link"; text: string } | { kind: "at"; text: string; me: boolean };
const TOKEN = /(https?:\/\/[^\s<>"'«»]+)|(@[A-Za-zА-Яа-яІіЇїЄєҐґ'’-]{2,24}(?: [A-Za-zА-ЯІЇЄҐ]\.)?)/g;
/** Лише http(s) стає посиланням (кінцеві розділові знаки — поза ним); @Ім'я — згадка, `me` — моя. */
export function chatTokens(text: string, me: string): ChatToken[] {
  const out: ChatToken[] = [];
  const push = (t: string) => { if (!t) return; const p = out[out.length - 1]; if (p && p.kind === "text") p.text += t; else out.push({ kind: "text", text: t }); };
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    push(text.slice(last, at));
    if (m[1]) {
      const raw = m[1].replace(/[.,!?;:)]+$/, "");
      let ok = false;
      try { const u = new URL(raw); ok = (u.protocol === "https:" || u.protocol === "http:") && Boolean(u.hostname); } catch { ok = false; }
      if (ok) out.push({ kind: "link", text: raw }); else push(raw);
      push(m[1].slice(raw.length));
    } else if (m[2]) {
      out.push({ kind: "at", text: m[2], me: Boolean(me) && m[2].slice(1).toLowerCase() === me.toLowerCase() });
    }
    last = at + m[0].length;
  }
  push(text.slice(last));
  return out;
}
