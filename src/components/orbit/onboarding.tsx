import { useEffect, useRef, useState } from "react";
import { CODES_PER_DAY, CONFIRM_NEED, STARTER_OD } from "@/lib/orbit/engine";
import { buzz, reducedMotion } from "@/lib/orbit/feel";
import { OrbitRings } from "@/components/orbit/space/orbit-rings";

/** Той самий ключ, що й у старої картки «Перші кроки», — хто її закрив, вдруге не побачить. */
const seenKey = (id: string) => `orbits-seen-${id}`;

/** Знайомство — для нових акаунтів (до 7 днів), один раз на пристрої. */
export function onboardingDue(userId: string, createdAt: number, now: number) {
  if (now - createdAt > 7 * 24 * 60 * 60 * 1000) return false;
  try {
    return localStorage.getItem(seenKey(userId)) !== "1";
  } catch {
    return false;
  }
}

function markDone(userId: string) {
  try {
    localStorage.setItem(seenKey(userId), "1");
  } catch {
    /* приватний режим */
  }
}

// Чесна арифметика першої орбіти з констант рушія: 8 підтверджень, до 3 кодів на день, 24 год заряду.
const COLLECT_DAYS = Math.ceil(CONFIRM_NEED / CODES_PER_DAY);
const FIRST_DAYS = COLLECT_DAYS + 1;

function Sky() {
  return (
    <div className="ob-art ob-art-sky" aria-hidden>
      <OrbitRings />
      <div className="ob-count">
        <b>8 000 000</b>
        <span>орбіт — і жодної більше</span>
      </div>
    </div>
  );
}

function Spark() {
  return (
    <div className="ob-art ob-art-spark" aria-hidden>
      <span className="ob-spark">✦</span>
      <span className="ob-chip">+{STARTER_OD} ✦ за перший внесок</span>
      <span className="ob-test">Тест</span>
    </div>
  );
}

function Days() {
  const plan = [
    { day: 1, text: `${CODES_PER_DAY} з ${CONFIRM_NEED}`, lit: CODES_PER_DAY },
    { day: 2, text: `${CODES_PER_DAY * 2} з ${CONFIRM_NEED}`, lit: CODES_PER_DAY * 2 },
    { day: 3, text: `${CONFIRM_NEED} з ${CONFIRM_NEED}`, lit: CONFIRM_NEED },
    { day: 4, text: "заряд", lit: CONFIRM_NEED },
  ];
  return (
    <div className="ob-art ob-art-days" aria-hidden>
      <div className="ob-sats">
        {Array.from({ length: CONFIRM_NEED }, (_, i) => {
          const t = ((-90 + i * 45) * Math.PI) / 180;
          return <span key={i} style={{ left: `${50 + 42 * Math.cos(t)}%`, top: `${50 + 42 * Math.sin(t)}%`, ["--i" as string]: i }} />;
        })}
        <b>~{FIRST_DAYS} дні</b>
      </div>
      <ol className="ob-plan">
        {plan.map((row) => (
          <li key={row.day}>
            <span>День {row.day}</span>
            {row.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

const SLIDES = [
  {
    art: <Sky />,
    title: "Вісім мільйонів орбіт",
    body: "Орбіта — твоє місце у спільному світі. Усі орбіти однакові, і в усіх одна ціна на день. Їх буде рівно 8 000 000 — і жодної більше.",
  },
  {
    art: <Spark />,
    title: "Іскри ✦ — тестові одиниці",
    body: `Іскрами купують орбіти, з них складається фонд. Зараз усе працює в тестовому режимі: іскри не є грошима і не виводяться. Стартові ${STARTER_OD} ✦ — після першого успішного підтвердження чужого запуску або власної орбіти.`,
  },
  {
    art: <Days />,
    title: `Перша орбіта — приблизно за ${FIRST_DAYS} дні`,
    body: `Для запуску потрібно ${CONFIRM_NEED} підтверджень від інших учасників. Один код — одне підтвердження, кодів до ${CODES_PER_DAY} на день, тож збір триває щонайменше ${COLLECT_DAYS} дні. Далі 24 години заряду. Або купи готову орбіту з черги.`,
  },
];

/** Перші 60 секунд: 3 картки зі свайпом. Можна пропустити; показуємо один раз. */
export function Onboarding({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const heads = useRef<(HTMLHeadingElement | null)[]>([]);
  const finish = useRef(() => {
    markDone(userId);
    onDone();
  });
  finish.current = () => {
    markDone(userId);
    onDone();
  };
  // Захист від «примарного» дотику: той самий тап, що закрив екран ключа, не гортає картку.
  const born = useRef(Date.now());
  const go = (next: number) => {
    const el = track.current;
    if (!el || Date.now() - born.current < 450) return;
    const i = Math.max(0, Math.min(SLIDES.length - 1, next));
    el.scrollTo({ left: i * el.clientWidth, behavior: reducedMotion() ? "auto" : "smooth" });
  };
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
        setIndex((prev) => {
          if (prev !== i) buzz(6);
          return i;
        });
      });
    };
    // Картки завжди починаються з першої (браузер інколи відновлює зсув).
    el.scrollLeft = 0;
    const reset = window.requestAnimationFrame(() => { el.scrollLeft = 0; setIndex(0); });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(reset);
      el.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(raf);
    };
  }, []);
  useEffect(() => {
    heads.current[index]?.focus({ preventScroll: true });
  }, [index]);
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish.current();
      if (event.key === "ArrowRight") go(Math.round((track.current?.scrollLeft ?? 0) / Math.max(1, track.current?.clientWidth ?? 1)) + 1);
      if (event.key === "ArrowLeft") go(Math.round((track.current?.scrollLeft ?? 0) / Math.max(1, track.current?.clientWidth ?? 1)) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      html.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const last = index === SLIDES.length - 1;
  return (
    <div className="ob-screen" role="dialog" aria-modal="true" aria-label="Знайомство з Орбітами">
      <div className="ob-top">
        <span className="ob-step" aria-hidden>
          {index + 1} / {SLIDES.length}
        </span>
        <button type="button" className="ob-skip" onClick={() => finish.current()}>
          Пропустити
        </button>
      </div>
      <div className="ob-track" ref={track}>
        {SLIDES.map((slide, i) => (
          <section key={slide.title} className="ob-slide" data-on={i === index ? "1" : "0"} role="group" aria-roledescription="картка" aria-label={`${i + 1} з ${SLIDES.length}`} aria-hidden={i !== index}>
            {slide.art}
            <h2 className="ob-title" ref={(node) => { heads.current[i] = node; }} tabIndex={-1}>
              {slide.title}
            </h2>
            <p className="ob-body">{slide.body}</p>
          </section>
        ))}
      </div>
      <div className="ob-foot">
        <div className="ob-dots">
          {SLIDES.map((slide, i) => (
            <button key={slide.title} type="button" aria-label={`Картка ${i + 1}: ${slide.title}`} aria-current={i === index ? "step" : undefined} data-on={i === index ? "1" : "0"} onClick={() => go(i)} />
          ))}
        </div>
        <button type="button" className="ky-go" onClick={() => (last ? finish.current() : go(index + 1))}>
          {last ? "Почати" : "Далі"}
        </button>
      </div>
    </div>
  );
}
