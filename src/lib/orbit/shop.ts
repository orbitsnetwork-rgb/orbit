/**
 * Крамниця ✦: лише вигляд і помітність. Довіру, поручительства, стабільність і місце в рейтингу купити не можна.
 * Витрачені ✦ ідуть у спільний фонд (замкнене коло: цінність лишається в ORBIT, назад у гроші ✦ не обмінюються).
 * Без лутбоксів, випадковостей і таймерів «встигни». Ціни фіксовані.
 */
import { DAY_MS, settle, type Account, type Step, type World } from "./engine";

export type StyleId = "neon" | "aurora" | "gold" | "pulse";
export type ThemeId = "nebula" | "aurora" | "deep";
export type ShopItem = { id: string; kind: "style" | "theme" | "boost"; ref: string; title: string; sub: string; price: number };

export const STYLES: { id: StyleId; title: string; sub: string; price: number }[] = [
  { id: "neon", title: "Неон", sub: "Яскравий контур у кольорі емблеми", price: 80 },
  { id: "aurora", title: "Полярне сяйво", sub: "Переливчасте кільце", price: 120 },
  { id: "gold", title: "Золото", sub: "Тепле золоте обрамлення", price: 200 },
  { id: "pulse", title: "Пульс", sub: "Кільце, що м'яко дихає", price: 250 },
];
export const THEMES: { id: ThemeId; title: string; sub: string; price: number }[] = [
  { id: "nebula", title: "Туманність", sub: "Фіолетово-рожеве небо", price: 100 },
  { id: "aurora", title: "Сяйво", sub: "Зелено-бірюзові хвилі", price: 150 },
  { id: "deep", title: "Глибокий космос", sub: "Темне небо з золотими орбітами", price: 200 },
];
export const BOOST_PRICE = 50;
export const BOOST_MS = DAY_MS;

export const ITEMS: ShopItem[] = [
  ...STYLES.map((s) => ({ id: `style:${s.id}`, kind: "style" as const, ref: s.id, title: s.title, sub: s.sub, price: s.price })),
  ...THEMES.map((t) => ({ id: `theme:${t.id}`, kind: "theme" as const, ref: t.id, title: t.title, sub: t.sub, price: t.price })),
  { id: "boost", kind: "boost", ref: "boost", title: "Просування на 24 год", sub: "Твоя картка «Шукаю орбіту» вгорі списку з позначкою «Просувається»", price: BOOST_PRICE },
];

/** Пакети ✦ за справжні гроші. Фіксований курс: 100 ✦ ≈ $0.99. Оплата вимкнена, доки немає юриста і провайдера. */
export type Pack = { id: string; usd: number; spark: number; title: string; extra?: string };
export const PACKS: Pack[] = [
  { id: "p100", usd: 0.99, spark: 100, title: "Жменя іскор" },
  { id: "p550", usd: 4.99, spark: 550, title: "Сузір'я", extra: "+10%" },
  { id: "p1200", usd: 9.99, spark: 1200, title: "Галактика", extra: "+20%" },
  { id: "p2600", usd: 19.99, spark: 2600, title: "Всесвіт", extra: "+30%" },
];
export const STARTER = { id: "starter", usd: 2.99, spark: 500, style: "neon" as StyleId, theme: "nebula" as ThemeId };
export const PLUS = { id: "plus", usdMonth: 3.99, sparkMonth: 200 };

/** Скільки ✦ дасть пакет: перша покупка будь-якого пакета — подвійна. Без таймерів: бонус діє, поки не використаний. */
export function packGrant(pack: Pack, firstDone: boolean): { spark: number; bonus: number } {
  return { spark: pack.spark, bonus: firstDone ? 0 : pack.spark };
}

export const cleanStyle = (v: unknown): StyleId | null => (STYLES.some((s) => s.id === v) ? (v as StyleId) : null);
export const cleanTheme = (v: unknown): ThemeId | null => (THEMES.some((t) => t.id === v) ? (v as ThemeId) : null);
export const cleanItem = (v: unknown): string => (ITEMS.some((i) => i.id === v) ? String(v) : "");

export function owns(account: Pick<Account, "owned">, itemId: string) {
  return (account.owned ?? []).includes(itemId);
}
export function boosted(account: Pick<Account, "boostUntil"> | undefined, now: number) {
  return Boolean(account?.boostUntil && account.boostUntil > now);
}

function patch(world: World, id: string, edit: (a: Account) => Account): World {
  return { ...world, accounts: world.accounts.map((a) => (a.id === id ? edit(a) : a)) };
}

/** Купити предмет за ✦. Спершу списується поповнена частина балансу (як у купівлі орбіти). */
export function shopBuy(world: World, itemId: string): Step {
  const base = settle(world);
  const user = base.accounts.find((a) => a.id === base.sessionId);
  if (!user) return { world, error: "Спершу увійди." };
  const item = ITEMS.find((i) => i.id === itemId);
  if (!item) return { world: base, error: "Такого в крамниці немає." };
  if (item.kind !== "boost" && owns(user, item.id)) return { world: base, error: "Це вже твоє." };
  if (item.kind === "boost" && boosted(user, base.now)) return { world: base, error: "Просування вже діє. Продовжити можна, коли закінчиться." };
  if (user.balance < item.price) return { world: base, error: `Не вистачає ✦. Потрібно ${item.price}, у тебе ${user.balance}.` };
  let next: World = { ...base, fund: base.fund + item.price };
  next = patch(next, user.id, (a) => {
    const paid = { ...a, balance: a.balance - item.price, toppedUp: Math.max(0, (a.toppedUp ?? 0) - item.price), lastActiveAt: base.now };
    if (item.kind === "boost") return { ...paid, boostUntil: base.now + BOOST_MS };
    const owned = [...(a.owned ?? []), item.id];
    return item.kind === "style" ? { ...paid, owned, wearStyle: item.ref } : { ...paid, owned, wearTheme: item.ref };
  });
  const notice = item.kind === "boost" ? "Картка просувається 24 години ✦" : `«${item.title}» тепер твоє і вже вдягнуте ✦`;
  return { world: next, notice };
}

/** Вдягнути куплене або повернути стандартний вигляд (ref = ""). */
export function shopWear(world: World, slot: "style" | "theme", ref: string): Step {
  const user = world.accounts.find((a) => a.id === world.sessionId);
  if (!user) return { world, error: "Спершу увійди." };
  if (ref && !owns(user, `${slot}:${ref}`)) return { world, error: "Спершу придбай це в крамниці." };
  return { world: patch(world, user.id, (a) => (slot === "style" ? { ...a, wearStyle: ref || undefined } : { ...a, wearTheme: ref || undefined })), notice: ref ? "Вдягнуто ✦" : "Повернуто стандартний вигляд." };
}
