/** Головна v8: гаманець з діями, ціна з графіком-спарклайном, банери, «Ринок», «Активність». */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeftRight, Check, Coins, Eye, EyeOff, GraduationCap, Hourglass, Landmark, ListOrdered, Orbit as OrbitIcon, Plus, QrCode, Rocket, Share2, Trophy } from "lucide-react";
import { DAY_MS, FUND_PERIOD_MS, activeCreation, type Account, type World } from "@/lib/orbit/engine";
import { LESSONS } from "@/lib/orbit/learn";
import { MASK, useHidden } from "@/lib/orbit/prefs";
import { dayDelta, perDay, priceSeries, sumPerDay } from "@/lib/orbit/series";
import { useCountUp } from "@/lib/orbit/count-up";
import type { Route } from "@/components/orbit/more";
import { ActionRow, Carousel, Change, SectionHead, Sparkline, type Banner } from "@/components/orbit/ui/kit";
import { Feed } from "@/components/orbit/ui/feed";
import { useOrbits } from "@/lib/orbit/store";

const fmt = new Intl.NumberFormat("uk-UA");
export type HomeTab = "home" | "market" | "mine" | "flow" | "me";

function leftShort(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d} д ${h % 24} год`;
  if (h >= 1) return `${h} год ${m % 60} хв`;
  return `${m} хв`;
}

/** Картка гаманця: баланс з «оком», скільки це орбіт, і чотири швидкі дії. */
export function Wallet({ world, user, onTab, onTopup }: { world: World; user: Account; onTab: (tab: HomeTab) => void; onTopup: () => void }) {
  const [hidden, toggle] = useHidden();
  const shown = useCountUp(user.balance);
  const mine = world.orbits.filter((orbit) => orbit.ownerId === user.id).length;
  const creation = activeCreation(world, user.id);
  const canShare = creation?.status === "collecting";
  return (
    <section className="orbit-block hm-wallet" aria-labelledby="hm-wallet-title">
      <div className="hm-wallet-head">
        <h2 id="hm-wallet-title">Мій баланс</h2>
        <button type="button" className="hm-eye" aria-pressed={hidden} aria-label={hidden ? "Показати баланс" : "Приховати баланс"} onClick={toggle}>
          {hidden ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
        </button>
        <span className="hm-test">Тест</span>
      </div>
      <p className="hm-bal" aria-live="polite">
        {hidden ? MASK : fmt.format(shown)}
        <span> ✦</span>
      </p>
      <p className="hm-bal-sub">
        {hidden ? "Баланс приховано на цьому телефоні" : <>Тестові іскри · орбіт у тебе: {fmt.format(mine)} · стабільність {fmt.format(user.stability)}</>}
      </p>
      <ActionRow
        label="Швидкі дії"
        items={[
          { id: "act-buy", label: "Купити ✦", icon: <Plus size={20} strokeWidth={2} />, onClick: onTopup, tone: "sun", hint: "Тестове поповнення іскор" },
          { id: "act-launch", label: creation ? "Мій запуск" : "Запустити", icon: <Rocket size={20} strokeWidth={1.8} />, onClick: () => onTab("mine"), tone: "nebula" },
          { id: "act-swap", label: "Обмін", icon: <ArrowLeftRight size={20} strokeWidth={1.8} />, onClick: () => onTab("market"), tone: "ion" },
          { id: "act-share", label: "Код", icon: canShare ? <Share2 size={20} strokeWidth={1.8} /> : <QrCode size={20} strokeWidth={1.8} />, onClick: () => onTab("mine"), tone: "aurora", hint: canShare ? "Поділитися кодом підтвердження" : "Ввести чи створити код підтвердження" },
        ]}
      />
    </section>
  );
}

/** Чи людина ще нічого не почала: немає ні орбіти, ні запуску. */
export function isNewcomer(world: World, user: Account) {
  return !world.orbits.some((orbit) => orbit.ownerId === user.id) && !world.creations.some((item) => item.userId === user.id);
}

/**
 * Перший крок новачка — над гаманцем. Дві дії, з яких починаються Орбіти:
 * підтвердити запуск друга його кодом або почати власний запуск.
 */
export function FirstStep({ onTab, busy = false }: { onTab: (tab: HomeTab) => void; busy?: boolean }) {
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const digits = code.replace(/\D/g, "").slice(0, 6);
  return (
    <section className="orbit-block hm-first" aria-labelledby="hm-first-title">
      <div className="hm-first-head">
        <p className="orbit-kicker">Перший крок</p>
        <h2 id="hm-first-title">З чого почати</h2>
        <p>Орбіти запускають люди разом: 8 підтверджень і 24 години заряду.</p>
      </div>
      <form
        className="hm-first-step"
        onSubmit={async (event) => {
          event.preventDefault();
          if (digits.length !== 6 || sending) return;
          setSending(true);
          try {
            await useOrbits.getState().accept(digits);
            if (!useOrbits.getState().bad) setCode("");
          } finally {
            setSending(false);
          }
        }}
      >
        <b><span className="hm-first-num" aria-hidden>1</span>Підтвердь друга</b>
        <small>Друг надіслав 6 цифр або посилання? Введи код — його запуск стане ближчим, а тобі +40 ✦.</small>
        <div className="hm-first-code">
          <input
            className="orbit-field"
            value={digits}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            aria-label="Код підтвердження з 6 цифр"
            onChange={(event) => setCode(event.target.value)}
          />
          <button type="submit" className="orbit-go k-go" disabled={digits.length !== 6 || sending || busy}>
            <Check size={18} strokeWidth={2.2} aria-hidden /> Підтвердити
          </button>
        </div>
      </form>
      <div className="hm-first-step">
        <b><span className="hm-first-num" aria-hidden>2</span>Почни запуск</b>
        <small>Відкрий власну заявку й поділися кодом з вісьмома людьми. Перша орбіта — приблизно за 4 дні.</small>
        <button
          type="button"
          className="orbit-go k-go"
          disabled={busy}
          onClick={async () => {
            await useOrbits.getState().start();
            onTab("mine");
          }}
        >
          <Rocket size={18} strokeWidth={2} aria-hidden /> Почати запуск
        </button>
      </div>
    </section>
  );
}

/** Невелика пара «спарклайн + зміна» для героя ціни. */
export function PriceMini({ world }: { world: World }) {
  const s = useMemo(() => priceSeries(world.trades, world.price, world.now, "7d"), [world.trades, world.price, world.now]);
  return (
    <div className="hm-mini">
      <Sparkline values={s.points.map((p) => p.v)} tone={s.change > 0 ? "up" : s.change < 0 ? "down" : "sun"} width={84} height={26} label={`Ціна за 7 днів: від ${fmt.format(s.lo)} до ${fmt.format(s.hi)} іскор`} />
      <Change pct={s.change} suffix="7Д" />
    </div>
  );
}

type MarketRow = { id: string; icon: ReactNode; title: string; sub: string; value: string; series: number[]; chip: ReactNode; tone: "sun" | "up" | "down" | "ion" | "nebula"; tab: HomeTab };

/** «Ринок»: живі показники з даних світу, кожен — зі спарклайном за 14 днів і зміною. */
export function Markets({ world, onTab }: { world: World; onTab: (tab: HomeTab) => void }) {
  const rows = useMemo<MarketRow[]>(() => {
    const now = world.now;
    const price = priceSeries(world.trades, world.price, now, "30d");
    const minted = perDay(world.orbits.map((o) => o.createdAt), now);
    let run = world.orbits.length - minted.reduce((a, b) => a + b, 0);
    const supply = minted.map((n) => (run += n));
    const deals = perDay(world.trades.map((t) => t.at), now);
    const listed = perDay(world.queue.map((q) => q.createdAt), now);
    const paid = sumPerDay(world.payouts, now);
    const recent = world.trades.filter((t) => t.at >= now - DAY_MS).length;
    return [
      { id: "price", icon: <OrbitIcon size={18} strokeWidth={1.8} />, title: "Орбіта", sub: "ціна дня", value: `${fmt.format(world.price)} ✦`, series: price.points.map((p) => p.v), chip: <Change pct={price.change} suffix="30Д" />, tone: price.change > 0 ? "up" : price.change < 0 ? "down" : "sun", tab: "market" },
      { id: "supply", icon: <Landmark size={18} strokeWidth={1.8} />, title: "Випуск", sub: "орбіт у світі", value: fmt.format(world.orbits.length), series: supply, chip: <Change abs={minted[minted.length - 1]} suffix="сьогодні" />, tone: "nebula", tab: "market" },
      { id: "deals", icon: <ArrowLeftRight size={18} strokeWidth={1.8} />, title: "Угоди", sub: "за 24 год", value: fmt.format(recent), series: deals, chip: <Change abs={dayDelta(deals)} suffix="за добу" />, tone: "ion", tab: "market" },
      { id: "queue", icon: <ListOrdered size={18} strokeWidth={1.8} />, title: "Черга", sub: "на продаж", value: fmt.format(world.queue.length), series: listed, chip: <Change abs={listed[listed.length - 1]} suffix="нових" />, tone: "sun", tab: "market" },
      { id: "fund", icon: <Coins size={18} strokeWidth={1.8} />, title: "Фонд", sub: "до поділу", value: `${fmt.format(world.fund)} ✦`, series: paid, chip: <Change abs={paid[paid.length - 1]} suffix="виплачено" />, tone: "up", tab: "flow" },
    ];
  }, [world]);
  return (
    <ul className="hm-mk">
      {rows.map((row) => (
        <li key={row.id}>
          <button type="button" onClick={() => onTab(row.tab)} aria-label={`${row.title}, ${row.sub}: ${row.value}. Відкрити`}>
            <span className="hm-mk-ico" data-tone={row.tone} aria-hidden>{row.icon}</span>
            <span className="hm-mk-name">
              <b>{row.title}</b>
              <small>{row.sub}</small>
            </span>
            <Sparkline values={row.series} tone={row.tone} width={64} height={24} />
            <span className="hm-mk-val">
              <b>{row.value}</b>
              {row.chip}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Банери: навчання, лідер рейтингу, поділ фонду, перша орбіта, «Скоро». */
export function Banners({ world, user, onTab, onOpen }: { world: World; user: Account; onTab: (tab: HomeTab) => void; onOpen: (route: Route) => void }) {
  const items = useMemo<Banner[]>(() => {
    const ranked = [...world.accounts].sort((a, b) => b.stability - a.stability || a.createdAt - b.createdAt);
    const leader = ranked[0];
    const place = ranked.findIndex((row) => row.id === user.id) + 1;
    const due = world.lastDistributionAt + FUND_PERIOD_MS;
    const creation = activeCreation(world, user.id);
    const out: Banner[] = [];
    if (!creation) out.push({ id: "launch", kicker: "Запуск", title: "Перша орбіта — приблизно за 4 дні", text: "8 підтверджень від людей і 24 години заряду. Почни зараз — коди можна пересилати посиланням.", cta: "Почати запуск", icon: <Rocket size={44} strokeWidth={1.3} />, tone: "nebula", onClick: () => onTab("mine") });
    out.push({ id: "learn", kicker: `Навчання · ${LESSONS.length} уроків`, title: "Як працює орбіта", text: "Короткі уроки з тестом наприкінці: ціна дня, черга, фонд і заряд.", cta: "Почати урок", icon: <GraduationCap size={44} strokeWidth={1.3} />, tone: "ion", onClick: () => onOpen("learn") });
    if (leader && leader.stability > 0) out.push({ id: "leader", kicker: "Рейтинг", title: `Лідер стабільності — ${leader.name}`, text: `${leader.stability} стабільності. ${place ? `Ти на ${place} місці з ${ranked.length}.` : ""}`, cta: "Весь рейтинг", icon: <Trophy size={44} strokeWidth={1.3} />, tone: "sun", onClick: () => onOpen("leaders") });
    out.push({ id: "fund", kicker: "Фонд", title: `Поділ через ${leftShort(due - world.now)}`, text: `У фонді ${fmt.format(world.fund)} ✦. Він ділиться між активними учасниками.`, cta: "До фонду", icon: <Hourglass size={44} strokeWidth={1.3} />, tone: "aurora", onClick: () => onTab("flow") });
    out.push({ id: "soon", kicker: "Дорожня карта", title: "Ввід гривні й вивід на картку", text: "Після юридичної перевірки. Зараз — лише тестові іскри, без справжніх грошей.", cta: "У розробці", icon: <Landmark size={44} strokeWidth={1.3} />, tone: "nebula", soon: true });
    return out;
  }, [world, user.id, onTab, onOpen]);
  return <Carousel items={items} label="Оголошення" />;
}

export function Activity({ world, user, onOpen }: { world: World; user: Account; onOpen: (route: Route) => void }) {
  return (
    <section className="orbit-block hm-feed" aria-labelledby="hm-feed-title">
      <SectionHead id="hm-feed-title" title="Активність" action="Усі" onAction={() => onOpen("inbox")} />
      <Feed world={world} user={user} limit={5} />
    </section>
  );
}

export function MarketsCard({ world, onTab }: { world: World; onTab: (tab: HomeTab) => void }) {
  return (
    <section className="orbit-block hm-markets" aria-labelledby="hm-mk-title">
      <SectionHead id="hm-mk-title" title="Ринок" action="Обмін" onAction={() => onTab("market")} />
      <Markets world={world} onTab={onTab} />
    </section>
  );
}
