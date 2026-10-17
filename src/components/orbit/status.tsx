import { useEffect, useState } from "react";
import { Page } from "@/components/orbit/more";
import { spk } from "@/lib/orbit/copy";
import { chanceOf, DAY_MS, FUND_PERIOD_MS, type World } from "@/lib/orbit/engine";
import { OFFLINE, useOrbits } from "@/lib/orbit/store";

type State = "ok" | "slow" | "down" | "test" | "off";
const WORD: Record<State, string> = { ok: "Працює", slow: "Повільно", down: "Немає зв’язку", test: "Тестовий режим", off: "Вимкнено" };

function span(ms: number) {
  if (ms <= 0) return "зараз";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (h >= 24) return `${Math.floor(h / 24)} д ${h % 24} год`;
  if (h >= 1) return `${h} год ${m} хв`;
  if (m >= 1) return `${m} хв ${s} с`;
  return `${s} с`;
}

function utc(ms: number) {
  return new Date(ms).toISOString().slice(11, 19);
}

export function Status({ world, onBack, onClose }: { world: World; onBack: () => void; onClose?: () => void }) {
  const offline = useOrbits((state) => state.bad && state.flash === OFFLINE);
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  const lag = Math.max(0, now - world.now);
  const link: State = !online || offline || lag > 30_000 ? "down" : lag > 10_000 ? "slow" : "ok";
  const live: State = link === "down" ? "down" : "ok";
  const nextPrice = Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
  const nextFund = world.lastDistributionAt + FUND_PERIOD_MS;
  const parts: { title: string; sub: string; state: State }[] = [
    { title: "Зв’язок зі світом", sub: link === "down" ? (online ? "Сервер не відповідає. Пробуємо знову кожні 2 с" : "Телефон без інтернету") : lag < 3000 ? "Дані свіжі, оновлюються кожні 2 с" : `Дані оновлено ${span(lag)} тому`, state: link },
    { title: "Обмін", sub: `У черзі ${world.queue.length} · ціна ${spk(world.price)}`, state: live },
    { title: "Заявки і заряди", sub: `Шанс заряду зараз ${Math.round(chanceOf(world.orbits.length) * 100)}%`, state: live },
    { title: "Фонд", sub: `У фонді ${spk(world.fund)}`, state: live },
    { title: "Поповнення", sub: "Після юридичного оформлення", state: "off" },
    { title: "Вивід", sub: "Після юридичного оформлення · іскри не є грошима", state: "off" },
  ];
  const head = link === "down" ? "down" : link === "slow" ? "slow" : "ok";

  return (
    <Page title="Стан системи" kicker="Видно з цього телефону" onBack={onBack} onClose={onClose}>
      <section className="st-head" data-state={head} role="status" aria-live="polite">
        <i aria-hidden />
        <div>
          <b>{head === "ok" ? "Усе працює" : head === "slow" ? "Дані йдуть повільно" : "Немає зв’язку зі світом"}</b>
          <small>{head === "down" ? "Дії зараз можуть не пройти. Іскри при цьому не губляться." : "Обмін, заявки і фонд доступні."}</small>
        </div>
      </section>

      <section className="mo-group" aria-label="Частини">
        <p className="mo-group-title">Частини</p>
        <div className="mo-card">
          {parts.map((row) => (
            <div key={row.title} className="st-row">
              <span className="mo-row-text">
                <b>{row.title}</b>
                <small>{row.sub}</small>
              </span>
              <span className="st-pill" data-state={row.state}>{WORD[row.state]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mo-group" aria-label="Розклад">
        <p className="mo-group-title">Розклад · UTC</p>
        <div className="mo-card">
          <div className="st-row">
            <span className="mo-row-text"><b>Зараз</b><small>Світ живе за UTC</small></span>
            <span className="st-time" aria-label={`Зараз ${utc(now)} UTC`}>{utc(now)}</span>
          </div>
          <div className="st-row">
            <span className="mo-row-text"><b>Нова ціна дня</b><small>Опівночі UTC, із середнього обороту за 7 діб, не більше ±10%</small></span>
            <span className="st-time">{span(nextPrice - now)}</span>
          </div>
          <div className="st-row">
            <span className="mo-row-text"><b>Поділ фонду</b><small>{nextFund > now ? "Раз на 3 доби, між активними" : "Відбудеться з наступною дією у світі"}</small></span>
            <span className="st-time">{nextFund > now ? span(nextFund - now) : "скоро"}</span>
          </div>
        </div>
      </section>
      <p className="orbit-note as-small">Цей екран показує, що бачить твій телефон. Окремої сторінки стану поза додатком поки немає.</p>
    </Page>
  );
}
