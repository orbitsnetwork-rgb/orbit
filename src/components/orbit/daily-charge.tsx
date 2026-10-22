import { useEffect, useState } from "react";
import { BatteryCharging, Check, Flame } from "lucide-react";
import { buzz, chime, reducedMotion } from "@/lib/orbit/feel";
import { utcDay, type Account, type World } from "@/lib/orbit/engine";

/** Щоденний «Заряд»: один дотик на добу. Лише ритуал і серія днів — без ✦, без впливу на економіку. */
import { nextRitual, type Ritual } from "@/lib/orbit/ritual";
const KEY = (id: string) => `orbits-ritual-${id}`;
const STAGES = [
  { at: 3, title: "Іскриста рамка", hint: "3 дні поспіль" },
  { at: 7, title: "Золоте кільце", hint: "7 днів поспіль" },
  { at: 30, title: "Сузір’я", hint: "30 днів поспіль" },
];

export function readRitual(id: string): Ritual {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(id)) ?? "null");
    if (raw && typeof raw.last === "string" && Number.isFinite(raw.streak)) return { last: raw.last, streak: raw.streak, best: raw.best ?? raw.streak };
  } catch {
    /* немає сховища — серія з нуля */
  }
  return { last: "", streak: 0, best: 0 };
}

/** Сервер — джерело правди; локальна копія лише для миттєвого показу і рамки профілю. */
function save(id: string, r: Ritual, set: (r: Ritual) => void) {
  const clean = { last: r.last, streak: r.streak, best: r.best };
  set(clean);
  try {
    localStorage.setItem(KEY(id), JSON.stringify(clean));
  } catch {
    /* без сховища — лише в пам'яті */
  }
}

export function DailyCharge({ world, user }: { world: World; user: Account }) {
  const today = utcDay(world.now);
  const yesterday = utcDay(world.now - 86_400_000);
  const [r, setR] = useState<Ritual>({ last: "", streak: 0, best: 0 });
  const [pop, setPop] = useState(false);
  useEffect(() => {
    setR(readRitual(user.id));
    let alive = true;
    void (async () => {
      const [{ ritualSync }, { sessionCreds }] = await Promise.all([import("@/lib/orbit/live"), import("@/lib/orbit/store")]);
      const out = await ritualSync({ data: sessionCreds() }).catch(() => null);
      if (alive && out?.ok) save(user.id, out, setR);
    })();
    return () => {
      alive = false;
    };
  }, [user.id]);
  const done = r.last === today;
  const alive = done || r.last === yesterday;
  const streak = alive ? r.streak : 0;
  const next = STAGES.find((s) => s.at > streak);
  const charge = () => {
    if (done) return;
    save(user.id, nextRitual(r, today, yesterday), setR);
    void (async () => {
      const [{ ritualSync }, { sessionCreds }] = await Promise.all([import("@/lib/orbit/live"), import("@/lib/orbit/store")]);
      const out = await ritualSync({ data: { ...sessionCreds(), tap: true } }).catch(() => null);
      if (out?.ok) save(user.id, out, setR);
    })();
    buzz([15, 60, 25]);
    chime([659, 880]);
    if (!reducedMotion()) {
      setPop(true);
      setTimeout(() => setPop(false), 900);
    }
  };
  return (
    <section className="orbit-block dc" data-done={done ? "1" : "0"} aria-labelledby="dc-title" data-testid="daily-charge">
      <div className="dc-row">
        <button type="button" className="dc-orb" data-pop={pop ? "1" : "0"} onClick={charge} disabled={done} aria-label={done ? "Заряд на сьогодні вже є" : "Зарядитися на сьогодні"}>
          {done ? <Check size={26} strokeWidth={2.4} aria-hidden /> : <BatteryCharging size={26} strokeWidth={2} aria-hidden />}
        </button>
        <div>
          <p className="orbit-kicker">Щоденний заряд</p>
          <h2 id="dc-title">{done ? "Заряджено на сьогодні" : "Торкнись, щоб зарядитися"}</h2>
          <p className="dc-sub">
            <Flame size={13} strokeWidth={2} aria-hidden /> Серія: {streak} {streak === 1 ? "день" : streak >= 2 && streak <= 4 ? "дні" : "днів"}
            {r.best > streak ? ` · рекорд ${r.best}` : ""}
          </p>
        </div>
      </div>
      <ol className="dc-stages" aria-label="Нагороди за серію">
        {STAGES.map((s) => (
          <li key={s.at} data-on={streak >= s.at || r.best >= s.at ? "1" : "0"}>
            <b>{s.title}</b>
            <small>{s.hint}</small>
          </li>
        ))}
      </ol>
      <p className="dc-fine">{next ? `Ще ${next.at - streak} — і відкриється «${next.title}» для профілю.` : "Усі прикраси відкрито."} Лише краса: ✦ за заряд не нараховуються.</p>
    </section>
  );
}

/** Прикраса профілю за найкращу серію (лише вигляд). */
export function ritualFrame(id: string): "none" | "spark" | "gold" | "stars" {
  const best = readRitual(id).best;
  return best >= 30 ? "stars" : best >= 7 ? "gold" : best >= 3 ? "spark" : "none";
}
