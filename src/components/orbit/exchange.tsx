import { useEffect, useState } from "react";
import { sparks, spk } from "@/lib/orbit/copy";
import { DAY_MS, ORBIT_CAP, SELLER_SHARE, utcDay, type Account, type World } from "@/lib/orbit/engine";
import { useOrbits } from "@/lib/orbit/store";

const fmt = new Intl.NumberFormat("uk-UA");

function no(id: number) {
  return `#${String(id).padStart(7, "0")}`;
}

function clock(ms: number) {
  return new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "UTC" }).format(ms);
}

function dayLabel(day: string) {
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", timeZone: "UTC" }).format(Date.parse(`${day}T00:00:00.000Z`));
}

type Confirm = { kind: "buy" } | { kind: "sell"; orbitId: number } | null;

/** Біржовий екран. Усе — з існуючої механіки: черга, ціна дня, «купити найстарішу». */
export function Exchange({ world, user }: { world: World; user: Account }) {
  const pendingMail = useOrbits((state) => state.self)?.confirmed === false;
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const oldest = world.queue[0];
  const canBuy = Boolean(oldest && oldest.userId !== user.id);
  const loose = world.orbits.filter((orbit) => orbit.ownerId === user.id && !world.queue.some((row) => row.orbitId === orbit.id));
  const dayAgo = world.now - DAY_MS;
  const recent = world.trades.filter((trade) => trade.at >= dayAgo);
  const volume = recent.reduce((sum, trade) => sum + trade.amount, 0);
  const issued = world.orbits.length;
  const supplyPct = (issued / ORBIT_CAP) * 100;

  // Історія ціни: ціна кожної угоди = ціна дня в момент угоди. Групуємо по добах (UTC).
  const byDay = new Map<string, number>();
  for (const trade of world.trades) byDay.set(utcDay(trade.at), trade.amount);
  const points = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const prevDay = points.length >= 1 ? points[points.length - 1][1] : null;
  const change = prevDay && prevDay !== world.price ? ((world.price - prevDay) / prevDay) * 100 : 0;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <div className="orbit-stack">
      <section className="orbit-block">
        <div className="ex-head">
          <div>
            <p className="orbit-kicker">Обмін · ✦ / орбіта</p>
            <p className="orbit-price">{fmt.format(world.price)}</p>
            <p className="orbit-unit">✦ ціна дня</p>
          </div>
          <span className="ex-chg" data-dir={change > 0 ? "up" : change < 0 ? "down" : "flat"}>
            {change === 0 ? "0%" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
          </span>
        </div>
        <Chart points={points} price={world.price} />
        <div className="orbit-stats">
          <div><b>{recent.length}</b><span>угод 24г</span></div>
          <div><b>{fmt.format(volume)}</b><span>обсяг ✦</span></div>
          <div><b>{world.queue.length}</b><span>у черзі</span></div>
          <div><b>{loose.length}</b><span>твої вільні</span></div>
        </div>
        <div className="ex-supply">
          <div className="ex-supply-row">
            <span className="orbit-kicker">Випуск</span>
            <span><b>{fmt.format(issued)}</b> / {fmt.format(ORBIT_CAP)}</span>
          </div>
          <div className="ex-bar"><i style={{ width: `${Math.max(supplyPct, issued > 0 ? 0.6 : 0)}%` }} /></div>
          <p className="orbit-note">Орбіти видобувають люди: 8 підтверджень і заряд. Ліміт не змінюється.</p>
        </div>
        {pendingMail ? (
          <p className="orbit-note">Спочатку підтвердь пошту на вкладці «Ціна».</p>
        ) : (
          <div className="ex-actions">
            <button type="button" className="ex-buy" disabled={!canBuy || busy} onClick={() => setConfirm({ kind: "buy" })}>
              Купити
              <small>{canBuy ? spk(world.price) : oldest ? "перша твоя" : "черга порожня"}</small>
            </button>
            <button type="button" className="ex-sell" disabled={loose.length === 0 || busy} onClick={() => loose[0] && setConfirm({ kind: "sell", orbitId: loose[0].id })}>
              Продати
              <small>{loose.length > 0 ? no(loose[0].id) : "немає вільних"}</small>
            </button>
          </div>
        )}
      </section>

      <section className="orbit-block">
        <div className="ex-supply-row">
          <p className="orbit-kicker">Черга продажу</p>
          <span className="orbit-note">купують з першої</span>
        </div>
        {world.queue.length === 0 ? (
          <p className="orbit-empty">Черга 0 · виставити орбіту може кожен власник</p>
        ) : (
          <div className="ex-book">
            {world.queue.slice(0, 12).map((row, index) => {
              const owner = world.accounts.find((account) => account.id === row.userId)?.name ?? "хтось";
              const mine = row.userId === user.id;
              return (
                <div key={row.id} className="ex-book-row" data-first={index === 0 ? "1" : "0"}>
                  <span className="ex-pos">{index + 1}</span>
                  <span>{no(row.orbitId)}</span>
                  <span className="ex-owner">{mine ? "ти" : owner}</span>
                  <span className="ex-px">{fmt.format(world.price)} ✦</span>
                  {mine && index > 0 ? (
                    <button type="button" className="orbit-quiet" onClick={() => useOrbits.getState().cancel(row.orbitId)}>Зняти</button>
                  ) : null}
                </div>
              );
            })}
            {world.queue.length > 12 ? <p className="orbit-note">І ще {world.queue.length - 12}</p> : null}
          </div>
        )}
        {loose.length > 1 && !pendingMail ? (
          <div className="orbit-chips">
            {loose.slice(0, 6).map((orbit) => (
              <button key={orbit.id} type="button" className="orbit-chip" onClick={() => setConfirm({ kind: "sell", orbitId: orbit.id })}>
                Продати {no(orbit.id)}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="orbit-block">
        <p className="orbit-kicker">Останні угоди</p>
        {world.trades.length === 0 ? (
          <p className="orbit-empty">Угод ще не було · перша з’явиться тут</p>
        ) : (
          world.trades
            .slice(-8)
            .reverse()
            .map((trade, index) => (
              <div key={`${trade.at}-${trade.orbitId}-${index}`} className="orbit-row">
                <span>{no(trade.orbitId)}</span>
                <span className="orbit-note">{clock(trade.at)} UTC</span>
                <span>{spk(trade.amount)}</span>
              </div>
            ))
        )}
      </section>

      <Soon />

      {confirm ? (
        <ConfirmSheet
          world={world}
          user={user}
          confirm={confirm}
          busy={busy}
          onClose={() => setConfirm(null)}
          onBuy={() => run(() => useOrbits.getState().buy())}
          onSell={(orbitId) => run(() => useOrbits.getState().list(orbitId))}
        />
      ) : null}
    </div>
  );
}

function Chart({ points, price }: { points: [string, number][]; price: number }) {
  if (points.length < 2) {
    return (
      <div className="ex-chart ex-chart-empty">
        <span>Графік з’явиться після угод у різні дні</span>
      </div>
    );
  }
  const values = [...points.map((row) => row[1]), price];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const width = 320;
  const height = 110;
  const step = width / (points.length - 1);
  const flat = hi === lo;
  const xy = points.map(([, value], index) => [index * step, flat ? height / 2 : height - 10 - ((value - lo) / span) * (height - 20)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <div className="ex-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Ціна за днями">
        <defs>
          <linearGradient id="ex-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#d7a15a" stopOpacity="0.35" />
            <stop offset="1" stopColor="#d7a15a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${height} ${line} ${width},${height}`} fill="url(#ex-fill)" />
        <polyline points={line} fill="none" stroke="#d7a15a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="ex-chart-axis">
        <span>{dayLabel(points[0][0])}</span>
        <span>{flat ? `${fmt.format(lo)} ✦ стабільно` : `${fmt.format(lo)}–${fmt.format(hi)} ✦`}</span>
        <span>{dayLabel(points[points.length - 1][0])}</span>
      </div>
    </div>
  );
}

function ConfirmSheet({
  world,
  user,
  confirm,
  busy,
  onClose,
  onBuy,
  onSell,
}: {
  world: World;
  user: Account;
  confirm: Exclude<Confirm, null>;
  busy: boolean;
  onClose: () => void;
  onBuy: () => void;
  onSell: (orbitId: number) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const price = world.price;
  if (confirm.kind === "buy") {
    const oldest = world.queue[0];
    const after = user.balance - price;
    const short = after < 0;
    return (
      <div className="ex-overlay" onClick={onClose}>
        <div className="ex-sheet" role="dialog" aria-modal="true" aria-label="Купити орбіту" onClick={(event) => event.stopPropagation()}>
          <p className="orbit-kicker">Купити найстарішу з черги</p>
          <h2 className="orbit-h">{oldest ? no(oldest.orbitId) : "—"}</h2>
          <div className="ex-lines">
            <div><span>Ціна дня</span><b>{sparks(price)}</b></div>
            <div><span>Баланс зараз</span><b>{sparks(user.balance)}</b></div>
            <div><span>Баланс після</span><b data-bad={short ? "1" : "0"}>{short ? `бракує ${sparks(-after)}` : sparks(after)}</b></div>
            <div><span>Стабільність</span><b>+1</b></div>
          </div>
          <p className="orbit-note">Ціна одна для всіх і міняється о 00:00 UTC. Тестовий режим.</p>
          <button type="button" className="orbit-go" disabled={busy || short || !oldest} onClick={onBuy}>
            {busy ? "…" : `Купити за ${spk(price)}`}
          </button>
          <button type="button" className="orbit-quiet" onClick={onClose}>Скасувати</button>
        </div>
      </div>
    );
  }
  const get = Math.floor(price * SELLER_SHARE);
  return (
    <div className="ex-overlay" onClick={onClose}>
      <div className="ex-sheet" role="dialog" aria-modal="true" aria-label="Продати орбіту" onClick={(event) => event.stopPropagation()}>
        <p className="orbit-kicker">Поставити в чергу продажу</p>
        <h2 className="orbit-h">{no(confirm.orbitId)}</h2>
        <div className="ex-lines">
          <div><span>Місце в черзі</span><b>{world.queue.length + 1}</b></div>
          <div><span>Ціна дня зараз</span><b>{sparks(price)}</b></div>
          <div><span>Тобі після продажу</span><b>≈ {sparks(get)}</b></div>
          <div><span>Баланс після продажу</span><b>≈ {sparks(user.balance + get)}</b></div>
        </div>
        <p className="orbit-note">
          Іскри прийдуть, коли орбіту куплять. Продаж іде за ціною дня в момент купівлі: {Math.round(SELLER_SHARE * 100)}% тобі, решта — у фонд і резерв. Поки орбіта не перша, її можна зняти.
        </p>
        <button type="button" className="orbit-go" disabled={busy} onClick={() => onSell(confirm.orbitId)}>
          {busy ? "…" : "Поставити в чергу"}
        </button>
        <button type="button" className="orbit-quiet" onClick={onClose}>Скасувати</button>
      </div>
    </div>
  );
}

const SOON = [
  { title: "Ввід гривні", text: "Купівля іскор за гривні. Зараз лише тестове поповнення." },
  { title: "Вивід на картку", text: "Після юридичної перевірки. Без обіцянок доходу." },
  { title: "Обмін P2P", text: "Власна ціна в оголошенні, угоди між людьми." },
];

/** «Скоро»: чесна дорожня карта. Без функцій, без дат. */
export function Soon() {
  return (
    <section className="ex-soon" aria-label="Скоро">
      <p className="orbit-kicker">Скоро</p>
      {SOON.map((item) => (
        <div key={item.title} className="ex-soon-row">
          <div>
            <b>{item.title}</b>
            <p className="orbit-note">{item.text}</p>
          </div>
          <button type="button" className="ex-soon-btn" disabled aria-disabled="true">У розробці</button>
        </div>
      ))}
    </section>
  );
}

