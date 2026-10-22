import { confirmsWord } from "@/lib/orbit/copy";
/** 17: «Перші кроки» на головній і пояснення «Чому 8?». Лише показ — рахуємо зі стану світу, формули не чіпаємо. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, CircleHelp, X } from "lucide-react";
import { CONFIRM_NEED, ORBIT_CAP, type Account, type World } from "@/lib/orbit/engine";
import type { HomeTab } from "@/components/orbit/home";

const SEEN = "orbit-why8";
const HIDE = "orbit-steps-hidden";
const fmt = new Intl.NumberFormat("uk-UA");

function read(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function mark(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // приватний режим: просто не запам’ятаємо
  }
}

export function stepsOf(world: World, user: Account, why: boolean) {
  const own = world.creations.filter((item) => item.userId === user.id);
  return [
    { id: "join", title: "Ім’я у світі", hint: "Готово — ти на орбіті", done: true, tab: null as HomeTab | null },
    { id: "why", title: "Дізнайся, як народжується орбіта", hint: "Хвилина читання", done: why, tab: null },
    { id: "confirm", title: "Підтвердь когось", hint: "Код з 6 цифр від друга", done: world.creations.some((item) => item.confirms.some((row) => row.witnessId === user.id)), tab: null },
    { id: "start", title: "Почни свій запуск", hint: "Заявка у вкладці «Заявка»", done: own.length > 0, tab: "mine" as HomeTab },
    { id: "crew", title: `Збери ${CONFIRM_NEED} ${confirmsWord(CONFIRM_NEED)}`, hint: "Поділися кодом або посиланням", done: own.some((item) => item.status !== "collecting" || item.confirms.length >= CONFIRM_NEED), tab: "mine" as HomeTab },
    { id: "orbit", title: "Твоя перша орбіта", hint: "Після 24 годин заряду", done: world.orbits.some((orbit) => orbit.ownerId === user.id), tab: "mine" as HomeTab },
  ];
}

export function Checklist({ world, user, onTab }: { world: World; user: Account; onTab: (tab: HomeTab) => void }) {
  const [why, setWhy] = useState(false);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    setWhy(read(SEEN));
    setHidden(read(HIDE));
  }, []);
  const steps = stepsOf(world, user, why);
  const done = steps.filter((step) => step.done).length;
  if (hidden || done === steps.length) return open ? <WhyEight onClose={() => setOpen(false)} /> : null;
  const next = steps.find((step) => !step.done);
  return (
    <section className="orbit-block cl" aria-labelledby="cl-title">
      <div className="cl-head">
        <div>
          <p className="orbit-kicker">Перші кроки</p>
          <h2 id="cl-title">{done} з {steps.length} готово</h2>
        </div>
        <button type="button" className="mo-icon" aria-label="Сховати перші кроки" onClick={() => { mark(HIDE); setHidden(true); }}>
          <X size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>
      <div className="cl-bar" role="progressbar" aria-label="Перші кроки" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
        <span style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="cl-list">
        {steps.map((step) => {
          const act = step.done ? undefined : step.id === "why" ? () => setOpen(true) : step.tab ? () => onTab(step.tab as HomeTab) : undefined;
          const body = (
            <>
              <span className="cl-tick" data-done={step.done ? "1" : "0"} aria-hidden>{step.done ? <Check size={13} strokeWidth={3} /> : null}</span>
              <span className="cl-text"><b>{step.title}</b><small>{step.done ? "Готово" : step.hint}</small></span>
              {act ? <ChevronRight size={16} strokeWidth={1.8} aria-hidden /> : null}
            </>
          );
          return (
            <li key={step.id} data-next={next?.id === step.id ? "1" : "0"} data-done={step.done ? "1" : "0"}>
              {act ? <button type="button" className="cl-row" onClick={act} aria-label={`${step.title}: ${step.hint}`}>{body}</button> : <div className="cl-row" aria-label={`${step.title}: ${step.done ? "готово" : step.hint}`}>{body}</div>}
            </li>
          );
        })}
      </ol>
      {open ? <WhyEight onClose={() => { mark(SEEN); setWhy(true); setOpen(false); }} /> : null}
    </section>
  );
}

/** Кнопка «Чому 8?» для будь-якого екрана. */
export function WhyEightButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="orbit-chip cl-why" onClick={() => setOpen(true)}><CircleHelp size={14} strokeWidth={2} aria-hidden /> Чому 8?</button>
      {open ? <WhyEight onClose={() => { mark(SEEN); setOpen(false); }} /> : null}
    </>
  );
}

export function WhyEight({ onClose }: { onClose: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="ky-scrim" onClick={onClose}>
      <div className="ky-sheet cl-sheet" role="dialog" aria-modal="true" aria-labelledby="cl-why-title" onClick={(event) => event.stopPropagation()}>
        <span className="ky-handle" aria-hidden />
        <div className="cl-eight" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ transform: `rotate(${i * 45}deg) translateY(-46px)` }} />)}
          <b>8</b>
        </div>
        <h2 id="cl-why-title" ref={title} tabIndex={-1} className="ky-title">Як народжується орбіта</h2>
        <ul className="cl-why-list">
          <li><b>Одна жива людина ручається за тебе.</b> Її підтвердження — раз за життя: вона не може ручатися за тебе вдруге, тож кожна нова орбіта — це нова людина поруч.</li>
          <li><b>Вісімка — знак нескінченності.</b> Покладена набік, вона стає ∞ — орбітою, що не закінчується. Тому орбіт рівно вісім мільйонів.</li>
          <li><b>Просто почати.</b> Сім’я, друзі, сусіди — хоча б одна людина є в кожного. Не тисяча лайків, а свої люди.</li>
          <li><b>Усього {fmt.format(ORBIT_CAP)} орбіт.</b> Вісім мільйонів — і більше не буде. Кожна має свій номер.</li>
        </ul>
        <p className="ky-body">Хто тебе підтвердив, стає частиною твого «Екіпажу» — його ім’я назавжди залишиться в історії орбіти.</p>
        <button type="button" className="orbit-go k-go" onClick={onClose}>Зрозуміло</button>
      </div>
    </div>,
    document.body,
  );
}
