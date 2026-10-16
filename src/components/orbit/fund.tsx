/** «Фонд» v8: відлік до поділу, твоя частка з розкладом, стовпчики виплат, плитки, списки з аватарами, як це працює. */
import { useMemo, useState } from "react";
import { CalendarClock, Coins, Gift, HandCoins, Hourglass, Percent, Scale, Users } from "lucide-react";
import { DAY_MS, FUND_PERIOD_MS, FUND_SHARE, holdBonus, previewShare, type Account, type World } from "@/lib/orbit/engine";
import { sumPerDay } from "@/lib/orbit/series";
import { useCountUp } from "@/lib/orbit/count-up";
import { Avatar, Change, Empty, Progress, SectionHead, Segmented, Stat } from "@/components/orbit/ui/kit";

const fmt = new Intl.NumberFormat("uk-UA");
const TIERS = [
  { days: 7, bonus: 0.1 },
  { days: 14, bonus: 0.25 },
  { days: 30, bonus: 0.5 },
];

function leftLong(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d} д ${h % 24} год`;
  if (h >= 1) return `${h} год ${m % 60} хв`;
  return `${m} хв`;
}
function day(ms: number) {
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Kyiv" }).format(ms);
}

function Ring({ value, children }: { value: number; children: React.ReactNode }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="fd-ring">
      <svg viewBox="0 0 108 108" aria-hidden>
        <defs>
          <linearGradient id="fd-ring-g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--aurora)" />
            <stop offset="1" stopColor="var(--sun)" />
          </linearGradient>
        </defs>
        <circle cx="54" cy="54" r={r} className="fd-ring-track" />
        <circle cx="54" cy="54" r={r} className="fd-ring-fill" stroke="url(#fd-ring-g)" strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
      </svg>
      <div>{children}</div>
    </div>
  );
}

export function Fund({ world, user }: { world: World; user: Account }) {
  const [list, setList] = useState<"last" | "mine">("last");
  const fund = useCountUp(world.fund);
  const due = world.lastDistributionAt + FUND_PERIOD_MS;
  const passed = Math.min(1, Math.max(0, (world.now - world.lastDistributionAt) / FUND_PERIOD_MS));
  const share = previewShare(world, user.id);
  const active = world.accounts.filter((account) => world.now - account.lastActiveAt <= FUND_PERIOD_MS);
  const inPool = active.some((account) => account.id === user.id);
  const mine = world.orbits.filter((orbit) => orbit.ownerId === user.id);
  const held = mine.reduce((best, orbit) => Math.max(best, world.now - orbit.createdAt), 0);
  const bonus = holdBonus(held);
  const heldDays = Math.floor(held / DAY_MS);
  const next = TIERS.find((tier) => heldDays < tier.days);
  const bars = useMemo(() => sumPerDay(world.payouts, world.now, 14), [world.payouts, world.now]);
  const top = Math.max(1, ...bars);
  const today = world.trades.filter((trade) => trade.at >= world.now - DAY_MS).reduce((sum, trade) => sum + Math.floor(trade.amount * FUND_SHARE), 0);
  const totalPaid = world.payouts.reduce((sum, row) => sum + row.amount, 0);
  const lastAt = world.payouts[0]?.at ?? 0;
  const last = world.payouts.filter((row) => row.at === lastAt);
  const minePaid = world.payouts.filter((row) => row.userId === user.id);
  const rows = list === "last" ? last : minePaid;

  return (
    <div className="orbit-stack fd">
      <section className="orbit-block fd-hero" aria-labelledby="fd-title">
        <div className="fd-hero-top">
          <div>
            <h2 id="fd-title" className="orbit-kicker">Фонд світу</h2>
            <p className="fd-big">{fmt.format(fund)}<span> ✦</span></p>
            <Change abs={today} suffix="за 24 год" />
          </div>
          <Ring value={passed}>
            <small>поділ через</small>
            <b>{leftLong(due - world.now)}</b>
          </Ring>
        </div>
        <Progress value={Math.round(passed * 100)} max={100} label="Скільки минуло до поділу" tone="aurora" />
        <p className="ex-hint">Поділ раз на 3 дні · наступний {day(due)}. З кожної угоди {String(Math.round(FUND_SHARE * 1000) / 10).replace(".", ",")}% іде у фонд.</p>
      </section>

      <section className="orbit-block fd-share" aria-labelledby="fd-share-title">
        <SectionHead id="fd-share-title" title="Твоя частка зараз" />
        <div className="fd-share-num">
          <b>≈ {fmt.format(share)} ✦</b>
          <span className="mn-tag" data-tone={inPool ? "aurora" : "mars"}>{inPool ? "ти в поділі" : "неактивний 3+ дні"}</span>
        </div>
        <ul className="fd-parts">
          <li><Scale size={15} strokeWidth={2} aria-hidden /><span>70% фонду — порівну між {active.length} активними</span></li>
          <li><Users size={15} strokeWidth={2} aria-hidden /><span>30% — за стабільність (у тебе {fmt.format(user.stability)}), удвічі більше, якщо був онлайн за добу</span></li>
          <li><Gift size={15} strokeWidth={2} aria-hidden /><span>Бонус тримання орбіти: {bonus ? `+${Math.round(bonus * 100)}%` : "поки 0%"}</span></li>
        </ul>
        {mine.length ? (
          next ? (
            <div className="fd-tier">
              <div className="ex-supply-row"><span>Тримаєш {heldDays} д</span><span>до +{Math.round(next.bonus * 100)}% — {next.days - heldDays} д</span></div>
              <Progress value={heldDays} max={next.days} label="До наступного бонусу тримання" />
            </div>
          ) : (
            <p className="ex-hint">Максимальний бонус тримання +50% уже твій.</p>
          )
        ) : (
          <p className="ex-hint">Тримай орбіту 7, 14 чи 30 днів — бонус +10%, +25% чи +50% до частки.</p>
        )}
      </section>

      <div className="k-grid2">
        <Stat icon={<HandCoins size={16} strokeWidth={2} />} tone="aurora" value={`${fmt.format(totalPaid)} ✦`} label="виплачено всього" />
        <Stat icon={<Users size={16} strokeWidth={2} />} tone="ion" value={fmt.format(active.length)} label="учасників у поділі" />
        <Stat icon={<CalendarClock size={16} strokeWidth={2} />} tone="nebula" value={fmt.format(world.payouts.length)} label="останніх виплат" />
        <Stat icon={<Percent size={16} strokeWidth={2} />} value={`${String(Math.round(FUND_SHARE * 1000) / 10).replace(".", ",")}%`} label="з кожної угоди у фонд" />
      </div>

      <section className="orbit-block" aria-labelledby="fd-bars-title">
        <SectionHead id="fd-bars-title" title="Виплати за 14 днів" />
        {bars.some((v) => v > 0) ? (
          <div className="fd-bars" role="img" aria-label={`Виплати за 14 днів: всього ${fmt.format(bars.reduce((a, b) => a + b, 0))} іскор`}>
            {bars.map((v, i) => (
              <span key={i} data-on={v > 0 ? "1" : "0"} style={{ height: `${Math.max(4, (v / top) * 100)}%` }} title={`${v} ✦`} />
            ))}
          </div>
        ) : (
          <Empty icon={<Coins size={20} strokeWidth={1.6} />} title="Виплат ще не було" text={`Перший поділ через ${leftLong(due - world.now)}.`} />
        )}
        <div className="pc-axis" aria-hidden><span>14 днів тому</span><span>сьогодні</span></div>
      </section>

      <section className="orbit-block fd-list" aria-labelledby="fd-list-title">
        <h2 id="fd-list-title" className="visually-hidden">Виплати</h2>
        <Segmented label="Список виплат" value={list} onChange={setList} options={[{ id: "last", label: "Останній поділ" }, { id: "mine", label: `Мої · ${minePaid.length}` }]} />
        {rows.length === 0 ? (
          <Empty icon={<Hourglass size={20} strokeWidth={1.6} />} title={list === "mine" ? "Твоїх виплат ще немає" : "Поділів ще не було"} text="Будь активним — фонд ділиться між тими, хто заходив за останні 3 дні." />
        ) : (
          <ul className="ex-trades">
            {rows.slice(0, 10).map((row, i) => {
              const who = world.accounts.find((account) => account.id === row.userId);
              return (
                <li key={`${row.at}-${row.userId}-${i}`}>
                  <Avatar id={row.userId} name={who?.name ?? "?"} size={30} me={row.userId === user.id} />
                  <span className="ex-who">
                    <b>{row.userId === user.id ? "Ти" : who?.name ?? "хтось"}</b>
                    <small>{day(row.at)}</small>
                  </span>
                  <span className="ex-px fd-plus">+{fmt.format(row.amount)} ✦</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
