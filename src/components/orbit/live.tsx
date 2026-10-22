import { ArrowDown, Flag, Music, ShieldCheck, CircleHelp, MessageCircle, Lock, SmilePlus, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Page } from "@/components/orbit/more";
import { ReactionIcon } from "@/components/orbit/reactions";
import { botSignal, chatRead, chatReact, chatReport, chatRooms, chatSend, chatWho, roleAsk, type ChatLine, type ChatReacts, type ChatReadOut } from "@/lib/orbit/live";
import { CHAT_MAX, REACTIONS, WHY_MAX, WHY_MIN, looksScripted, type ReactionId, type RoomInfo } from "@/lib/orbit/live-rules";
import { sessionCreds } from "@/lib/orbit/store";
import type { Account, World } from "@/lib/orbit/engine";

/** Відповіді чесні щодо того, як рушій працює зараз (не обіцянки). */
const QUESTIONS = [
  { q: "Хто може підтвердити запуск?", a: "Будь-яка інша людина в Орбітах зі свого акаунта. Свій запуск підтвердити не можна." },
  { q: "Скільки треба підтверджень?", a: "8 підтверджень від інших людей. Тому на самому старті, поки в світі менше 9 людей, запуск не набереться — запроси своїх." },
  { q: "Що таке іскра ✦?", a: "Внутрішня одиниця світу Орбіт. Це не гроші, не цінний папір і не обіцянка доходу. Вивести її зараз не можна." },
  { q: "Як стати підтверджувачем?", a: "Підтверджувати може кожен. Заявка — це прохання про довіру: власник світу перегляне її вручну." },
  { q: "Що буде, якщо акаунт схожий на бота?", a: "Автоматично нічого не забирається. Сервер лише ставить позначку, а людина її перевіряє. Якщо помилка — напиши нам." },
  { q: "Хто бачить мої повідомлення?", a: "У чаті світу — усі, хто увійшов. У кімнаті запуску чи екіпажу — лише автор і ті, хто його підтвердив (це перевіряє сервер). Показується лише «Ім’я П.». Не пиши паролі, ключ входу й коди." },
];

function ago(at: number, now: number) {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 1) return "щойно";
  if (m < 60) return `${m} хв`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} год` : `${Math.round(h / 24)} дн`;
}

type RoomRow = RoomInfo & { unread: number };

function clock(at: number) {
  const d = new Date(at);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === new Date().toDateString() ? hm : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")} ${hm}`;
}

/** Вибір реакції: 10 власних значків. Esc закриває, фокус повертається на кнопку, з якої відкрили. */
function ReactPicker({ msgId, mine, onPick, onClose }: { msgId: number; mine: Record<string, boolean>; onPick: (kind: ReactionId) => void; onClose: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [onClose]);
  return (
    <div className="orbit-rx-pick" role="group" aria-label="Обери реакцію" id={`rx-pick-${msgId}`}>
      {REACTIONS.map((r, i) => (
        <button key={r.id} ref={i === 0 ? first : undefined} type="button" className={mine[r.id] ? "orbit-rx-opt is-on" : "orbit-rx-opt"}
          aria-pressed={!!mine[r.id]} aria-label={r.name} title={r.name} onClick={() => { onPick(r.id); onClose(); }}>
          <ReactionIcon id={r.id} size={26} />
          <span>{r.name.replace(/^✦ /, "")}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Живе оновлення: довге опитування (сервер тримає запит до 8 с і відповідає, щойно є нове повідомлення, реакція чи сховане).
 * Працює лише поки вкладка видима; при помилках — пауза зі зростанням до 15 с.
 */
export function ChatRoom({ room = "world", title = "Чат світу", onUnread }: { room?: string; title?: string; onUnread?: (unread: Record<string, number>) => void }) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [reacts, setReacts] = useState<ChatReacts>({});
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [allowed, setAllowed] = useState(true);
  const [online, setOnline] = useState(0);
  const [reported, setReported] = useState<number[]>([]);
  const [picker, setPicker] = useState<number | null>(null);
  const [who, setWho] = useState<{ id: number; list: Record<string, string[]> } | null>(null);
  const [fresh, setFresh] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  const first = useRef(0);
  const rx = useRef(0);
  const nearEnd = useRef(true);
  const stick = useRef(false);
  const hold = useRef(0);
  const unreadCb = useRef(onUnread);
  unreadCb.current = onUnread;
  function take(next: ChatReadOut, full: boolean) {
    setAllowed(next.allowed);
    setOnline(next.online);
    unreadCb.current?.(next.unread ?? {});
    rx.current = next.rx ?? rx.current;
    setReacts(next.reacts ?? {});
    setLines((rows) => {
      const base = full ? next.lines : [...rows, ...next.lines.filter((l) => !rows.some((r) => r.id === l.id))];
      const out = base.filter((l) => !next.hidden.includes(l.id)).slice(-80);
      last.current = out.length ? out[out.length - 1].id : last.current;
      first.current = out.length ? out[0].id : first.current;
      const added = next.lines.filter((l) => !rows.some((r) => r.id === l.id));
      if (!full && added.length && !nearEnd.current && !added.some((l) => l.mine)) setFresh((n) => n + added.length);
      if (added.some((l) => l.mine)) stick.current = true;
      return out;
    });
  }
  useEffect(() => {
    let alive = true;
    let pause = 0;
    let timer = 0;
    last.current = 0;
    first.current = 0;
    rx.current = 0;
    setLines([]);
    setReacts({});
    setLoaded(false);
    setFresh(0);
    let busyLoop = false;
    async function loop() {
      if (!alive || busyLoop) return;
      if (document.visibilityState !== "visible") return; // продовжимо на visibilitychange
      busyLoop = true;
      try {
        const full = last.current === 0;
        const next = await chatRead({ data: { ...sessionCreds(), room, after: last.current, from: first.current, rx: rx.current, wait: !full } });
        if (!alive) return;
        if (full) stick.current = true;
        take(next, full);
        setLoaded(true);
        pause = 0;
        if (!next.allowed) { busyLoop = false; return; }
      } catch {
        setLoaded(true);
        pause = Math.min(15_000, (pause || 1000) * 2);
      }
      busyLoop = false;
      timer = window.setTimeout(() => void loop(), pause || 50);
    }
    // Один запит за раз: новий цикл стартує лише коли попередній завершився і вкладка знову видима.
    const onVis = () => {
      if (document.visibilityState === "visible" && !busyLoop) { window.clearTimeout(timer); void loop(); }
    };
    void loop();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [room]);
  // Прокрутка вниз лише якщо людина й так унизу (або це її повідомлення) — не смикаємо, коли читає історію.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (nearEnd.current || stick.current) {
      el.scrollTo({ top: el.scrollHeight });
      stick.current = false;
      setFresh(0);
    }
  }, [lines.length]);
  function onScroll() {
    const el = box.current;
    if (!el) return;
    nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (nearEnd.current) setFresh(0);
  }
  function toEnd() {
    const el = box.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
    setFresh(0);
  }
  async function send() {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError("");
    try {
      const out = await chatSend({ data: { ...sessionCreds(), room, text: clean } });
      if (out.ok) setText("");
      else setError(out.error ?? "Не надіслано.");
    } catch {
      setError("Сервер не відповідає. Спробуй ще раз.");
    }
    setBusy(false);
    // Свіже повідомлення приходить через довге опитування; разове читання — щоб не чекати.
    try {
      const next = await chatRead({ data: { ...sessionCreds(), room, after: last.current, from: first.current, rx: rx.current } });
      take(next, false);
    } catch { /* наступний цикл підхопить */ }
  }
  async function report(id: number) {
    setReported((rows) => [...rows, id]);
    await chatReport({ data: { ...sessionCreds(), id } }).catch(() => null);
  }
  async function react(id: number, kind: ReactionId) {
    // Одразу показуємо (оптимістично), сервер підтверджує через довге опитування.
    setReacts((all) => {
      const row = { ...(all[id] ?? {}) };
      const [n, on] = row[kind] ?? [0, false];
      const next = on ? n - 1 : n + 1;
      if (next > 0) row[kind] = [next, !on];
      else delete row[kind];
      return { ...all, [id]: row };
    });
    try {
      const out = await chatReact({ data: { ...sessionCreds(), id, kind } });
      if (!out.ok) setError(out.error ?? "Реакцію не збережено.");
    } catch {
      setError("Сервер не відповідає. Спробуй ще раз.");
    }
    if (who?.id === id) void showWho(id);
  }
  async function showWho(id: number) {
    try {
      const out = await chatWho({ data: { ...sessionCreds(), id } });
      setWho(out.ok ? { id, list: out.who } : null);
    } catch { setWho(null); }
  }
  // Утримання ~0,45 с на повідомленні теж відкриває вибір реакцій (як у месенджерах).
  const press = (id: number) => ({
    onPointerDown: (event: React.PointerEvent) => {
      if ((event.target as HTMLElement).closest("button")) return;
      window.clearTimeout(hold.current);
      hold.current = window.setTimeout(() => setPicker(id), 450);
    },
    onPointerUp: () => window.clearTimeout(hold.current),
    onPointerLeave: () => window.clearTimeout(hold.current),
    onPointerCancel: () => window.clearTimeout(hold.current),
    onContextMenu: (event: React.MouseEvent) => { if (picker === id) event.preventDefault(); },
  });
  const now = Date.now();
  if (!allowed) {
    return (
      <section className="orbit-block" aria-labelledby="chat-title">
        <h2 className="orbit-h orbit-h-row" id="chat-title"><Lock size={18} aria-hidden /> {title}</h2>
        <p className="orbit-note" role="alert">Ця кімната лише для учасників запуску: автора і тих, хто його підтвердив.</p>
      </section>
    );
  }
  return (
    <section className="orbit-block" aria-labelledby="chat-title">
      <h2 className="orbit-h orbit-h-row" id="chat-title">
        <MessageCircle size={18} aria-hidden /> <span style={{ flex: 1 }}>{title}</span>
        <span className="orbit-live-dot" role="status" aria-label={`Онлайн: ${online}`}><i aria-hidden /> {online} онлайн</span>
      </h2>
      <p className="orbit-note">{room === "world" ? "Бачать усі, хто увійшов у світ." : "Бачать лише автор запуску і його підтверджувачі."} Не пиши ключ входу, коди й паролі. Скарга від трьох людей ховає повідомлення. Реакції — лише емоція, ✦ вони не дають.</p>
      <div className="orbit-chat-wrap">
        <div ref={box} className="orbit-chat" onScroll={onScroll} role="log" aria-live="polite" aria-label="Повідомлення чату">
          {!loaded ? <p className="orbit-note">Завантажую…</p> : null}
          {loaded && lines.length === 0 ? (
            <div className="orbit-chat-empty">
              <ReactionIcon id="galaxy" size={40} />
              <p><b>Поки тихо.</b> Привітайся першим — {room === "world" ? "і поклич друга, щоб було кому відповісти." : "твій екіпаж побачить."}</p>
            </div>
          ) : null}
          {lines.map((line, i) => {
            const rs = reacts[line.id] ?? {};
            const kinds = REACTIONS.filter((r) => rs[r.id]);
            const mine = Object.fromEntries(kinds.map((r) => [r.id, rs[r.id][1]]));
            const sameAuthor = i > 0 && lines[i - 1].name === line.name && lines[i - 1].mine === line.mine && line.at - lines[i - 1].at < 5 * 60_000;
            return (
              <div key={line.id} className={`orbit-msg${line.mine ? " orbit-msg-mine" : ""}${sameAuthor ? " is-cont" : ""}`} data-msg={line.id} {...press(line.id)}>
                <div className="orbit-msg-b">
                  {!sameAuthor ? (
                    <p className="orbit-msg-h"><b>{line.mine ? "Я" : line.name}</b> <time dateTime={new Date(line.at).toISOString()} title={clock(line.at)}>{ago(line.at, now)}</time></p>
                  ) : null}
                  <p className="orbit-msg-t">{line.text}</p>
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
                        <li key={r.id}><ReactionIcon id={r.id} size={16} /> <b>{r.name}</b>: {who.list[r.id].join(", ")}</li>
                      ))}
                      {!REACTIONS.some((r) => who.list[r.id]?.length) ? <li>Поки ніхто.</li> : null}
                    </ul>
                  ) : null}
                  {picker === line.id ? <ReactPicker msgId={line.id} mine={mine} onPick={(kind) => void react(line.id, kind)} onClose={() => setPicker(null)} /> : null}
                </div>
                <div className="orbit-msg-a">
                  <button type="button" className="mo-icon" aria-label={`Реакція на повідомлення від ${line.mine ? "мене" : line.name}`} aria-expanded={picker === line.id}
                    aria-controls={picker === line.id ? `rx-pick-${line.id}` : undefined} onClick={() => setPicker(picker === line.id ? null : line.id)}>
                    <SmilePlus size={15} aria-hidden />
                  </button>
                  {!line.mine ? (
                    <button type="button" className="mo-icon" aria-label={`Поскаржитись на повідомлення від ${line.name}`} disabled={reported.includes(line.id)} onClick={() => void report(line.id)}>
                      <Flag size={14} aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {fresh > 0 ? (
          <button type="button" className="orbit-chat-pill" onClick={toEnd}><ArrowDown size={14} aria-hidden /> {fresh} {fresh === 1 ? "нове" : "нових"}</button>
        ) : null}
      </div>
      <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <label className="sr-only" htmlFor="chat-input">Повідомлення</label>
        <input id="chat-input" className="orbit-field" value={text} maxLength={CHAT_MAX} placeholder="Коротко і по-людськи" onChange={(event) => setText(event.target.value)} />
        <div className="orbit-chat-foot">
          <span className="orbit-note" aria-live="off">{text.length > CHAT_MAX - 40 ? `${CHAT_MAX - text.length} знаків лишилось` : ""}</span>
          <button type="submit" className="orbit-go" disabled={busy || text.trim().length < 1}>Надіслати</button>
        </div>
        {error ? <p className="orbit-note" role="alert">{error}</p> : null}
      </form>
    </section>
  );
}

export function RoomList({ current, onPick, unread }: { current: string; onPick: (room: RoomRow) => void; unread?: Record<string, number> }) {
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const out = await chatRooms({ data: sessionCreds() });
        if (alive) setRooms(out.rooms);
      } catch { /* мережа */ }
    };
    void load();
    // Непрочитане приходить разом з довгим опитуванням відкритої кімнати; тут — лише рідко, щоб підхопити нові кімнати.
    const id = window.setInterval(() => void load(), 60_000);
    return () => { alive = false; window.clearInterval(id); };
  }, [current]);
  useEffect(() => {
    if (!unread) return;
    setRooms((rows) => rows.map((r) => (r.id === current ? { ...r, unread: 0 } : { ...r, unread: unread[r.id] ?? 0 })));
  }, [unread, current]);
  if (!rooms.length) return null;
  return (
    <nav className="orbit-block" aria-labelledby="rooms-title">
      <h2 className="orbit-h orbit-h-row" id="rooms-title"><Users size={18} aria-hidden /> <span>Кімнати</span></h2>
      <ul className="orbit-rooms">
        {rooms.map((room) => (
          <li key={room.id}>
            <button type="button" className={room.id === current ? "orbit-room is-on" : "orbit-room"} aria-current={room.id === current ? "true" : undefined}
              aria-label={`${room.title}, ${room.members} учасн., ${room.unread && room.id !== current ? `непрочитаних ${room.unread}` : "усе прочитано"}`}
              onClick={() => { setRooms((rows) => rows.map((r) => (r.id === room.id ? { ...r, unread: 0 } : r))); onPick(room); }}>
              <span className="orbit-room-k" aria-hidden><ReactionIcon id={room.kind === "world" ? "planet" : room.kind === "crew" ? "spark" : "launch"} size={22} /></span>
              <span className="orbit-room-t">{room.title}<small>{room.kind === "world" ? `${room.members} у світі` : `${room.members} учасн.`}</small></span>
              {room.unread && room.id !== current ? <span className="orbit-room-n" aria-hidden>{room.unread >= 99 ? "99+" : room.unread}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {rooms.length === 1 ? <p className="orbit-note">Свою кімнату отримує кожен запуск: ти, автор і ті, хто підтвердив. Почни запуск або підтвердь чийсь — і вона з'явиться тут.</p> : null}
    </nav>
  );
}

export function RoleGate() {
  const [role, setRole] = useState<"confirmer" | "admin">("confirmer");
  const [why, setWhy] = useState("");
  const [said, setSaid] = useState("");
  async function ask() {
    try {
      const out = await roleAsk({ data: { ...sessionCreds(), role, why } });
      setSaid(out.ok ? "Заявку прийнято. Власник перегляне її вручну." : (out.error ?? "Не вдалося."));
    } catch {
      setSaid("Сервер не відповідає. Спробуй ще раз.");
    }
  }
  return (
    <section className="orbit-block" aria-labelledby="role-title">
      <h2 className="orbit-h" id="role-title"><ShieldCheck size={18} aria-hidden /> Заявка на роль</h2>
      <p className="orbit-note">Заявка нічого не вмикає автоматично. Довірену роль підтверджувача чи адміна видає лише власник світу після перевірки.</p>
      <div className="grid gap-2" role="radiogroup" aria-label="Роль">
        <button type="button" role="radio" aria-checked={role === "confirmer"} className={role === "confirmer" ? "orbit-go" : "orbit-quiet"} onClick={() => setRole("confirmer")}>Довірений підтверджувач</button>
        <button type="button" role="radio" aria-checked={role === "admin"} className={role === "admin" ? "orbit-go" : "orbit-quiet"} onClick={() => setRole("admin")}>Модератор / адмін</button>
      </div>
      <div className="grid gap-2" style={{ marginTop: 8 }}>
        <label className="sr-only" htmlFor="role-why">Чому тобі можна довіряти</label>
        <textarea id="role-why" className="orbit-field" rows={3} value={why} maxLength={WHY_MAX} placeholder="Чому тобі можна довіряти" onChange={(event) => setWhy(event.target.value)} />
        <button type="button" className="orbit-go" disabled={why.trim().length < WHY_MIN} onClick={() => void ask()}>Подати заявку</button>
        {said ? <p className="orbit-ok" role="status">{said}</p> : null}
      </div>
    </section>
  );
}

export function QuestionList() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="orbit-block" aria-labelledby="faq-title">
      <h2 className="orbit-h" id="faq-title"><CircleHelp size={18} aria-hidden /> Часті питання</h2>
      <ul className="orbit-stack">
        {QUESTIONS.map((item, i) => (
          <li key={item.q}>
            <button type="button" className="orbit-quiet" aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? null : i)}>{item.q}</button>
            {open === i ? <p className="orbit-note" id={`faq-${i}`}>{item.a}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Тихий фон, синтезований у браузері (0 КБ файлів, без ліцензій). Ніколи не вмикається сам. */
let audio: AudioContext | null = null;
let master: GainNode | null = null;

function stopMusic() {
  const ctx = audio;
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  window.setTimeout(() => void ctx.close(), 1200);
  audio = null;
  master = null;
}

export function MusicToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === "hidden" && audio) {
        stopMusic();
        setOn(false);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      stopMusic();
    };
  }, []);
  function toggle() {
    if (on) {
      stopMusic();
      setOn(false);
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audio = ctx;
    const out = ctx.createGain();
    master = out;
    out.gain.value = 0;
    out.connect(ctx.destination);
    out.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
    // Повільне «дихання» гучності, щоб тон не був рівним гудінням.
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 0.07;
    depth.gain.value = 0.006;
    lfo.connect(depth);
    lfo.start();
    [196, 246.94, 293.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = (i - 1) * 4;
      gain.gain.value = 0.012;
      depth.connect(gain.gain);
      osc.connect(gain).connect(out);
      osc.start();
    });
    setOn(true);
  }
  return (
    <button type="button" className="mo-icon" aria-pressed={on} aria-label={on ? "Вимкнути фонову музику" : "Увімкнути фонову музику"} title={on ? "Вимкнути музику" : "Тихий фон"} onClick={toggle}>
      <Music size={18} strokeWidth={1.5} style={{ opacity: on ? 1 : 0.55 }} />
    </button>
  );
}

/**
 * Сигнал «схоже на автоклікер»: лише позначка на сервері для перевірки людиною.
 * Нічого не забирає й не блокує: клієнтський сигнал легко підробити й легко хибно спрацювати.
 */
export function watchBot(): () => void {
  const stamps: number[] = [];
  let sent = 0;
  const onClick = () => {
    stamps.push(performance.now());
    if (stamps.length > 40) stamps.splice(0, stamps.length - 40);
    if (looksScripted(stamps) && Date.now() - sent > 10 * 60_000) {
      sent = Date.now();
      stamps.length = 0;
      void botSignal({ data: sessionCreds() }).catch(() => null);
    }
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}

export function LiveHub({ world, onBack, onClose }: { world: World; user: Account; onBack: () => void; onClose?: () => void }) {
  const n = world.accounts.length;
  const [room, setRoom] = useState({ id: "world", title: "Чат світу" });
  const [unread, setUnread] = useState<Record<string, number> | undefined>(undefined);
  return (
    <Page title="Живе" kicker="Світ" onBack={onBack} onClose={onClose}>
      <div className="orbit-stack">
        <p className="orbit-note">У світі зараз {n} {n === 1 ? "людина" : "людей"}.</p>
        <RoomList current={room.id} unread={unread} onPick={(next) => setRoom({ id: next.id, title: next.kind === "world" ? "Чат світу" : next.title })} />
        <ChatRoom key={room.id} room={room.id} title={room.title} onUnread={setUnread} />
        <RoleGate />
        <QuestionList />
      </div>
    </Page>
  );
}
