import { Flag, Music, ShieldCheck, CircleHelp, MessageCircle, Lock, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Page } from "@/components/orbit/more";
import { LockedList } from "@/components/orbit/locked";
import { botSignal, chatRead, chatReport, chatRooms, chatSend, roleAsk, type ChatLine } from "@/lib/orbit/live";
import { CHAT_MAX, WHY_MAX, WHY_MIN, looksScripted, type RoomInfo } from "@/lib/orbit/live-rules";
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

/**
 * Живе оновлення: довге опитування (сервер тримає запит до 8 с і відповідає, щойно є нове).
 * Працює лише поки вкладка видима; при помилках — пауза зі зростанням до 15 с.
 */
export function ChatRoom({ room = "world", title = "Чат світу", onOnline }: { room?: string; title?: string; onOnline?: (n: number) => void }) {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [allowed, setAllowed] = useState(true);
  const [online, setOnline] = useState(0);
  const [reported, setReported] = useState<number[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  function take(next: { lines: ChatLine[]; hidden: number[]; online: number; allowed: boolean }, full: boolean) {
    setAllowed(next.allowed);
    setOnline(next.online);
    onOnline?.(next.online);
    setLines((rows) => {
      const base = full ? next.lines : [...rows, ...next.lines.filter((l) => !rows.some((r) => r.id === l.id))];
      const out = base.filter((l) => !next.hidden.includes(l.id)).slice(-80);
      last.current = out.length ? out[out.length - 1].id : last.current;
      return out;
    });
  }
  useEffect(() => {
    let alive = true;
    let pause = 0;
    let timer = 0;
    last.current = 0;
    setLines([]);
    setLoaded(false);
    let busyLoop = false;
    async function loop() {
      if (!alive || busyLoop) return;
      if (document.visibilityState !== "visible") return; // продовжимо на visibilitychange
      busyLoop = true;
      try {
        const full = last.current === 0;
        const next = await chatRead({ data: { ...sessionCreds(), room, after: last.current, wait: !full } });
        if (!alive) return;
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
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [lines.length]);
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
      const next = await chatRead({ data: { ...sessionCreds(), room, after: last.current } });
      take(next, false);
    } catch { /* наступний цикл підхопить */ }
  }
  async function report(id: number) {
    setReported((rows) => [...rows, id]);
    await chatReport({ data: { ...sessionCreds(), id } }).catch(() => null);
  }
  const now = Date.now();
  if (!allowed) {
    return (
      <section className="orbit-block" aria-labelledby="chat-title">
        <h2 className="orbit-h" id="chat-title"><Lock size={18} aria-hidden /> {title}</h2>
        <p className="orbit-note" role="alert">Ця кімната лише для учасників запуску: автора і тих, хто його підтвердив.</p>
      </section>
    );
  }
  return (
    <section className="orbit-block" aria-labelledby="chat-title">
      <h2 className="orbit-h" id="chat-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MessageCircle size={18} aria-hidden /> <span style={{ flex: 1 }}>{title}</span>
        <span className="orbit-live-dot" role="status" aria-label={`Онлайн: ${online}`}><i aria-hidden /> {online} онлайн</span>
      </h2>
      <p className="orbit-note">{room === "world" ? "Бачать усі, хто увійшов у світ." : "Бачать лише автор запуску і його підтверджувачі."} Не пиши ключ входу, коди й паролі. Скарга від трьох людей ховає повідомлення.</p>
      <div ref={box} className="orbit-stack" style={{ maxHeight: 340, overflow: "auto" }} role="log" aria-live="polite" aria-label="Повідомлення чату">
        {!loaded ? <p className="orbit-note">Завантажую…</p> : null}
        {loaded && lines.length === 0 ? <p className="orbit-note">Поки тихо. Привітайся першим — {room === "world" ? "і поклич друга, щоб було кому відповісти." : "твій екіпаж побачить."}</p> : null}
        {lines.map((line) => (
          <div key={line.id} className={line.mine ? "orbit-msg orbit-msg-mine" : "orbit-msg"}>
            <p style={{ flex: 1, margin: 0, overflowWrap: "anywhere" }}>
              <b>{line.mine ? "Я" : line.name}</b> <span style={{ opacity: 0.6, fontSize: 12 }}>{ago(line.at, now)}</span>
              <br />
              {line.text}
            </p>
            {!line.mine ? (
              <button type="button" className="mo-icon" aria-label={`Поскаржитись на повідомлення від ${line.name}`} disabled={reported.includes(line.id)} onClick={() => void report(line.id)}>
                <Flag size={14} aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <label className="sr-only" htmlFor="chat-input">Повідомлення</label>
        <input id="chat-input" className="orbit-field" value={text} maxLength={CHAT_MAX} placeholder="Коротко і по-людськи" onChange={(event) => setText(event.target.value)} />
        <button type="submit" className="orbit-go" disabled={busy || text.trim().length < 1}>Надіслати</button>
        {error ? <p className="orbit-note" role="alert">{error}</p> : null}
      </form>
    </section>
  );
}

export function RoomList({ current, onPick }: { current: string; onPick: (room: RoomRow) => void }) {
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
    const id = window.setInterval(() => void load(), 20_000);
    return () => { alive = false; window.clearInterval(id); };
  }, [current]);
  if (!rooms.length) return null;
  return (
    <nav className="orbit-block" aria-labelledby="rooms-title">
      <h2 className="orbit-h" id="rooms-title"><Users size={18} aria-hidden /> Кімнати</h2>
      <ul className="orbit-rooms">
        {rooms.map((room) => (
          <li key={room.id}>
            <button type="button" className={room.id === current ? "orbit-room is-on" : "orbit-room"} aria-current={room.id === current ? "true" : undefined}
              aria-label={`${room.title}, ${room.members} учасн., ${room.unread ? `непрочитаних ${room.unread}` : "усе прочитано"}`}
              onClick={() => { setRooms((rows) => rows.map((r) => (r.id === room.id ? { ...r, unread: 0 } : r))); onPick(room); }}>
              <span className="orbit-room-k">{room.kind === "world" ? "🌍" : room.kind === "crew" ? "✦" : "🚀"}</span>
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
  return (
    <Page title="Живе" kicker="Світ" onBack={onBack} onClose={onClose}>
      <div className="orbit-stack">
        <p className="orbit-note">У світі зараз {n} {n === 1 ? "людина" : "людей"}.</p>
        <RoomList current={room.id} onPick={(next) => setRoom({ id: next.id, title: next.kind === "world" ? "Чат світу" : next.title })} />
        <ChatRoom key={room.id} room={room.id} title={room.title} />
        <LockedList ids={["chatReact"]} title="Скоро в живому" />
        <RoleGate />
        <QuestionList />
      </div>
    </Page>
  );
}
