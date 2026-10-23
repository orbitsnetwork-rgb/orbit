/**
 * Чат v2: розмови як у месенджерах — групи повідомлень з аватарками, дні, час, «надіслано/прочитано»,
 * відповіді з цитатою, редагування й видалення свого, меню (відповісти, реакція, копіювати, скарга),
 * 12 космічних реакцій, «друкує…», згадки @Ім'я, перехід до непрочитаного, оптимістичне надсилання з повтором.
 * Транспорт — довге опитування (сервер тримає до 8 с); хто пише — визначає сервер за ключем сесії.
 */
import { ArrowDown, Check, CheckCheck, ChevronLeft, Copy, CornerUpLeft, Flag, Lock, MessagesSquare, MoreHorizontal, Pencil, RotateCw, Search, Send, Shield, SmilePlus, Trash2, WifiOff, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/orbit/ui/kit";
import { ReactionIcon } from "@/components/orbit/reactions";
import { chatDelete, chatEdit, chatRead, chatReact, chatReport, chatRooms, chatSend, chatTyping, chatWho, dmBlock, dmState, modMute, type ChatLine, type ChatReacts, type ChatReadOut } from "@/lib/orbit/live";
import { CHAT_MAX, REACTIONS, muteText, type ReactionId, type RoomInfo } from "@/lib/orbit/live-rules";
import { sessionCreds } from "@/lib/orbit/store";
import { chatTokens, dayKey, dayLabel, hm } from "@/lib/orbit/chat-text";

export type RoomRow = RoomInfo & { unread: number; last?: { name: string; text: string; at: number } | null };
type Pending = { key: string; text: string; at: number; replyTo: ChatLine["replyTo"]; state: "sending" | "failed"; error?: string };

const GROUP_MS = 5 * 60_000;
function listTime(at: number, now = Date.now()) {
  if (dayKey(at) === dayKey(now)) return hm(at);
  if (now - at < 6 * 86_400_000) return new Intl.DateTimeFormat("uk-UA", { weekday: "short" }).format(at);
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" }).format(at);
}
const reduce = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export { hm, dayLabel };
/** Безпечний розбір тексту (див. chat-text.ts): React екранує все, посилання лише http(s). */
export function richText(text: string, me: string): ReactNode[] {
  return chatTokens(text, me).map((t, i) =>
    t.kind === "link" ? <a key={i} href={t.text} target="_blank" rel="noopener noreferrer nofollow ugc" className="cv-link">{t.text}</a>
    : t.kind === "at" ? <span key={i} className={t.me ? "cv-at is-me" : "cv-at"}>{t.text}</span>
    : t.text);
}

function plural(n: number, one: string, few: string, many: string) {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
}

/** Меню повідомлення: панель 12 реакцій + дії. Esc закриває; фокус — на першу реакцію. */
function MessageMenu({ line, mine, isMod, onDm, onReact, onReply, onCopy, onEdit, onDelete, onReport, onMute, onClose, reported }: {
  line: ChatLine; mine: Record<string, boolean>; isMod: boolean; reported: boolean; onDm?: () => void;
  onReact: (k: ReactionId) => void; onReply: () => void; onCopy: () => void; onEdit: () => void; onDelete: () => void; onReport: () => void; onMute: () => void; onClose: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const spot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
    // Позиція: фіксовано біля повідомлення; якщо знизу не вміщається — розкриваємо вгору; завжди в межах екрана.
    const place = () => {
      const el = root.current; const anchor = spot.current?.closest(".cv-msg") as HTMLElement | null;
      if (!el || !anchor) return;
      const vv = window.visualViewport; const vh = vv?.height ?? window.innerHeight; const vw = vv?.width ?? window.innerWidth;
      const a = anchor.getBoundingClientRect(); const h = el.offsetHeight; const w = el.offsetWidth; const pad = 8;
      let top = a.bottom + 4;
      if (top + h > vh - pad) top = a.top - h - 4 >= pad ? a.top - h - 4 : Math.max(pad, vh - h - pad);
      let left = line.mine ? a.right - w : a.left;
      left = Math.min(Math.max(pad, left), Math.max(pad, vw - w - pad));
      el.style.position = "fixed"; el.style.top = `${Math.round(top)}px`; el.style.left = `${Math.round(left)}px`; el.style.right = "auto"; el.style.margin = "0";
      el.style.maxHeight = `${Math.max(160, vh - 2 * pad)}px`; el.style.overflowY = "auto";
      el.dataset.side = top < a.top ? "up" : "down";
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const away = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".cv-more")) onClose(); };
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", away, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("keydown", key, true); document.removeEventListener("pointerdown", away, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const act = (fn: () => void) => () => { fn(); onClose(); };
  return (
    <span ref={spot} className="cv-menu-spot" hidden>{createPortal(
    <div ref={root} className="cv-menu" role="dialog" aria-label="Дії з повідомленням">
      <div className="orbit-rx-pick cv-rx-bar" role="group" aria-label="Обери реакцію" id={`rx-pick-${line.id}`}>
        {REACTIONS.map((r, i) => (
          <button key={r.id} ref={i === 0 ? first : undefined} type="button" className={mine[r.id] ? "orbit-rx-opt is-on" : "orbit-rx-opt"}
            aria-pressed={!!mine[r.id]} aria-label={r.name} title={r.name} onClick={act(() => onReact(r.id))}>
            <ReactionIcon id={r.id} size={24} />
            <span>{r.short}</span>
          </button>
        ))}
      </div>
      <div className="cv-acts" role="group" aria-label="Дії">
        <button type="button" onClick={act(onReply)}><CornerUpLeft size={16} aria-hidden /> Відповісти</button>
        <button type="button" onClick={act(onCopy)}><Copy size={16} aria-hidden /> Копіювати</button>
        {line.mine ? <button type="button" onClick={act(onEdit)}><Pencil size={16} aria-hidden /> Змінити</button> : null}
        {line.mine || isMod ? <button type="button" className="is-danger" onClick={act(onDelete)}><Trash2 size={16} aria-hidden /> {line.mine ? "Видалити" : "Видалити (модератор)"}</button> : null}
        {!line.mine && onDm ? <button type="button" onClick={act(onDm)}><Send size={16} aria-hidden /> Написати особисто</button> : null}
        {!line.mine ? <button type="button" disabled={reported} onClick={act(onReport)}><Flag size={16} aria-hidden /> {reported ? "Скаргу надіслано" : "Поскаржитись"}</button> : null}
        {!line.mine && isMod ? <button type="button" className="is-danger" onClick={act(onMute)}><Shield size={16} aria-hidden /> Пауза 1 год</button> : null}
      </div>
    </div>, document.body)}</span>
  );
}

export function ChatRoom({ room, title = "Розмова", unreadAtOpen = 0, myName = "", onUnread, onBack, onDm }: {
  room: string; title?: string; unreadAtOpen?: number; myName?: string; onDm?: (uid: string, name: string) => void;
  onUnread?: (unread: Record<string, number>) => void; onBack?: () => void;
}) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [reacts, setReacts] = useState<ChatReacts>({});
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [allowed, setAllowed] = useState(true);
  const [online, setOnline] = useState(0);
  const [peer, setPeer] = useState(0);
  const [typing, setTyping] = useState<string[]>([]);
  const [isMod, setIsMod] = useState(false);
  const [reported, setReported] = useState<number[]>([]);
  const [menu, setMenu] = useState<number | null>(null);
  const [who, setWho] = useState<{ id: number; list: Record<string, string[]> } | null>(null);
  const [fresh, setFresh] = useState(0);
  const [muted, setMuted] = useState(0);
  const [reply, setReply] = useState<ChatLine | null>(null);
  const [editing, setEditing] = useState<ChatLine | null>(null);
  const [unreadFrom, setUnreadFrom] = useState(0);
  const [flash, setFlash] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const cur = useRef({ last: 0, first: 0, rx: 0, ev: 0, tp: 0 });
  const nearEnd = useRef(true);
  const stick = useRef(false);
  const hold = useRef(0);
  const typedAt = useRef(0);
  const shiftDown = useRef(false);
  const unreadCb = useRef(onUnread);
  unreadCb.current = onUnread;
  /** Останній id першого завантаження: усе новіше з’являється з легкою анімацією (не вся історія разом). */
  const baseId = useRef(-1);
  const kick = useRef<() => void>(() => {});

  function take(next: ChatReadOut, full: boolean) {
    setAllowed(next.allowed);
    setOnline(next.online);
    setMuted(next.mutedUntil ?? 0);
    setPeer(next.peer ?? 0);
    setTyping(next.typing ?? []);
    cur.current.tp = (next.typing ?? []).length;
    setIsMod(Boolean(next.mod));
    unreadCb.current?.(next.unread ?? {});
    cur.current.rx = next.rx ?? cur.current.rx;
    cur.current.ev = Math.max(cur.current.ev, next.ev ?? 0);
    setReacts(next.reacts ?? {});
    setLines((rows) => {
      const changed = new Map((next.changed ?? []).map((l) => [l.id, l]));
      // Повернуте власником (було сховане) приходить у changed — вставляємо на своє місце за id.
      const back = (next.changed ?? []).filter((l) => !rows.some((r) => r.id === l.id) && !next.lines.some((n) => n.id === l.id));
      const merged = (full ? next.lines : [...rows.map((r) => changed.get(r.id) ?? r), ...back, ...next.lines.filter((l) => !rows.some((r) => r.id === l.id))].sort((x, y) => x.id - y.id));
      const out = merged.filter((l) => !next.hidden.includes(l.id)).slice(-120);
      cur.current.last = out.length ? out[out.length - 1].id : cur.current.last;
      cur.current.first = out.length ? (cur.current.first > 0 && !full ? Math.min(cur.current.first, out[0].id) : out[0].id) : cur.current.first; // не зсуваємо вгору: сховане й потім повернуте має повернутись
      const added = next.lines.filter((l) => !rows.some((r) => r.id === l.id));
      if (!full && added.length && !nearEnd.current && !added.some((l) => l.mine)) setFresh((n) => n + added.filter((l) => !l.mine).length);
      if (added.some((l) => l.mine)) stick.current = true;
      if (full && unreadAtOpen > 0 && out.length) setUnreadFrom(out[Math.max(0, out.length - unreadAtOpen)].id);
      return out;
    });
  }
  const read = (wait: boolean) => chatRead({ data: { ...sessionCreds(), room, after: cur.current.last, from: cur.current.first, rx: cur.current.rx, ev: cur.current.ev, tp: cur.current.tp, wait } });

  useEffect(() => {
    let alive = true;
    let pause = 0;
    let timer = 0;
    let busy = false;
    cur.current = { last: 0, first: 0, rx: 0, ev: 0, tp: 0 };
    setLines([]); setReacts({}); setLoaded(false); setFresh(0); setPending([]); setReply(null); setEditing(null);
    async function loop() {
      if (!alive || busy) return;
      if (document.visibilityState !== "visible") return;
      busy = true;
      try {
        const full = cur.current.last === 0;
        const next = await read(!full);
        if (!alive) return;
        if (full) { stick.current = true; void import("@/lib/orbit/inbox").then((m) => m.refreshChatNotes()); }
        take(next, full);
        if (full && baseId.current < 0) baseId.current = next.lines.length ? next.lines[next.lines.length - 1].id : 0;
        setLoaded(true);
        setFailed(false);
        pause = 0;
        if (!next.allowed) { busy = false; return; }
      } catch {
        setLoaded(true);
        setFailed(true);
        pause = Math.min(15_000, (pause || 1000) * 2);
      }
      busy = false;
      timer = window.setTimeout(() => void loop(), pause || 50);
    }
    const onVis = () => { if (document.visibilityState === "visible" && !busy) { window.clearTimeout(timer); void loop(); } };
    kick.current = () => { if (busy) return; window.clearTimeout(timer); pause = 0; void loop(); };
    baseId.current = -1;
    void loop();
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // Перший показ: до першого непрочитаного (якщо є), інакше — донизу. Далі донизу лише якщо людина й так унизу.
  const jumped = useRef(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (!jumped.current && unreadFrom && lines.length) {
      jumped.current = true;
      const target = el.querySelector(`[data-msg="${unreadFrom}"]`) as HTMLElement | null;
      if (target) { el.scrollTop = Math.max(0, target.offsetTop - 48); stick.current = false; return; }
    }
    if (nearEnd.current || stick.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: stick.current && !reduce() && jumped.current ? "smooth" : "auto" });
      stick.current = false;
      jumped.current = true;
      setFresh(0);
    }
  }, [lines.length, pending.length, unreadFrom]);

  // Поле вводу росте разом із текстом (до 140 px), як у месенджерах.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, 140)}px`;
  }, [text]);

  function onScroll() {
    const el = box.current;
    if (!el) return;
    nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
    if (nearEnd.current) setFresh(0);
  }
  function toEnd() {
    const el = box.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce() ? "auto" : "smooth" });
    setFresh(0);
  }
  function jumpTo(id: number) {
    const el = box.current?.querySelector(`[data-msg="${id}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: reduce() ? "auto" : "smooth" });
    setFlash(id);
    window.setTimeout(() => setFlash(0), 1400);
  }

  async function deliver(p: Pending) {
    setPending((rows) => rows.map((r) => (r.key === p.key ? { ...r, state: "sending", error: undefined } : r)));
    try {
      const out = await chatSend({ data: { ...sessionCreds(), room, text: p.text, replyTo: p.replyTo?.id ?? 0 } });
      if (!out.ok) {
        setPending((rows) => rows.map((r) => (r.key === p.key ? { ...r, state: "failed", error: out.error ?? "Не надіслано." } : r)));
        setError(out.error ?? "Не надіслано.");
        return;
      }
      if (out.error) setNotice(out.error);
      const next = await read(false).catch(() => null);
      if (next) take(next, false);
      setPending((rows) => rows.filter((r) => r.key !== p.key));
    } catch {
      setPending((rows) => rows.map((r) => (r.key === p.key ? { ...r, state: "failed", error: "Немає зв’язку." } : r)));
      setError("Сервер не відповідає. Натисни «Повторити».");
    }
  }
  async function submit() {
    const clean = text.trim();
    if (!clean) return;
    setError(""); setNotice("");
    if (editing) {
      const target = editing;
      setEditing(null);
      setText("");
      setLines((rows) => rows.map((r) => (r.id === target.id ? { ...r, text: clean, edited: true } : r)));
      try {
        const out = await chatEdit({ data: { ...sessionCreds(), id: target.id, text: clean } });
        if (!out.ok) { setError(out.error ?? "Не змінено."); setLines((rows) => rows.map((r) => (r.id === target.id ? target : r))); }
      } catch { setError("Сервер не відповідає. Спробуй ще раз."); setLines((rows) => rows.map((r) => (r.id === target.id ? target : r))); }
      return;
    }
    const p: Pending = { key: `p${Date.now()}${Math.random()}`, text: clean, at: Date.now(), replyTo: reply ? { id: reply.id, name: reply.mine ? "Я" : reply.name, text: reply.text.slice(0, 80), gone: false } : null, state: "sending" };
    setPending((rows) => [...rows, p]);
    setText("");
    setReply(null);
    stick.current = true;
    await deliver(p);
  }
  function onType(v: string) {
    setText(v);
    const now = Date.now();
    if (v.trim() && now - typedAt.current > 3500) {
      typedAt.current = now;
      void chatTyping({ data: { ...sessionCreds(), room } }).catch(() => null);
    }
  }
  async function react(id: number, kind: ReactionId) {
    setReacts((all) => {
      const row = { ...(all[id] ?? {}) };
      const [n, on] = row[kind] ?? [0, false];
      const v = on ? n - 1 : n + 1;
      if (v > 0) row[kind] = [v, !on]; else delete row[kind];
      return { ...all, [id]: row };
    });
    try {
      const out = await chatReact({ data: { ...sessionCreds(), id, kind } });
      if (!out.ok) setError(out.error ?? "Реакцію не збережено.");
    } catch { setError("Сервер не відповідає. Спробуй ще раз."); }
    if (who?.id === id) void showWho(id);
  }
  async function showWho(id: number) {
    try {
      const out = await chatWho({ data: { ...sessionCreds(), id } });
      setWho(out.ok ? { id, list: out.who } : null);
    } catch { setWho(null); }
  }
  async function remove(line: ChatLine) {
    if (!window.confirm(line.mine ? "Видалити повідомлення для всіх?" : "Видалити це повідомлення як модератор? Дія потрапить у журнал.")) return;
    const before = lines;
    setLines((rows) => rows.map((r) => (r.id === line.id ? { ...r, deleted: true, text: "" } : r)));
    try {
      const out = await chatDelete({ data: { ...sessionCreds(), id: line.id } });
      if (!out.ok) { setError(out.error ?? "Не видалено."); setLines(before); }
    } catch { setError("Сервер не відповідає."); setLines(before); }
  }
  async function mute(line: ChatLine) {
    if (!window.confirm(`Поставити ${line.name} паузу в чаті на 1 годину?`)) return;
    try {
      const out = await modMute({ data: { ...sessionCreds(), id: line.id, hours: 1 } });
      setNotice(out.ok ? `${line.name}: пауза на 1 годину. Записано в журнал.` : (out.error ?? "Не вдалося."));
    } catch { setError("Сервер не відповідає."); }
  }
  async function copy(line: ChatLine) {
    try { await navigator.clipboard.writeText(line.text); setNotice("Скопійовано."); } catch { setNotice("Не вдалося скопіювати."); }
  }
  const press = (id: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button, a")) return;
      window.clearTimeout(hold.current);
      hold.current = window.setTimeout(() => setMenu(id), 450);
    },
    onPointerUp: () => window.clearTimeout(hold.current),
    onPointerLeave: () => window.clearTimeout(hold.current),
    onPointerCancel: () => window.clearTimeout(hold.current),
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setMenu(id); },
  });

  const now = Date.now();
  const rows = useMemo(() => lines.map((line, i) => {
    const prev = lines[i - 1];
    const nextL = lines[i + 1];
    const newDay = !prev || dayKey(prev.at) !== dayKey(line.at);
    const head = newDay || !prev || prev.uid !== line.uid || line.at - prev.at > GROUP_MS || line.id === unreadFrom;
    const tail = !nextL || nextL.uid !== line.uid || nextL.at - line.at > GROUP_MS || dayKey(nextL.at) !== dayKey(line.at) || nextL.id === unreadFrom;
    return { line, newDay, head, tail };
  }), [lines, unreadFrom]);

  if (!allowed) {
    return (
      <section className="orbit-block cv cv-locked" aria-labelledby="chat-title">
        <header className="cv-head">
          {onBack ? <button type="button" className="mo-icon cv-back" aria-label="До розмов" onClick={onBack}><ChevronLeft size={20} aria-hidden /></button> : null}
          <span className="cv-head-ico" aria-hidden><Lock size={20} /></span>
          <div className="cv-head-t"><h2 id="chat-title">{title}</h2></div>
        </header>
        <div className="cv-state" role="alert">
          <span className="cv-state-ico" aria-hidden><Lock size={26} strokeWidth={1.6} /></span>
          <p className="cv-state-t">Кімната лише для учасників</p>
          <p className="cv-state-s">Сюди пишуть автор запуску і ті, хто його підтвердив.</p>
        </div>
      </section>
    );
  }
  const dm = room.startsWith("d:") ? (room.slice(2).split("~").find((id) => id !== sessionCreds().sessionId) ?? null) : null;
  const typingText = typing.length ? `${typing.join(", ")} ${typing.length === 1 ? "друкує" : "друкують"}` : "";
  const presence = dm ? (online >= 2 ? "у мережі" : "особиста розмова") : online >= 2 ? `${online} онлайн` : "зараз тут лише ти";
  const offline = loaded && failed;
  return (
    <section className="orbit-block cv" aria-labelledby="chat-title" data-state={!loaded ? "loading" : offline ? "offline" : "ok"}>
      <header className="cv-head">
        {onBack ? <button type="button" className="mo-icon cv-back" aria-label="До розмов" onClick={onBack}><ChevronLeft size={20} aria-hidden /></button> : null}
        <span className="cv-head-ico" aria-hidden>{dm ? <Avatar id={dm} name={title} size={40} /> : <ReactionIcon id="launch" size={26} />}</span>
        <div className="cv-head-t">
          <h2 id="chat-title">{title}</h2>
          <small aria-live="polite">{typingText ? <span className="cv-typing">{typingText}<i aria-hidden /><i aria-hidden /><i aria-hidden /></span>
            : offline ? <span className="cv-presence is-off" role="status"><WifiOff size={12} aria-hidden /> немає зв’язку</span>
            : <span className={`orbit-live-dot cv-presence${online >= 2 ? " is-on" : ""}`} role="status" aria-label={`Онлайн: ${online}`}><i aria-hidden /> {presence}</span>}</small>
        </div>
        {dm ? <DmMenu peer={dm} name={title} /> : null}
      </header>
      <p className="orbit-note cv-scope">{dm ? "Бачите лише ви двоє." : "Бачать лише автор і ті, хто підтвердив."} Не пиши ключ входу й коди.</p>
      <div className="orbit-chat-wrap">
        <div ref={box} className="orbit-chat cv-log" onScroll={onScroll} role="log" aria-live="polite" aria-label="Повідомлення чату">
          {!loaded ? (
            <div className="cv-skel" role="status" aria-label="Завантажую повідомлення">{[58, 40, 72, 46].map((w, i) => <span key={i} style={{ width: `${w}%` }} className={i % 2 ? "is-mine" : ""} />)}</div>
          ) : null}
          {loaded && failed && !lines.length ? (
            <div className="cv-state cv-state-off" role="alert">
              <span className="cv-state-ico" aria-hidden><WifiOff size={26} strokeWidth={1.6} /></span>
              <p className="cv-state-t">Немає зв’язку з чатом</p>
              <p className="cv-state-s">Перевір інтернет — ми пробуємо ще раз самі. Повідомлення нікуди не зникнуть.</p>
              <button type="button" className="orbit-chip cv-state-go" onClick={() => kick.current()}><RotateCw size={15} aria-hidden /> Спробувати зараз</button>
            </div>
          ) : null}
          {loaded && !failed && lines.length === 0 && pending.length === 0 ? (
            <div className="orbit-chat-empty cv-empty cv-state">
              <span className="cv-state-ico is-glow" aria-hidden><ReactionIcon id="galaxy" size={40} /></span>
              <p className="cv-state-t">Поки тихо</p>
              <p className="cv-state-s">Привітайся першим — {dm ? `${title} побачить це тут.` : "твій екіпаж побачить."}</p>
            </div>
          ) : null}
          {rows.map(({ line, newDay, head, tail }) => {
            const rs = reacts[line.id] ?? {};
            const kinds = REACTIONS.filter((r) => rs[r.id]);
            const mineRx = Object.fromEntries(kinds.map((r) => [r.id, rs[r.id][1]]));
            const readByPeer = line.mine && peer >= line.id;
            return (
              <Fragment key={line.id}>
                {newDay ? <div className="cv-day" role="separator"><span>{dayLabel(line.at, now)}</span></div> : null}
                {line.id === unreadFrom ? <div className="cv-unread" role="separator"><span>Непрочитані</span></div> : null}
                <div className={`orbit-msg cv-msg${line.mine ? " orbit-msg-mine" : ""}${!line.mine && baseId.current >= 0 && line.id > baseId.current ? " is-new" : ""}${head ? " is-head" : " is-cont"}${tail ? " is-tail" : ""}${flash === line.id ? " is-flash" : ""}${line.deleted ? " is-deleted" : ""}`} data-msg={line.id} {...press(line.id)}>
                  {!line.mine ? <span className="cv-ava">{tail ? <Avatar id={line.uid} name={line.name} size={30} /> : null}</span> : null}
                  <div className="orbit-msg-b">
                    {head && !line.mine ? <p className="orbit-msg-h"><b>{line.name}</b></p> : null}
                    {line.replyTo ? (
                      <button type="button" className="cv-quote" onClick={() => jumpTo(line.replyTo!.id)} aria-label={`Відповідь на повідомлення ${line.replyTo.name}`}>
                        <b>{line.replyTo.gone ? "Повідомлення" : line.replyTo.name}</b>
                        <span>{line.replyTo.gone ? "видалено" : line.replyTo.text}</span>
                      </button>
                    ) : null}
                    {line.deleted ? <p className="orbit-msg-t cv-gone">Повідомлення видалено</p> : <p className="orbit-msg-t">{richText(line.text, myName)}</p>}
                    <span className="cv-meta">
                      {line.edited && !line.deleted ? <em>змінено</em> : null}
                      <time dateTime={new Date(line.at).toISOString()}>{hm(line.at)}</time>
                      {line.mine && !line.deleted ? (readByPeer ? <CheckCheck size={14} className="cv-tick is-read" aria-label="Прочитано" /> : <Check size={14} className="cv-tick" aria-label="Надіслано" />) : null}
                    </span>
                    {kinds.length ? (
                      <div className="orbit-rx-row">
                        {kinds.map((r) => (
                          <button key={r.id} type="button" className={rs[r.id][1] ? "orbit-rx is-on" : "orbit-rx"} aria-pressed={rs[r.id][1]}
                            aria-label={`${r.name}: ${rs[r.id][0]}. ${rs[r.id][1] ? "Прибрати мою" : "Додати мою"}`} title={r.name} onClick={() => void react(line.id, r.id)}>
                            <ReactionIcon id={r.id} size={16} /> <span>{rs[r.id][0]}</span>
                          </button>
                        ))}
                        <button type="button" className="orbit-rx-who" aria-expanded={who?.id === line.id} onClick={() => (who?.id === line.id ? setWho(null) : void showWho(line.id))}>Хто?</button>
                      </div>
                    ) : null}
                    {who?.id === line.id ? (
                      <ul className="orbit-rx-list" aria-label="Хто відреагував">
                        {REACTIONS.filter((r) => who.list[r.id]?.length).map((r) => (
                          <li key={r.id}><ReactionIcon id={r.id} size={16} /><b>{r.name.replace(/^✦ /, "")}</b>: {who.list[r.id].join(", ")}</li>
                        ))}
                        {!REACTIONS.some((r) => who.list[r.id]?.length) ? <li>Поки ніхто.</li> : null}
                      </ul>
                    ) : null}
                    {menu === line.id && !line.deleted ? (
                      <MessageMenu line={line} mine={mineRx} isMod={isMod} reported={reported.includes(line.id)} onDm={onDm && !dm ? () => onDm(line.uid, line.name) : undefined}
                        onReact={(k) => void react(line.id, k)}
                        onReply={() => { setEditing(null); setReply(line); input.current?.focus(); }}
                        onCopy={() => void copy(line)}
                        onEdit={() => { setReply(null); setEditing(line); setText(line.text); input.current?.focus(); }}
                        onDelete={() => void remove(line)}
                        onReport={() => { setReported((r) => [...r, line.id]); void chatReport({ data: { ...sessionCreds(), id: line.id } }).catch(() => null); }}
                        onMute={() => void mute(line)}
                        onClose={() => setMenu(null)} />
                    ) : null}
                  </div>
                  {!line.deleted ? (
                    <div className="orbit-msg-a">
                      <button type="button" className="mo-icon cv-more" aria-label={`Реакція на повідомлення від ${line.mine ? "мене" : line.name}`} aria-expanded={menu === line.id}
                        aria-controls={menu === line.id ? `rx-pick-${line.id}` : undefined} onClick={() => setMenu(menu === line.id ? null : line.id)}>
                        <SmilePlus size={15} aria-hidden />
                      </button>
                      <button type="button" className="mo-icon cv-more" aria-label={`Ще дії з повідомленням від ${line.mine ? "мене" : line.name}`} onClick={() => setMenu(menu === line.id ? null : line.id)}>
                        <MoreHorizontal size={15} aria-hidden />
                      </button>
                    </div>
                  ) : null}
                </div>
              </Fragment>
            );
          })}
          {pending.map((p) => (
            <div key={p.key} className={`orbit-msg cv-msg orbit-msg-mine is-new is-head is-tail is-pending${p.state === "failed" ? " is-failed" : ""}`}>
              <div className="orbit-msg-b">
                {p.replyTo ? <span className="cv-quote"><b>{p.replyTo.name}</b><span>{p.replyTo.text}</span></span> : null}
                <p className="orbit-msg-t">{richText(p.text, myName)}</p>
                <span className="cv-meta">
                  {p.state === "sending" ? <><time>{hm(p.at)}</time><span className="cv-clock" aria-label="Надсилаю" /></> : (
                    <button type="button" className="cv-retry" onClick={() => void deliver(p)}><RotateCw size={13} aria-hidden /> Не надіслано · Повторити</button>
                  )}
                </span>
              </div>
              {p.state === "failed" ? <button type="button" className="mo-icon" aria-label="Скасувати повідомлення" onClick={() => setPending((rows) => rows.filter((r) => r.key !== p.key))}><X size={15} aria-hidden /></button> : null}
            </div>
          ))}
        </div>
        {fresh > 0 ? (
          <button type="button" className="orbit-chat-pill" aria-label={`Перейти до нових повідомлень: ${fresh}`} onClick={toEnd}><ArrowDown size={14} aria-hidden /> {fresh} {plural(fresh, "нове", "нові", "нових")}</button>
        ) : null}
      </div>
      {offline && lines.length ? <p className="cv-offline" role="status"><WifiOff size={14} aria-hidden /> Немає зв’язку — нові повідомлення з’являться, щойно він повернеться.</p> : null}
      {muted > Date.now() ? <p className="orbit-chat-mute" role="status">{muteText(muted)}</p> : null}
      <form className="cv-compose" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {reply || editing ? (
          <div className="cv-ctx">
            {editing ? <Pencil size={15} aria-hidden /> : <CornerUpLeft size={15} aria-hidden />}
            <span><b>{editing ? "Редагування" : `Відповідь ${reply!.mine ? "собі" : reply!.name}`}</b><small>{(editing ?? reply)!.text.slice(0, 80)}</small></span>
            <button type="button" className="mo-icon" aria-label={editing ? "Скасувати редагування" : "Скасувати відповідь"} onClick={() => { if (editing) setText(""); setReply(null); setEditing(null); }}><X size={15} aria-hidden /></button>
          </div>
        ) : null}
        <div className="cv-row">
          <label className="sr-only" htmlFor="chat-input">Повідомлення</label>
          <textarea ref={input} id="chat-input" className="orbit-field cv-input" rows={1} enterKeyHint="send" autoComplete="off" autoCorrect="on" spellCheck
            disabled={muted > Date.now()} value={text} maxLength={CHAT_MAX} placeholder="Повідомлення…"
            onChange={(e) => onType(e.target.value)}
            onBeforeInput={(e) => {
              // Android (Gboard/Samsung): клавіша «Надіслати» приходить як insertLineBreak під час набору (isComposing, keyCode 229) — keydown її не ловить.
              const ne = e.nativeEvent as InputEvent;
              if ((ne.inputType === "insertLineBreak" || ne.inputType === "insertParagraph") && !shiftDown.current) { e.preventDefault(); void submit(); }
            }}
            onKeyUp={(e) => { shiftDown.current = e.shiftKey; }}
            onKeyDown={(e) => { shiftDown.current = e.shiftKey; if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } if (e.key === "Escape" && (reply || editing)) { setReply(null); if (editing) setText(""); setEditing(null); } }} />
          <button type="submit" className="cv-send" aria-label={editing ? "Зберегти" : "Надіслати"} disabled={muted > Date.now() || text.trim().length < 1}>
            {editing ? <Check size={20} aria-hidden /> : <Send size={19} aria-hidden />}
          </button>
        </div>
        {text.length > CHAT_MAX - 40 ? <p className="orbit-note">{CHAT_MAX - text.length} знаків лишилось</p> : null}
        {error ? <p className="orbit-note cv-err" role="alert">{error}</p> : null}
        {notice && !error ? <p className="orbit-note" role="status">{notice}</p> : null}
      </form>
    </section>
  );
}

/** Список розмов: остання репліка, час, непрочитане. */
export function RoomList({ current, onPick, unread, onCurrent, myName = "", onSeek }: { current: string | null; onPick: (room: RoomRow) => void; unread?: Record<string, number>; onCurrent?: (room: RoomRow) => void; myName?: string; onSeek?: () => void }) {
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const out = await chatRooms({ data: sessionCreds() });
        if (alive) { setRooms(out.rooms); setFailed(false); const cur = out.rooms.find((r) => r.id === current); if (cur && onCurrent) onCurrent(cur); }
      } catch { if (alive) setFailed(true); }
    };
    void load();
    const id = window.setInterval(() => void load(), 20_000);
    return () => { alive = false; window.clearInterval(id); };
  }, [current, tick]);
  useEffect(() => {
    if (!unread) return;
    setRooms((rows) => rows?.map((r) => (r.id === current ? { ...r, unread: 0 } : { ...r, unread: unread[r.id] ?? r.unread })) ?? rows);
  }, [unread, current]);
  const now = Date.now();
  const total = rooms?.reduce((n, r) => n + (r.id === current ? 0 : r.unread), 0) ?? 0;
  return (
    <nav className="orbit-block cv-list" aria-labelledby="rooms-title" data-state={!rooms ? (failed ? "error" : "loading") : rooms.length ? "ok" : "empty"}>
      <div className="cv-list-head">
        <h2 className="cv-list-h" id="rooms-title">Усі розмови</h2>
        {rooms && rooms.length ? <span className="cv-list-n">{total ? `${total} ${plural(total, "непрочитане", "непрочитані", "непрочитаних")}` : `${rooms.length}`}</span> : null}
      </div>
      {!rooms && !failed ? (
        <div className="cv-skel cv-skel-list" role="status" aria-label="Завантажую розмови">
          {[0, 1, 2].map((i) => <div key={i} className="cv-skel-row"><span className="cv-skel-ava" /><span className="cv-skel-lines"><span /><span /></span></div>)}
        </div>
      ) : null}
      {failed && !rooms ? (
        <div className="cv-state cv-state-off" role="alert">
          <span className="cv-state-ico" aria-hidden><WifiOff size={24} strokeWidth={1.6} /></span>
          <p className="cv-state-t">Не вдалося завантажити розмови</p>
          <p className="cv-state-s">Ми спробуємо ще раз самі за хвилину.</p>
          <button type="button" className="orbit-chip cv-state-go" onClick={() => { setFailed(false); setTick((t) => t + 1); }}><RotateCw size={15} aria-hidden /> Спробувати зараз</button>
        </div>
      ) : null}
      {rooms && rooms.length ? (
        <ul className="orbit-rooms">
          {rooms.map((room, i) => {
            const n = room.id === current ? 0 : room.unread;
            const mine = Boolean(room.last && (room.last.name === "Я" || (myName && room.last.name === myName))); // сервер позначає свої як «Я»
            return (
              <li key={room.id} style={{ ["--i" as string]: Math.min(i, 8) }}>
                <button type="button" data-room={room.id} className={`orbit-room${room.id === current ? " is-on" : ""}${n ? " has-unread" : ""}`} aria-current={room.id === current ? "true" : undefined}
                  aria-label={`${room.title}, ${room.kind === "dm" ? "особиста розмова" : `${room.members} учасн.`}, ${n ? `непрочитаних ${n}` : "усе прочитано"}`}
                  onClick={() => { setRooms((rows) => rows?.map((r) => (r.id === room.id ? { ...r, unread: 0 } : r)) ?? rows); onPick({ ...room, unread: n }); }}>
                  <span className="orbit-room-k cv-room-ava" aria-hidden>{room.kind === "dm" ? <Avatar id={room.peer ?? room.id} name={room.title} size={48} /> : <ReactionIcon id={room.kind === "crew" ? "spark" : "launch"} size={24} />}</span>
                  <span className="orbit-room-t">
                    <span className="cv-room-top"><span className="cv-room-name">{room.title}</span>{room.last ? <time className="cv-room-time">{listTime(room.last.at, now)}</time> : null}</span>
                    <span className="cv-room-bottom">
                      <small className="cv-room-last">{room.last ? <><b>{mine ? "Ти" : room.last.name}:</b> {room.last.text}</> : room.kind === "dm" ? "Особиста розмова · поки без повідомлень" : `${room.members} учасн. · поки без повідомлень`}</small>
                      {n ? <span className="orbit-room-n" aria-hidden>{n >= 99 ? "99+" : n}</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {rooms && rooms.length === 0 ? (
        <div className="cv-state cv-none">
          <span className="cv-state-ico is-glow" aria-hidden><MessagesSquare size={26} strokeWidth={1.6} /></span>
          <p className="cv-state-t">Розмов ще немає</p>
          <p className="cv-state-s">Кімнату отримує кожен запуск — для автора і тих, хто підтвердив. Особисто можна написати з «Шукаю орбіту» чи з профілю власника в «Оглядачі».</p>
          {onSeek ? <button type="button" className="orbit-chip cv-state-go" onClick={onSeek}><Search size={15} aria-hidden /> Шукаю орбіту</button> : null}
        </div>
      ) : null}
    </nav>
  );
}


/** Меню особистої розмови: заблокувати / розблокувати. Скарга — на конкретне повідомлення (його меню). */
function DmMenu({ peer, name }: { peer: string; name: string }) {
  const [st, setSt] = useState<{ blocked: boolean; blockedMe: boolean } | null>(null);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void dmState({ data: { ...sessionCreds(), peer } }).then(setSt).catch(() => null); }, [peer]);
  const toggle = async () => {
    setBusy(true);
    try { const out = await dmBlock({ data: { ...sessionCreds(), peer, on: !st?.blocked } }); if (out.ok) setSt((v) => ({ blockedMe: v?.blockedMe ?? false, blocked: Boolean(out.blocked) })); } catch { /* мережа: лишаємо як є */ }
    setBusy(false); setAsk(false);
  };
  if (!st) return null;
  return (
    <div className="cv-dm-tools">
      {ask ? (
        <span className="cv-dm-ask" role="group" aria-label="Підтвердження">
          <button type="button" className="orbit-chip" onClick={() => setAsk(false)}>Ні</button>
          <button type="button" className="orbit-chip is-danger" disabled={busy} onClick={() => void toggle()}>{st.blocked ? "Розблокувати" : `Заблокувати ${name}`}</button>
        </span>
      ) : (
        <button type="button" className="mo-icon cv-dm-block" aria-label={st.blocked ? "Розблокувати" : "Заблокувати"} title={st.blocked ? "Розблокувати" : "Заблокувати"} onClick={() => (st.blocked ? void toggle() : setAsk(true))}>
          <Shield size={18} aria-hidden />
        </button>
      )}
      {st.blocked || st.blockedMe ? <p className="orbit-note cv-dm-off" role="status">{st.blocked ? "Ти заблокував цю людину — писати тут не можна." : "Розмова недоступна."}</p> : null}
    </div>
  );
}
