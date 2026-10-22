import { Flag, Music, ShieldCheck, CircleHelp, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Page } from "@/components/orbit/more";
import { LockedList } from "@/components/orbit/locked";
import { botSignal, chatRead, chatReport, chatSend, roleAsk, type ChatLine } from "@/lib/orbit/live";
import { CHAT_MAX, WHY_MAX, WHY_MIN, looksScripted } from "@/lib/orbit/live-rules";
import { sessionCreds } from "@/lib/orbit/store";
import type { Account, World } from "@/lib/orbit/engine";

/** Відповіді чесні щодо того, як рушій працює зараз (не обіцянки). */
const QUESTIONS = [
  { q: "Хто може підтвердити запуск?", a: "Будь-яка інша людина в Орбітах зі свого акаунта. Свій запуск підтвердити не можна." },
  { q: "Скільки треба підтверджень?", a: "8 підтверджень від інших людей. Тому на самому старті, поки в світі менше 9 людей, запуск не набереться — запроси своїх." },
  { q: "Що таке іскра ✦?", a: "Внутрішня одиниця світу Орбіт. Це не гроші, не цінний папір і не обіцянка доходу. Вивести її зараз не можна." },
  { q: "Як стати підтверджувачем?", a: "Підтверджувати може кожен. Заявка — це прохання про довіру: власник світу перегляне її вручну." },
  { q: "Що буде, якщо акаунт схожий на бота?", a: "Автоматично нічого не забирається. Сервер лише ставить позначку, а людина її перевіряє. Якщо помилка — напиши нам." },
  { q: "Хто бачить мої повідомлення?", a: "Усі, хто увійшов у світ. Показується лише «Ім’я П.». Не пиши паролі, ключ входу й коди." },
];

function ago(at: number, now: number) {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 1) return "щойно";
  if (m < 60) return `${m} хв`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} год` : `${Math.round(h / 24)} дн`;
}

export function ChatRoom() {
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [reported, setReported] = useState<number[]>([]);
  const box = useRef<HTMLDivElement>(null);
  async function load() {
    try {
      const next = await chatRead({ data: sessionCreds() });
      setLines(next.lines);
    } catch {
      /* мережа: спробуємо в наступному такті */
    }
    setLoaded(true);
  }
  useEffect(() => {
    void load();
    // Опитування лише поки вкладка видима.
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [lines.length]);
  async function send() {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError("");
    try {
      const out = await chatSend({ data: { ...sessionCreds(), text: clean } });
      if (out.ok) setText("");
      else setError(out.error ?? "Не надіслано.");
    } catch {
      setError("Сервер не відповідає. Спробуй ще раз.");
    }
    setBusy(false);
    await load();
  }
  async function report(id: number) {
    setReported((rows) => [...rows, id]);
    await chatReport({ data: { ...sessionCreds(), id } }).catch(() => null);
  }
  const now = Date.now();
  return (
    <section className="orbit-block" aria-labelledby="chat-title">
      <h2 className="orbit-h" id="chat-title"><MessageCircle size={18} aria-hidden /> Чат світу</h2>
      <p className="orbit-note">Будь чемним. Не пиши ключ входу, коди й паролі. Скарга від трьох людей ховає повідомлення до перевірки.</p>
      <div ref={box} className="orbit-stack" style={{ maxHeight: 320, overflow: "auto" }} role="log" aria-live="polite" aria-label="Повідомлення чату">
        {!loaded ? <p className="orbit-note">Завантажую…</p> : null}
        {loaded && lines.length === 0 ? <p className="orbit-note">Поки тихо. Привітайся першим — і поклич друга, щоб було кому відповісти.</p> : null}
        {lines.map((line) => (
          <div key={line.id} className="orbit-note" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
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
  return (
    <Page title="Живе" kicker="Світ" onBack={onBack} onClose={onClose}>
      <div className="orbit-stack">
        <p className="orbit-note">У світі зараз {n} {n === 1 ? "людина" : "людей"}.</p>
        <ChatRoom />
        <LockedList ids={["chatRooms", "chatReact"]} title="Скоро в живому" />
        <RoleGate />
        <QuestionList />
      </div>
    </Page>
  );
}
