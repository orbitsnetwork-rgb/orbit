/** Замовлення пакетів ✦ (чисті функції): відкрити, зарахувати після підписаного вебхука. Журнал — topups у документі світу. */
import { trimTopups, type Topup } from "./access";
import type { World } from "./engine";
import { productGrant, SELLABLE, type Order, type ProductId } from "./checkout";
import { STARTER } from "./shop";
import { creditTopup } from "./stripe";
import { DAY_LIMIT_CENTS, HOLD_CAP, MONTH_LIMIT_CENTS, MONTH_MS, QUOTE_MS, ensureSupply, gateError, quoteMicro, releasedLeft, rollSpark, type BuyGate } from "./supply";
import { DAY_MS } from "./engine";

const paidBy = (topups: Topup[], userId: string) => topups.filter((t) => t.userId === userId && t.status === "paid" && t.provider);

export function firstDone(topups: Topup[], userId: string) {
  return paidBy(topups, userId).some((t) => t.product?.startsWith("p"));
}

/** Скільки центів людина вже витратила/відкрила за останні 24 год (ліміт $100/добу). */
export function spentToday(topups: Topup[], userId: string, now: number, span = DAY_MS) {
  return topups
    .filter((t) => t.userId === userId && t.provider && t.at > now - span && (t.status === "paid" || t.at > now - QUOTE_MS))
    .reduce((s, t) => s + (t.usdCents ?? 0), 0);
}

export function openOrder(world: World, topups: Topup[], userId: string, product: string, id: string, now: number, gate: BuyGate): { order: Order; topups: Topup[] } | { error: string } {
  const me = world.accounts.find((a) => a.id === userId);
  if (!me) return { error: "Спершу увійди." };
  const ge = gateError(gate);
  if (ge) return { error: ge };
  if (!SELLABLE.includes(product as ProductId)) return { error: "Такого пакета немає." };
  if (product === STARTER.id && paidBy(topups, userId).some((t) => t.product === STARTER.id)) return { error: "Стартовий набір уже твій — він один на людину." };
  const live = rollSpark(ensureSupply({ ...world, now }));
  const saleLeft = live.supply!.sale;
  const reserved = topups.filter((t) => t.status === "open" && t.provider && t.at > now - QUOTE_MS).reduce((s, t) => s + t.amount - (t.bonus ?? 0), 0);
  const avail = Math.max(0, saleLeft - reserved);
  // Огляд (Gemini #4): відкриті замовлення не резервують денний випуск — інакше скрипт міг би «заморозити» його без оплати.
  const today = releasedLeft(live.supply!, now);
  const g = productGrant(product as ProductId, firstDone(topups, userId), quoteMicro(live.spark!.micro, avail), avail);
  if (!g) return { error: "Такого пакета немає." };
  if (avail <= 0) return { error: "Скарбниця продала всі 8 000 000 ✦." };
  if (g.spark > today) return { error: "Сьогоднішній випуск скарбниці вже розібрано. Завтра буде новий." };
  const cents = Math.round(g.usd * 100);
  if (spentToday(topups, userId, now) + cents > DAY_LIMIT_CENTS) return { error: "Ліміт — $100 на добу на людину. Спробуй завтра." };
  if (spentToday(topups, userId, now, MONTH_MS) + cents > MONTH_LIMIT_CENTS) return { error: "Ліміт — $300 за 30 днів на людину." };
  const pending = topups.filter((t) => t.userId === userId && t.status === "open" && t.provider && t.at > now - QUOTE_MS).reduce((s2, t) => s2 + t.amount, 0);
  if (me.balance + (me.starterPending ?? 0) + pending + g.spark + g.bonus > HOLD_CAP) return { error: "В одних руках може бути не більше 80 000 ✦ (1% усіх)." };
  const order: Order = { id, userId, product: product as ProductId, usdCents: cents, spark: g.spark, bonus: g.bonus, status: "open", provider: "xsolla", providerRef: id, at: now, quoteUntil: Math.min(now + QUOTE_MS, Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00.000Z`) + DAY_MS) };
  const open = topups.filter((t) => t.status === "open" && t.userId === userId && t.provider).slice(-4);
  const rest = topups.filter((t) => !(t.status === "open" && t.userId === userId && t.provider));
  return { order, topups: [...rest, ...open, { id, userId, amount: g.spark + g.bonus, bonus: g.bonus, status: "open", at: now, product, usdCents: cents, provider: "xsolla" }] };
}

export function creditOrder(world: World, topups: Topup[], orderId: string, usdCents: number): { world: World; topups: Topup[]; error?: string; notice?: string } {
  const row = topups.find((t) => t.id === orderId && t.provider);
  if (!row) return { world, topups, error: "Замовлення не знайдено." };
  if (row.status === "paid") return { world, topups, notice: "Вже зараховано." };
  if (row.usdCents !== usdCents) return { world, topups, error: "Сума не збігається." };
  const done = creditTopup(world, topups, { id: row.id, userId: row.userId, amount: row.amount, bonus: row.bonus });
  if (done.error) return { world, topups, error: done.error };
  const keep = done.topups.map((t) => (t.id === row.id ? { ...t, product: row.product, usdCents: row.usdCents, provider: row.provider } : t));
  let next = done.world;
  if (row.product === STARTER.id) {
    next = { ...next, accounts: next.accounts.map((a) => {
      if (a.id !== row.userId) return a;
      const owned = Array.from(new Set([...(a.owned ?? []), `style:${STARTER.style}`, `theme:${STARTER.theme}`]));
      return { ...a, owned, wearStyle: a.wearStyle ?? STARTER.style, wearTheme: a.wearTheme ?? STARTER.theme };
    }) };
  }
  return { world: next, topups: trimTopups(keep), notice: done.notice };
}
