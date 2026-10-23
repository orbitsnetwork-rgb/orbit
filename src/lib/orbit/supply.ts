/**
 * Економіка ✦ (spark-economy): фіксована емісія 8 000 000 ✦. Усі вони в одному кошику продажу скарбниці.
 * Нових ✦ не створюється ніколи. Нагороди свідкам і стартові бонуси — лише з фонду переробки (world.fund),
 * який наповнюють ✦, витрачені в крамниці, просування і комісії. Якщо фонд порожній — бонусів немає.
 * Інваріант: Σ(баланс + відкладені стартові) + фонд + резерв + кошик продажу = 8 000 000.
 *
 * Жива ціна (USD за 1 ✦, у мікродоларах): крива P0·M^(продано/8M) × активність
 * clamp((спалено7/видано7)^0.25, 0.9, 1.1), межі [P0, M·P0], денна поправка не більше ±3%;
 * котирування — не нижче кривої на поточну мить (quoteMicro).
 * Велика покупка рахується інтегралом кривої. Ліміт $100/добу на людину. Назад у гроші ✦ не обмінюються
 * (облік toppedUp/topups дозволяє пізніше додати вивід лише власних поповнень — коду виводу немає).
 */
import type { World } from "./engine";

export const SUPPLY_CAP = 8_000_000;
export const BASKETS = { sale: SUPPLY_CAP } as const;
/** base/since — від якого залишку і коли почався щоденний випуск (для ліміту випуску скарбниці). */
export type Supply = { sale: number; base?: number; since?: number };
/** Частка фонду, яку можна віддати однією нагородою: плавне згасання, коли фонд малий. */
export const FUND_GRANT_SHARE = 0.02;

export const P0_MICRO = 9_900; // $0.99 за 100 ✦
export const CURVE_MULT = 10; // стеля $9.90 за 100 ✦ при повному розпродажі
export const ACT_MIN = 0.9;
export const ACT_MAX = 1.1;
export const SPARK_DAILY_CAP = 0.03;
export const QUOTE_MS = 10 * 60 * 1000;
export const DAY_LIMIT_CENTS = 10_000;
export const ECON_KEEP = 60;
/** Анти-кит: місячний ліміт на людину, найбільший запас ✦ в одних руках, щоденний випуск скарбниці. */
export const MONTH_LIMIT_CENTS = 30_000;
export const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
export const HOLD_CAP = SUPPLY_CAP / 100; // 1% = 80 000 ✦
export const RELEASE_PER_DAY = SUPPLY_CAP * 0.005; // 0.5% = 40 000 ✦ на добу, непродане переходить далі

export type EconDay = { day: string; issued: number; burned: number };
export type SparkPrice = { micro: number; day: string; hist: { day: string; micro: number }[]; days: EconDay[] };

const utc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function massOfWorld(world: Pick<World, "accounts" | "fund" | "reserve">) {
  return world.accounts.reduce((s, a) => s + a.balance + (a.starterPending ?? 0), 0) + world.fund + world.reserve;
}

/** Старий світ без кошика: уже наявні ✦ вважаємо проданими/виданими раніше. */
export function supplyOf(world: World): Supply {
  if (world.supply && typeof world.supply.sale === "number") return world.supply;
  const sale = Math.max(0, SUPPLY_CAP - massOfWorld(world));
  return { sale, base: sale, since: world.now };
}

export function ensureSupply(world: World): World {
  const ok = world.supply && typeof world.supply.sale === "number" && world.spark;
  if (ok) return world;
  const spark = world.spark ?? { micro: P0_MICRO, day: utc(world.now), hist: [{ day: utc(world.now), micro: P0_MICRO }], days: [] };
  const supply = supplyOf(world);
  // Лише для e2e (PGlite): фонд порожнього світу отримує ✦ з кошика продажу, щоб перевірити бонуси. На проді змінної немає.
  const seed = typeof process !== "undefined" && !world.supply && world.accounts.length === 0 ? Math.max(0, Math.floor(Number(process.env?.ORBIT_E2E_SEED_FUND) || 0)) : 0;
  if (seed > 0) return { ...world, fund: world.fund + seed, supply: { ...supply, sale: supply.sale - seed, base: supply.sale - seed }, spark };
  return { ...world, supply, spark };
}

/** Скільки фонд може дати на запит base: не більше 2% фонду за раз (плавно згасає, коли фонд малий). */
export function fundGrant(fund: number, base: number) {
  return Math.max(0, Math.min(base, Math.floor(fund * FUND_GRANT_SHARE)));
}

function bump(world: World, field: "issued" | "burned", amount: number): World {
  if (amount <= 0) return world;
  const w = ensureSupply(world);
  const spark = w.spark!;
  const day = utc(w.now);
  const days = [...spark.days];
  const last = days[days.length - 1];
  if (last && last.day === day) days[days.length - 1] = { ...last, [field]: last[field] + amount };
  else days.push({ day, issued: 0, burned: 0, [field]: amount });
  return { ...w, spark: { ...spark, days: days.slice(-ECON_KEEP) } };
}

/** Продати ✦ з кошика (точна сума, не більше залишку). Лічиться як «видано» для активності. */
export function drawSale(world: World, want: number): { world: World; amount: number } {
  const w = ensureSupply(world);
  const left = w.supply!.sale;
  const amount = Math.max(0, Math.min(left, Math.floor(want)));
  if (amount <= 0) return { world: w, amount: 0 };
  return { world: bump({ ...w, supply: { ...w.supply!, sale: left - amount } }, "issued", amount), amount };
}

/** Взяти з фонду переробки (нагороди, стартові, бонус першої покупки). exact — до want, інакше з плавним згасанням. */
export function drawFund(world: World, want: number, opts: { exact?: boolean } = {}): { world: World; amount: number } {
  const w = ensureSupply(world);
  const amount = opts.exact ? Math.max(0, Math.min(w.fund, Math.floor(want))) : fundGrant(w.fund, want);
  if (amount <= 0) return { world: w, amount: 0 };
  return { world: bump({ ...w, fund: w.fund - amount }, "issued", amount), amount };
}

/** ✦, витрачені в крамниці (ідуть у фонд) — сигнал активності для ціни. */
export function noteBurn(world: World, amount: number): World {
  return bump(world, "burned", amount);
}

/** Звірка: має бути 0. */
export function supplyGap(world: World) {
  return massOfWorld(world) + supplyOf(world).sale - SUPPLY_CAP;
}

export function curveMicro(saleLeft: number) {
  const sold = Math.max(0, BASKETS.sale - saleLeft) / BASKETS.sale;
  return P0_MICRO * Math.pow(CURVE_MULT, sold);
}

export function activity(days: EconDay[], today: string) {
  const prev = days.filter((d) => d.day < today).slice(-7);
  const issued = prev.reduce((s, d) => s + d.issued, 0);
  const burned = prev.reduce((s, d) => s + d.burned, 0);
  if (issued <= 0) return 1;
  return Math.min(ACT_MAX, Math.max(ACT_MIN, Math.pow(Math.max(burned / issued, 0.0001), 0.25)));
}

export function targetMicro(saleLeft: number, act: number) {
  return Math.max(P0_MICRO, Math.min(P0_MICRO * CURVE_MULT, curveMicro(saleLeft) * act));
}

/** Раз на добу (UTC) — нова ціна дня, не більше ±3% від учорашньої. */
export function rollSpark(world: World): World {
  const w = ensureSupply(world);
  const spark = w.spark!;
  const day = utc(w.now);
  if (day === spark.day) return w;
  const target = targetMicro(w.supply!.sale, activity(spark.days, day));
  const prev = spark.micro;
  const micro = Math.round(Math.max(P0_MICRO, Math.min(prev * (1 + SPARK_DAILY_CAP), Math.max(prev * (1 - SPARK_DAILY_CAP), target))));
  return { ...w, spark: { ...spark, micro, day, hist: [...spark.hist, { day, micro }].slice(-ECON_KEEP) } };
}

/** Ціна для котирування: денна ціна, але не нижче кривої продажу на поточний момент (щоб у ажіотаж не продавати дешевше за криву). */
export function quoteMicro(dayMicro: number, saleLeft: number) {
  return Math.max(dayMicro, Math.round(curveMicro(saleLeft)));
}

/** Скільки ✦ за usd при поточній ціні: ціна росте всередині покупки по кривій (інтеграл). */
export function sparkForUsd(usd: number, micro: number, saleLeft: number) {
  const p = micro / 1_000_000;
  const S = BASKETS.sale;
  const k = Math.log(CURVE_MULT);
  const q = Math.round((S / k) * Math.log(1 + (usd * k) / (p * S)));
  return Math.max(0, Math.min(saleLeft, q));
}

export const usdPer100 = (micro: number) => micro / 10_000;

/** Скільки ✦ скарбниця ще може продати сьогодні: 40 000 на кожну добу від старту мінус уже продане (непродане накопичується). */
export function releasedLeft(supply: Supply, now: number) {
  const base = supply.base ?? supply.sale;
  const since = supply.since ?? now;
  const days = Math.floor(Math.max(0, now - since) / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(0, Math.min(supply.sale, days * RELEASE_PER_DAY - (base - supply.sale)));
}

/** Хто може купувати: підтверджений телефон або пошта (Google/код) + хоч один поручитель; без сигналу «кільце ботів». */
export type BuyGate = { verified: boolean; vouchers: number; ring: boolean };
export function gateError(g: BuyGate): string | null {
  if (g.ring) return "Купівлю тимчасово призупинено: система бачить ознаки групи пов'язаних акаунтів. Напиши в підтримку, якщо це помилка.";
  if (!g.verified) return "Купувати можна після підтвердження телефону або входу через Google.";
  if (g.vouchers < 1) return "Купувати можна, коли хоч одна людина підтвердила твій запуск (поручитель).";
  return null;
}
