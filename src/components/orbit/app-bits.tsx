/** Спільні дрібниці головного застосунку (годинник за сервером, формати, мова) — для app.tsx і екранів, що вантажаться окремо. */
import { orbitNo } from "@/lib/orbit/traits";
import { LockBadge, LockedSheet } from "@/components/orbit/locked";
import { useEffect, useState } from "react";
import { readLang, sparkText, type Lang } from "@/lib/orbit/copy";
import { DAY_MS, utcDay } from "@/lib/orbit/engine";
import { useOrbits } from "@/lib/orbit/store";
import { useCountUp } from "@/lib/orbit/count-up";

export const money = new Intl.NumberFormat("uk-UA");
export function no(id: number) {
  return orbitNo(id);
}
export function left(ms: number) {
  if (ms <= 0) return "зараз";
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} д`;
  if (hours > 0) return `${hours} год ${mins} хв`;
  return `${Math.max(mins, 1)} хв`;
}
export function dayStart(ms: number) {
  return Date.parse(`${utcDay(ms)}T00:00:00.000Z`);
}
export function nextMidnight(ms: number) {
  return dayStart(ms) + DAY_MS;
}
/** Годинник за сервером: зсув «сервер − пристрій» береться з кожної відповіді, тож неправильний час на телефоні не ламає таймери. */
export function useWall(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const skew = serverNow - Date.now();
    setNow(Date.now() + skew);
    const id = window.setInterval(() => setNow(Date.now() + skew), 1000);
    return () => window.clearInterval(id);
  }, [serverNow]);
  return now;
}
export function useLang() {
  const [lang, setLang] = useState<Lang>("uk");
  useEffect(() => {
    const read = () => setLang(readLang());
    read();
    window.addEventListener("orbit-lang", read);
    return () => window.removeEventListener("orbit-lang", read);
  }, []);
  return lang;
}
export function when(ms: number) {
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", timeZone: "UTC" }).format(ms);
}
/** Число, що «докручується» при зміні. */
export function CountUp({ value }: { value: number }) {
  return <>{money.format(useCountUp(value))}</>;
}

export function Notice({ inline = false }: { inline?: boolean }) {
  const flash = useOrbits((state) => state.flash);
  const bad = useOrbits((state) => state.bad);
  if (!flash || !inline) return null;
  return (
    <p className={bad ? "orbit-flash" : "orbit-ok"} role="status">
      {sparkText(flash)}
    </p>
  );
}

export function LangRow({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lk-lang">
      <span className="lk-lang-on" aria-current="true">{lang === "uk" ? "Українська" : lang.toUpperCase()}</span>
      <button type="button" className="orbit-quiet lk-lang-more" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        English · Polski · Deutsch <LockBadge id="languages" />
      </button>
      {open ? <LockedSheet id="languages" onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

