import { orbitNo } from "@/lib/orbit/traits";
import { useEffect, useState } from "react";
import { ArrowLeftRight, Coins, CreditCard, Landmark, ListOrdered, Orbit as OrbitIcon, ShoppingCart, Tag, Users, Wallet } from "lucide-react";
import { ago } from "@/lib/orbit/inbox";
import { dayDelta, perDay } from "@/lib/orbit/series";
import { PriceChart } from "@/components/orbit/ui/price-chart";
import { Avatar, Change, Empty, Progress, Segmented, Sparkline, Stat } from "@/components/orbit/ui/kit";
import { sparks, spk } from "@/lib/orbit/copy";
import { DAY_MS, ORBIT_CAP, SELLER_SHARE, utcDay, type Account, type World } from "@/lib/orbit/engine";
import { useOrbits } from "@/lib/orbit/store";
import type { Trust } from "@/lib/orbit/social";

const fmt = new Intl.NumberFormat("uk-UA");

function no(id: number) {
  return orbitNo(id);
}

function clock(ms: number) {
  return new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "Europe/Kyiv" }).format(ms);
}

function dayLabel(day: string) {
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", timeZone: "UTC" }).format(Date.parse(`${day}T00:00:00.000Z`));
}

export type Confirm = { kind: "buy" } | { kind: "sell"; orbitId: number } | null;

type Panel = "book" | "trades" | "mine";

/** Біржовий екран. Усе — з існуючої механіки: черга, ціна дня, «купити найстарішу». */
export function Exchange({ world, user }: { world: World; user: Account }) {
  const pendingMail = useOrbits((state) => state.self)?.confirmed === false;
  const trust = useOrbits((state) => state.mine?.trust);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>("book");
  const oldest = world.queue[0];
  const canBuy = Boolean(oldest && oldest.userId !== user.id);
  const listedIds = new Set(world.queue.map((row) => row.orbitId));
  const mineAll = world.orbits.filter((orbit) => orbit.ownerId === user.id);
  const loose = mineAll.filter((orbit) => !listedIds.has(orbit.id));
  const myListings = world.queue.map((row, index) => ({ row, index })).filter(({ row }) => row.userId === user.id);
  const dayAgo = world.now - DAY_MS;
  const recent = world.trades.filter((trade) => trade.at >= dayAgo);
  const volume = recent.reduce((sum, trade) => sum + trade.amount, 0);
  const issued = world.orbits.length;
  const supplyPct = (issued / ORBIT_CAP) * 100;
  const deals = perDay(world.trades.map((trade) => trade.at), world.now);
  const listed = perDay(world.queue.map((row) => row.createdAt), world.now);

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
    <div className="orbit-stack ex">
      <section className="orbit-block ex-main" aria-labelledby="ex-pair">
        <div className="ex-pair">
          <span className="ex-coin" aria-hidden><OrbitIcon size={20} strokeWidth={1.8} /></span>
          <div>
            <h2 id="ex-pair">Орбіта <span>/ ✦</span></h2>
            <p>Ціна дня · одна для всіх · {dayLabel(utcDay(world.now))}</p>
          </div>
          <span className="hm-test">Тест</span>
        </div>
        <PriceChart trades={world.trades} price={world.price} now={world.now} />
        {pendingMail ? (
          <p className="orbit-note">Спочатку підтвердь пошту на вкладці «Ціна».</p>
        ) : (
          <div className="ex-actions">
            <button type="button" className="ex-buy" disabled={!canBuy || busy} onClick={() => setConfirm({ kind: "buy" })}>
              <span><ShoppingCart size={18} strokeWidth={2} aria-hidden /> Купити</span>
              <small>{canBuy ? spk(world.price) : oldest ? "перша твоя" : "черга порожня"}</small>
            </button>
            <button type="button" className="ex-sell" disabled={loose.length === 0 || busy} onClick={() => loose[0] && setConfirm({ kind: "sell", orbitId: loose[0].id })}>
              <span><Tag size={18} strokeWidth={2} aria-hidden /> Продати</span>
              <small>{loose.length > 0 ? no(loose[0].id) : "немає орбіт на продаж"}</small>
            </button>
          </div>
        )}
      </section>

      <div className="k-grid2">
        <Stat icon={<ArrowLeftRight size={16} strokeWidth={2} />} tone="ion" value={fmt.format(recent.length)} label="угод за 24 год" foot={<Sparkline values={deals} tone="ion" width={120} height={22} />} />
        <Stat icon={<Coins size={16} strokeWidth={2} />} value={`${fmt.format(volume)} ✦`} label="обсяг за 24 год" foot={<Change abs={dayDelta(deals)} suffix="угод до вчора" />} />
        <Stat icon={<ListOrdered size={16} strokeWidth={2} />} tone="nebula" value={fmt.format(world.queue.length)} label="орбіт у черзі" foot={<Sparkline values={listed} tone="nebula" width={120} height={22} />} />
        <Stat icon={<Wallet size={16} strokeWidth={2} />} tone="aurora" value={`${fmt.format(loose.length)} / ${fmt.format(mineAll.length)}`} label="твої вільні / усі" foot={<span className="ex-foot">{myListings.length ? `у черзі: ${myListings.length}` : "у черзі: немає"}</span>} />
      </div>

      <section className="orbit-block ex-supply" aria-labelledby="ex-supply-title">
        <div className="ex-supply-row">
          <h2 id="ex-supply-title" className="ex-h">Випуск орбіт</h2>
          <span><b>{fmt.format(issued)}</b> / {fmt.format(ORBIT_CAP)}</span>
        </div>
        <Progress value={issued} max={ORBIT_CAP} label="Випущено орбіт з ліміту" />
        <p className="orbit-note">Випущено {supplyPct < 0.01 ? "<0,01" : supplyPct.toFixed(2).replace(".", ",")}%. Орбіти видобувають люди: 8 підтверджень і 24 год заряду. Ліміт не змінюється.</p>
      </section>

      <section className="orbit-block ex-panels" aria-label="Черга, угоди, мої">
        <Segmented
          label="Розділ обміну"
          value={panel}
          onChange={setPanel}
          options={[
            { id: "book", label: `Черга · ${world.queue.length}` },
            { id: "trades", label: "Угоди" },
            { id: "mine", label: `Мої · ${mineAll.length}` },
          ]}
        />
        {panel === "book" ? (
          world.queue.length === 0 ? (
            <Empty icon={<ListOrdered size={20} strokeWidth={1.6} />} title="Черга порожня" text="Виставити орбіту на продаж може кожен власник. Купують завжди першу." />
          ) : (
            <>
              <p className="ex-hint">Купують завжди першу в черзі за ціною дня.</p>
              <ol className="ex-book">
                {world.queue.slice(0, 12).map((row, index) => {
                  const owner = world.accounts.find((account) => account.id === row.userId);
                  const mine = row.userId === user.id;
                  return (
                    <li key={row.id} className="ex-book-row" data-first={index === 0 ? "1" : "0"} data-mine={mine ? "1" : "0"}>
                      <span className="ex-pos">{index + 1}</span>
                      <Avatar id={row.userId} name={owner?.name ?? "?"} size={30} me={mine} />
                      <span className="ex-who">
                        <b>{no(row.orbitId)}</b>
                        <small>{mine ? "ти" : owner?.name ?? "хтось"} · {ago(row.createdAt, world.now)}</small>
                        <TrustLine t={trust?.[row.userId]} />
                      </span>
                      {index === 0 ? <span className="ex-next">наступна</span> : null}
                      <span className="ex-px">{fmt.format(world.price)} ✦</span>
                    </li>
                  );
                })}
              </ol>
              {world.queue.length > 12 ? <p className="orbit-note">І ще {world.queue.length - 12}</p> : null}
            </>
          )
        ) : null}
        {panel === "trades" ? (
          world.trades.length === 0 ? (
            <Empty icon={<ArrowLeftRight size={20} strokeWidth={1.6} />} title="Угод ще не було" text="Перша угода з’явиться тут одразу після купівлі." />
          ) : (
            <ul className="ex-trades">
              {world.trades
                .slice(-12)
                .reverse()
                .map((trade, index) => (
                  <li key={`${trade.at}-${trade.orbitId}-${index}`}>
                    <span className="ex-trade-ico" aria-hidden><ArrowLeftRight size={14} strokeWidth={2} /></span>
                    <span className="ex-who">
                      <b>{no(trade.orbitId)}</b>
                      <small>{clock(trade.at)}</small>
                    </span>
                    <span className="ex-px">{spk(trade.amount)}</span>
                  </li>
                ))}
            </ul>
          )
        ) : null}
        {panel === "mine" ? (
          mineAll.length === 0 ? (
            <Empty icon={<OrbitIcon size={20} strokeWidth={1.6} />} title="У тебе ще немає орбіт" text="Купи першу з черги або запусти власну на вкладці «Заявка»." />
          ) : (
            <ul className="ex-trades">
              {mineAll.map((orbit) => {
                const at = myListings.find(({ row }) => row.orbitId === orbit.id);
                return (
                  <li key={orbit.id}>
                    <span className="ex-trade-ico" data-on={at ? "1" : "0"} aria-hidden><OrbitIcon size={14} strokeWidth={2} /></span>
                    <span className="ex-who">
                      <b>{no(orbit.id)}</b>
                      <small>{at ? `у черзі, місце ${at.index + 1}` : `тримаєш ${Math.max(0, Math.floor((world.now - orbit.createdAt) / DAY_MS))} д`}</small>
                    </span>
                    {at ? (
                      at.index > 0 ? (
                        <button type="button" className="k-ghost ex-mini" onClick={() => useOrbits.getState().cancel(orbit.id)}>Зняти</button>
                      ) : (
                        <span className="ex-next">купують наступною</span>
                      )
                    ) : (
                      <button type="button" className="k-tonal ex-mini" disabled={pendingMail} onClick={() => setConfirm({ kind: "sell", orbitId: orbit.id })}>Продати</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </section>

      <Soon />

      {confirm ? (
        <ConfirmSheet
          world={world}
          user={user}
          confirm={confirm}
          busy={busy}
          onClose={() => setConfirm(null)}
          onBuy={(price) => run(() => useOrbits.getState().buy(price))}
          onSell={(orbitId) => run(() => useOrbits.getState().list(orbitId))}
        />
      ) : null}
    </div>
  );
}

export function ConfirmSheet({
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
  onBuy: (price: number) => void;
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
          <p className="orbit-kicker">Купити першу орбіту з черги</p>
          <h2 className="orbit-h">{oldest ? no(oldest.orbitId) : "—"}</h2>
          <div className="ex-lines">
            <div><span>Ціна дня</span><b>{sparks(price)}</b></div>
            <div><span>Баланс зараз</span><b>{sparks(user.balance)}</b></div>
            <div><span>Баланс після</span><b data-bad={short ? "1" : "0"}>{short ? `бракує ${sparks(-after)}` : sparks(after)}</b></div>
            <div><span>Стабільність</span><b>+1</b></div>
          </div>
          <p className="orbit-note">Ціна одна для всіх і міняється о 00:00 UTC. Тестовий режим.</p>
          <button type="button" className="orbit-go k-go" disabled={busy || short || !oldest} onClick={() => onBuy(price)}>
            {busy ? <><span className="k-spin" aria-hidden /> Купуємо…</> : `Купити за ${spk(price)}`}
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
        <button type="button" className="orbit-go k-go" disabled={busy} onClick={() => onSell(confirm.orbitId)}>
          {busy ? <><span className="k-spin" aria-hidden /> Ставимо…</> : "Поставити в чергу"}
        </button>
        <button type="button" className="orbit-quiet" onClick={onClose}>Скасувати</button>
      </div>
    </div>
  );
}

const SOON = [
  { title: "Ввід гривні", text: "Купівля іскор за гривні. Зараз лише тестове поповнення.", icon: <Landmark size={18} strokeWidth={1.8} /> },
  { title: "Вивід на картку", text: "Після юридичної перевірки. Без обіцянок доходу.", icon: <CreditCard size={18} strokeWidth={1.8} /> },
  { title: "Обмін P2P", text: "Власна ціна в оголошенні, угоди між людьми.", icon: <Users size={18} strokeWidth={1.8} /> },
];

/** «Скоро»: чесна дорожня карта. Без функцій, без дат. */
export function Soon() {
  return (
    <section className="ex-soon orbit-block" aria-labelledby="ex-soon-title">
      <h2 id="ex-soon-title" className="ex-h">Скоро</h2>
      {SOON.map((item) => (
        <div key={item.title} className="ex-soon-row">
          <span className="ex-soon-ico" aria-hidden>{item.icon}</span>
          <div>
            <b>{item.title}</b>
            <p className="orbit-note">{item.text}</p>
          </div>
          <span className="k-soon">У розробці</span>
        </div>
      ))}
    </section>
  );
}

/** 20: показники довіри продавця. Лише показ — жодних порогів чи обмежень. */
function TrustLine({ t }: { t?: Trust }) {
  if (!t) return null;
  if (!t.listed) return <span className="ex-trust" data-new="1">Новий продавець · угод ще не було</span>;
  const avg = t.avgMs == null ? null : t.avgMs < 3_600_000 ? `${Math.max(1, Math.round(t.avgMs / 60_000))} хв` : t.avgMs < 86_400_000 ? `${Math.round(t.avgMs / 3_600_000)} год` : `${Math.round(t.avgMs / 86_400_000)} д`;
  return (
    <span className="ex-trust" aria-label={`Продавець: виконано ${t.done ?? 0}%, середній час ${avg ?? "невідомо"}, угод за 30 днів ${t.d30}, різних покупців ${t.peers}`}>
      <i>{t.done ?? 0}% виконано</i>
      {avg ? <i>≈ {avg}</i> : null}
      <i>{t.d30} за 30 д</i>
      <i>{t.peers} покупц{t.peers === 1 ? "ь" : t.peers >= 2 && t.peers <= 4 ? "і" : "ів"}</i>
    </span>
  );
}
