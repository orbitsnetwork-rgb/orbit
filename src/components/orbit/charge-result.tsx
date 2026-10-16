import { orbitNo } from "@/lib/orbit/traits";
import { ThankList } from "@/components/orbit/crew";
import { useOrbits } from "@/lib/orbit/store";
import { Orbit as OrbitIcon, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CHARGE_MS, chanceOf, DAY_MS, WITNESS_OD, type Creation, type World } from "@/lib/orbit/engine";
import { buzz, chime, reducedMotion } from "@/lib/orbit/feel";
import { markSeen, type Outcome } from "@/components/orbit/charge-outcome";
export { markSeen, unseenOutcome, type Outcome } from "@/components/orbit/charge-outcome";

function no(id: number) {
  return orbitNo(id);
}

const SPARKS = 24;

/** Святковий екран успіху або м’який екран невдачі. Один раз на заряд. */
export function ChargeResult({ outcome, onView, onRestart, onClose }: { outcome: Outcome; onView: () => void; onRestart: () => void; onClose: () => void }) {
  const { passed, orbitId, chance, witnesses } = outcome;
  const head = useRef<HTMLHeadingElement>(null);
  const done = useRef(onClose);
  done.current = onClose;
  const [still] = useState(() => reducedMotion());
  const sparks = useMemo(
    () =>
      Array.from({ length: SPARKS }, (_, i) => ({
        a: (360 / SPARKS) * i + ((i * 37) % 11) - 5,
        d: 96 + ((i * 53) % 60),
        delay: 420 + ((i * 29) % 260),
        s: 0.6 + ((i * 17) % 7) / 10,
      })),
    [],
  );
  useEffect(() => {
    head.current?.focus({ preventScroll: true });
    if (passed) {
      buzz([20, 80, 20, 80, 40]);
      chime([523, 659, 784, 1047]);
    } else {
      buzz(30);
      chime([220], 0.3);
    }
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") done.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [passed]);
  const c = 2 * Math.PI * 42;
  const names = witnesses.length ? witnesses : [];
  return (
    <div className="cr-screen" data-passed={passed ? "1" : "0"} role="dialog" aria-modal="true" aria-labelledby="cr-title" aria-describedby="cr-body">
      <div className="cr-inner">
        <div className="cr-stage" aria-hidden>
          <svg viewBox="0 0 100 100" className="cr-svg">
            <defs>
              <radialGradient id="cr-planet" cx="35%" cy="32%" r="70%">
                <stop offset="0" stopColor="#fff6dd" />
                <stop offset=".55" stopColor="var(--sun)" />
                <stop offset="1" stopColor="var(--sun-deep)" />
              </radialGradient>
            </defs>
            <circle className="cr-ring cr-ring-back" cx="50" cy="50" r="42" />
            <circle className="cr-ring cr-ring-draw" cx="50" cy="50" r="42" strokeDasharray={c} strokeDashoffset={0} style={{ ["--c" as string]: c }} transform="rotate(-90 50 50)" />
          </svg>
          {Array.from({ length: 8 }, (_, i) => {
            const t = ((-90 + i * 45) * Math.PI) / 180;
            return <span key={i} className="cr-sat" style={{ left: `${50 + 42 * Math.cos(t)}%`, top: `${50 + 42 * Math.sin(t)}%`, ["--i" as string]: i, ["--dx" as string]: `${Math.cos(t) * 26}px`, ["--dy" as string]: `${Math.sin(t) * 26}px` }} />;
          })}
          <div className="cr-planet">{passed ? <span className="cr-no">{orbitId ? no(orbitId) : <OrbitIcon size={26} strokeWidth={1.6} />}</span> : null}</div>
          {passed && !still
            ? sparks.map((p, i) => (
                <i key={i} className="cr-spark" style={{ ["--a" as string]: `${p.a}deg`, ["--d" as string]: `${p.d}px`, ["--delay" as string]: `${p.delay}ms`, ["--s" as string]: p.s }}>
                  ✦
                </i>
              ))
            : null}
        </div>
        <p className="cr-kicker">Результат заряду</p>
        <h1 className="cr-title" id="cr-title" ref={head} tabIndex={-1}>
          {passed ? (orbitId ? `Орбіта ${no(orbitId)} — твоя!` : "Орбіта — твоя!") : "Цього разу не вийшло"}
        </h1>
        <p className="cr-body" id="cr-body">
          {passed
            ? `Вона вже у твоєму профілі. Можна тримати її або виставити в чергу. Учасники, які підтвердили запуск, отримали по ${WITNESS_OD} іскор ✦.`
            : `Шанс був ${chance}%, але заряд не втримався. Ці 8 підтверджень не зберігаються. Новий запуск можна почати будь-коли — це нічого не коштує.`}
        </p>
        {passed ? <ThankList world={useOrbits.getState().world} creation={outcome.creation} /> : null}
        {!passed && names.length ? (
          <div className="cr-who">
            <p>{passed ? "Тебе запустили" : "Тебе підтримали"}</p>
            <ul aria-label={passed ? "Тебе запустили" : "Тебе підтримали"}>
              {names.map((name, i) => (
                <li key={`${name}-${i}`} style={{ ["--i" as string]: i }}>
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {passed ? <p className="cr-chance">Шанс заряду був {chance}%</p> : null}
        <div className="cr-actions">
          {passed ? (
            <>
              <button type="button" className="ky-go" onClick={onView}>
                До моїх орбіт
              </button>
              <button type="button" className="cr-second" onClick={onClose}>
                Готово
              </button>
            </>
          ) : (
            <>
              <button type="button" className="ky-go cr-go-soft" onClick={onRestart}>
                <RotateCcw size={17} strokeWidth={2} aria-hidden /> Почати новий запуск
              </button>
              <button type="button" className="cr-second" onClick={onClose}>
                Закрити
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
