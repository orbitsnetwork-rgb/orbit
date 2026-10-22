import { Music, CircleHelp } from "lucide-react";
import { useEffect, useState } from "react";
import { Page } from "@/components/orbit/more";
import { botSignal } from "@/lib/orbit/live";
import { ChatRoom, RoomList } from "@/components/orbit/chat";
export { ChatRoom, RoomList };
import { looksScripted, shortName } from "@/lib/orbit/live-rules";
import { sessionCreds } from "@/lib/orbit/store";
import type { Account, World } from "@/lib/orbit/engine";

/** Відповіді чесні щодо того, як рушій працює зараз (не обіцянки). */
const QUESTIONS = [
  { q: "Хто може підтвердити запуск?", a: "Будь-яка інша людина в Орбітах зі свого акаунта. Свій запуск підтвердити не можна." },
  { q: "Скільки треба підтверджень?", a: "Одне. Інша людина підтверджує твій запуск — і йде 24-годинний заряд. Одна людина може підтвердити тебе лише раз за життя, тож для нових запусків потрібні нові люди — запроси своїх." },
  { q: "Чому моє підтвердження не прийняли?", a: "Захист від фейкових акаунтів: від 10 людей у світі взаємно («ти мені — я тобі») не можна; коли у світі 10+ власників орбіт, підтверджує лише той, у кого вже є орбіта; новий акаунт підтверджує через годину. Причину завжди видно в повідомленні." },
  { q: "Що таке іскра ✦?", a: "Внутрішня одиниця світу Орбіт. Це не гроші, не цінний папір і не обіцянка доходу. Вивести її зараз не можна." },
  { q: "Як стати модератором?", a: "«Ще» → «Стати модератором»: коротка заявка, згода з правилами. Власник світу переглядає її вручну. Модератор може видаляти повідомлення й ставити паузу в чаті — кожна дія записується в журнал." },
  { q: "Що буде, якщо акаунт схожий на бота?", a: "Автоматично нічого не забирається. Сервер лише ставить позначку, а людина її перевіряє. Якщо помилка — напиши нам." },
  { q: "Що буде за грубощі в чаті?", a: "Грубі слова автоматично ховаються зірочками. Якщо скарги трьох людей сховали два твої повідомлення за 30 днів — пауза в чаті на 1 годину, якщо три — на 24 години. ✦ і орбіти це не зачіпає. Власник переглядає сховане вручну; якщо це помилка — «Ще» → «Написати нам»." },
  { q: "Хто бачить мої повідомлення?", a: "У чаті світу — усі, хто увійшов. У кімнаті запуску чи екіпажу — лише автор і ті, хто його підтвердив (це перевіряє сервер). Показується лише «Ім’я П.». Не пиши паролі, ключ входу й коди." },
];

export function QuestionList() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="orbit-block" aria-labelledby="faq-title">
      <h2 className="orbit-h orbit-h-row" id="faq-title"><CircleHelp size={18} aria-hidden /> Часті питання</h2>
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

/** Кімната, яку треба відкрити при наступному вході в «Живе» (дотик до сповіщення в дзвіночку). */
let pendingRoom: string | null = null;
export function openRoomNext(room: string) {
  pendingRoom = room;
}

export function LiveHub({ world, user, onBack, onClose }: { world: World; user: Account; onBack: () => void; onClose?: () => void }) {
  const n = world.accounts.length;
  const [room, setRoom] = useState(() => {
    const id = pendingRoom;
    pendingRoom = null;
    return id && id !== "world" ? { id, title: "Кімната екіпажу", unread: 0 } : { id: "world", title: "Чат світу", unread: 0 };
  });
  const [unread, setUnread] = useState<Record<string, number> | undefined>(undefined);
  return (
    <Page title="Живе" kicker="Світ" onBack={onBack} onClose={onClose}>
      <div className="orbit-stack">
        <p className="orbit-note">У світі зараз {n} {n === 1 ? "людина" : "людей"}.</p>
        <div className="cv-split">
          <RoomList current={room.id} unread={unread} onPick={(next) => setRoom({ id: next.id, title: next.kind === "world" ? "Чат світу" : next.title, unread: next.unread })} />
          <ChatRoom key={room.id} room={room.id} title={room.title} unreadAtOpen={room.unread} myName={shortName(user.name)} onUnread={setUnread} />
        </div>
        <QuestionList />
      </div>
    </Page>
  );
}
