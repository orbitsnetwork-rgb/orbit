import { createPortal } from "react-dom";
import { Check, Copy, Download, KeyRound, LogOut, Share2, TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { buzz, canShare, copyText, saveTextFile, shareSheet } from "@/lib/orbit/feel";
import { deviceKeys, useOrbits } from "@/lib/orbit/store";

/** Позначка «ключ збережено» — та сама, що й у «Безпеці». Лише на цьому пристрої. */
export const SAVED_KEY = (id: string) => `orbits-keysaved-${id}`;

export function keySaved(id: string) {
  try {
    return localStorage.getItem(SAVED_KEY(id)) === "1";
  } catch {
    return false;
  }
}

export function markKeySaved(id: string, on = true) {
  try {
    localStorage.setItem(SAVED_KEY(id), on ? "1" : "0");
  } catch {
    /* приватний режим */
  }
}

function keyFile(name: string, key: string) {
  const date = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  return [
    "Орбіти — ключ входу",
    "",
    `Акаунт: ${name}`,
    `Ключ: ${key}`,
    `Збережено: ${date}`,
    "",
    "Ключ — єдиний спосіб увійти в акаунт з іншого пристрою або після очищення браузера.",
    "Тримай його в менеджері паролів або в іншому надійному місці.",
    "Нікому його не надсилай. Орбіти ніколи не просять ключ у листах чи повідомленнях.",
    "",
  ].join("\n");
}

function spelled(key: string) {
  return key
    .split("")
    .map((ch) => (ch === "-" ? "," : ch))
    .join(" ");
}

type Said = { text: string; tone: "ok" | "warn" } | null;

/** Ключ у пунктирній рамці + Скопіювати / Файл / Поділитися. */
export function KeyBox({ name, secret, compact = false }: { name: string; secret: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [said, setSaid] = useState<Said>(null);
  const [share, setShare] = useState(false);
  const code = useRef<HTMLElement>(null);
  useEffect(() => setShare(canShare({ title: "Орбіти", text: "ключ" })), []);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);

  function selectKey() {
    const node = code.current;
    if (!node) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  return (
    <div className="ky-box" data-compact={compact ? "1" : "0"}>
      <code ref={code} className="ky-code" aria-label={`Ключ: ${spelled(secret)}`} onClick={selectKey}>
        {secret}
      </code>
      <div className="ky-actions">
        <button
          type="button"
          className="ky-act"
          data-done={copied ? "1" : "0"}
          onClick={async () => {
            const ok = await copyText(secret);
            if (ok) {
              setCopied(true);
              buzz(10);
              setSaid({ text: "Ключ скопійовано. Встав його в менеджер паролів або нотатки.", tone: "ok" });
            } else {
              selectKey();
              setSaid({ text: "Не вдалося скопіювати. Ключ виділено — скопіюй його вручну.", tone: "warn" });
            }
          }}
        >
          <span className="ky-act-ico" aria-hidden>{copied ? <Check size={18} strokeWidth={2.2} /> : <Copy size={18} strokeWidth={1.75} />}</span>
          {copied ? "Скопійовано" : "Скопіювати"}
        </button>
        <button
          type="button"
          className="ky-act"
          onClick={() => {
            try {
              saveTextFile("orbity-kliuch-vkhodu.txt", keyFile(name, secret));
              buzz(10);
              setSaid({ text: "Файл orbity-kliuch-vkhodu.txt збережено в завантаження.", tone: "ok" });
            } catch {
              setSaid({ text: "Не вдалося зберегти файл. Скопіюй ключ або запиши його.", tone: "warn" });
            }
          }}
        >
          <span className="ky-act-ico" aria-hidden><Download size={18} strokeWidth={1.75} /></span>
          Зберегти файл
        </button>
        {share ? (
          <button
            type="button"
            className="ky-act"
            onClick={async () => {
              const done = await shareSheet({ title: "Орбіти — ключ входу", text: keyFile(name, secret) });
              if (done) setSaid({ text: "Готово. Переконайся, що ключ потрапив лише до тебе.", tone: "ok" });
              else if (done === null) setSaid({ text: "Меню «Поділитися» недоступне. Скопіюй ключ або збережи файлом.", tone: "warn" });
            }}
          >
            <span className="ky-act-ico" aria-hidden><Share2 size={18} strokeWidth={1.75} /></span>
            Надіслати собі
          </button>
        ) : null}
      </div>
      <p className="ky-said" data-tone={said?.tone ?? "none"} role="status" aria-live="polite">
        {said?.text ?? (share ? "Надсилай ключ лише собі — у нотатки чи менеджер паролів." : "")}
      </p>
    </div>
  );
}

function Tick({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <label className="ky-tick" data-on={checked ? "1" : "0"}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="ky-tick-box" aria-hidden>
        <Check size={15} strokeWidth={3} />
      </span>
      <span>{label}</span>
    </label>
  );
}

function useLockScroll() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, []);
}

/** Повний екран одразу після реєстрації. Без галочки далі не пустить — ключ не повториться. */
export function KeyScreen({ userId, name, secret, onDone }: { userId: string; name: string; secret: string; onDone: () => void }) {
  const [ticked, setTicked] = useState(false);
  const head = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useLockScroll();
  useEffect(() => head.current?.focus({ preventScroll: true }), []);
  return (
    <div className="ky-screen" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="ky-inner">
        <div className="ky-glyph" aria-hidden>
          <KeyRound size={30} strokeWidth={1.6} />
        </div>
        <p className="ky-step">Акаунт створено · останній крок</p>
        <h1 className="ky-title" id={titleId} ref={head} tabIndex={-1}>
          Твій ключ входу
        </h1>
        <p className="ky-body">Це єдиний спосіб увійти в акаунт з іншого пристрою або після очищення браузера. Збережи його в менеджері паролів або запиши.</p>
        <KeyBox name={name} secret={secret} />
        <Tick
          checked={ticked}
          label="Ключ збережено в надійному місці"
          onChange={(on) => {
            setTicked(on);
            if (on) buzz(8);
          }}
        />
        <button
          type="button"
          className="ky-go"
          disabled={!ticked}
          aria-describedby={ticked ? undefined : `${titleId}-hint`}
          onClick={() => {
            markKeySaved(userId);
            buzz([12, 60, 18]);
            onDone();
          }}
        >
          Продовжити
        </button>
        {!ticked ? (
          <p className="ky-hint" id={`${titleId}-hint`}>
            Постав галочку, коли ключ буде в надійному місці.
          </p>
        ) : null}
        <p className="ky-warn">
          <TriangleAlert size={16} strokeWidth={1.9} aria-hidden />
          <span>Відновлення ключа поки не працює. Якщо загубиш ключ і вийдеш з акаунта, повернути доступ не вийде.</span>
        </p>
      </div>
    </div>
  );
}

/**
 * «Вийти» з перевіркою: якщо ключ не позначено збереженим, спершу лист із ключем.
 * Повертає функцію-запит і елемент листа, який треба відрендерити поруч.
 */
export function useLeave(userId: string, name: string) {
  const [open, setOpen] = useState(false);
  const ask = () => {
    if (keySaved(userId)) {
      buzz(8);
      useOrbits.getState().leave();
      return;
    }
    setOpen(true);
  };
  const sheet = open ? <LeaveSheet userId={userId} name={name} onClose={() => setOpen(false)} /> : null;
  return { ask, sheet };
}

function LeaveSheet({ userId, name, onClose }: { userId: string; name: string; onClose: () => void }) {
  const [secret] = useState(() => deviceKeys()[userId] ?? "");
  const [ticked, setTicked] = useState(false);
  const stay = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useLockScroll();
  useEffect(() => {
    stay.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const leave = () => {
    if (ticked) markKeySaved(userId);
    buzz(ticked ? 8 : [30, 40, 30]);
    onClose();
    useOrbits.getState().leave();
  };
  return (
    createPortal(<div className="ky-scrim" onClick={onClose}>
      <div className="ky-sheet" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={`${titleId}-body`} onClick={(event) => event.stopPropagation()}>
        <span className="ky-handle" aria-hidden />
        <div className="ky-glyph ky-glyph-warn" aria-hidden>
          <KeyRound size={24} strokeWidth={1.7} />
        </div>
        <h2 className="ky-title ky-title-s" id={titleId}>
          Ключ ще не збережено
        </h2>
        <p className="ky-body" id={`${titleId}-body`}>
          {secret
            ? "Після виходу увійти знову можна лише з ключем. Збережи його зараз — це займе кілька секунд."
            : "Ключа немає на цьому пристрої. Якщо ключ не записано деінде, після виходу повернутися в акаунт не вийде."}
        </p>
        {secret ? <KeyBox name={name} secret={secret} compact /> : null}
        {secret ? <Tick checked={ticked} label="Ключ збережено в надійному місці" onChange={setTicked} /> : null}
        <button type="button" className="ky-go" ref={stay} onClick={onClose}>
          Залишитися в акаунті
        </button>
        <button type="button" className="ky-out" data-safe={ticked ? "1" : "0"} onClick={leave}>
          <LogOut size={17} strokeWidth={1.7} aria-hidden />
          {ticked ? "Вийти" : "Вийти без збереженого ключа"}
        </button>
      </div>
    </div>, document.body)
  );
}
