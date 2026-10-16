import { Check, ChevronRight, GraduationCap } from "lucide-react";
import { useEffect, useState } from "react";
import { Page } from "@/components/orbit/more";
import { LESSONS, type Lesson } from "@/lib/orbit/learn";

const KEY = "orbits-learn";

function readDone(): string[] {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(rows) ? rows.filter((row): row is string => typeof row === "string") : [];
  } catch {
    return [];
  }
}

function saveDone(rows: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* приватний режим */
  }
}

export function Learn({ onBack, onClose }: { onBack: () => void; onClose?: () => void }) {
  const [done, setDone] = useState<string[]>([]);
  const [open, setOpen] = useState<Lesson | null>(null);
  useEffect(() => setDone(readDone()), []);
  const finish = (id: string) => {
    const next = done.includes(id) ? done : [...done, id];
    setDone(next);
    saveDone(next);
  };
  if (open) {
    const index = LESSONS.findIndex((row) => row.id === open.id);
    const after = LESSONS[index + 1];
    return (
      <LessonView
        key={open.id}
        lesson={open}
        number={index + 1}
        onBack={() => setOpen(null)}
        onClose={onClose ?? onBack}
        onDone={() => finish(open.id)}
        onNext={after ? () => setOpen(after) : undefined}
      />
    );
  }
  const count = LESSONS.filter((row) => done.includes(row.id)).length;
  return (
    <Page title="Навчання" kicker={`${LESSONS.length} коротких уроків`} onBack={onBack} onClose={onClose}>
      <section className="ln-hero" aria-label="Прогрес">
        <GraduationCap size={26} strokeWidth={1.4} aria-hidden />
        <div>
          <b>{count === LESSONS.length ? "Усе пройдено" : `Пройдено ${count} з ${LESSONS.length}`}</b>
          <div className="ex-bar" role="progressbar" aria-valuemin={0} aria-valuemax={LESSONS.length} aria-valuenow={count} aria-label="Уроки">
            <i style={{ width: `${(count / LESSONS.length) * 100}%` }} />
          </div>
        </div>
      </section>
      <ol className="mo-card ln-list">
        {LESSONS.map((row, index) => {
          const ok = done.includes(row.id);
          return (
            <li key={row.id}>
              <button type="button" className="ln-row" onClick={() => setOpen(row)} aria-label={`Урок ${index + 1}: ${row.title}${ok ? ", пройдено" : ""}`}>
                <span className="ln-no" data-ok={ok ? "1" : "0"} aria-hidden>{ok ? <Check size={15} strokeWidth={2.4} /> : index + 1}</span>
                <span className="mo-row-text">
                  <b>{row.title}</b>
                  <small>{row.sub} · 1 хв</small>
                </span>
                <ChevronRight size={16} strokeWidth={1.5} aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
      <p className="orbit-note as-small">Прогрес зберігається лише на цьому телефоні. Нагород за уроки немає.</p>
    </Page>
  );
}

function LessonView({ lesson, number, onBack, onClose, onDone, onNext }: { lesson: Lesson; number: number; onBack: () => void; onClose: () => void; onDone: () => void; onNext?: () => void }) {
  const [step, setStep] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const total = lesson.steps.length + 1;
  const quiz = step >= lesson.steps.length;
  const right = pick === lesson.quiz.right;
  return (
    <Page title={lesson.title} kicker={`Урок ${number} · крок ${Math.min(step + 1, total)} з ${total}`} onBack={onBack} onClose={onClose}>
      <div className="ln-dots" aria-hidden>
        {Array.from({ length: total }, (_, index) => (
          <i key={index} data-on={index <= step ? "1" : "0"} />
        ))}
      </div>
      {!quiz ? (
        <div className="ln-card" key={step}>
          <p>{lesson.steps[step]}</p>
        </div>
      ) : (
        <fieldset className="ln-quiz">
          <legend>{lesson.quiz.q}</legend>
          {lesson.quiz.options.map((option, index) => (
            <button
              key={option}
              type="button"
              className="ln-opt"
              aria-pressed={pick === index}
              data-state={pick !== index ? "" : right ? "right" : "wrong"}
              onClick={() => {
                setPick(index);
                if (index === lesson.quiz.right) onDone();
              }}
            >
              {option}
            </button>
          ))}
          {pick !== null ? (
            <p className="ln-why" role="status" data-ok={right ? "1" : "0"}>
              {right ? `Так. ${lesson.quiz.why}` : "Не зовсім. Перечитай кроки або спробуй ще раз."}
            </p>
          ) : null}
        </fieldset>
      )}
      <div className="ln-nav">
        {step > 0 ? (
          <button type="button" className="orbit-chip" onClick={() => { setStep((now) => now - 1); setPick(null); }}>Назад</button>
        ) : <span />}
        {!quiz ? (
          <button type="button" className="orbit-go ln-go" onClick={() => setStep((now) => now + 1)}>{step === lesson.steps.length - 1 ? "Перевірити себе" : "Далі"}</button>
        ) : right ? (
          onNext ? <button type="button" className="orbit-go ln-go" onClick={onNext}>Наступний урок</button> : <button type="button" className="orbit-go ln-go" onClick={onBack}>До уроків</button>
        ) : pick !== null ? (
          <button type="button" className="orbit-go ln-go" onClick={() => setPick(null)}>Ще раз</button>
        ) : <span />}
      </div>
    </Page>
  );
}
