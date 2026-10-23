/** Замовлення пакетів ✦ (чисті функції): відкрити, зарахувати після підписаного вебхука. Журнал — topups у документі світу. */
import { trimTopups, type Topup } from "./access";
import type { World } from "./engine";
import { productGrant, SELLABLE, type Order, type ProductId } from "./checkout";
import { STARTER } from "./shop";
import { creditTopup } from "./stripe";

const paidBy = (topups: Topup[], userId: string) => topups.filter((t) => t.userId === userId && t.status === "paid" && t.provider);

export function firstDone(topups: Topup[], userId: string) {
  return paidBy(topups, userId).some((t) => t.product?.startsWith("p"));
}

export function openOrder(world: World, topups: Topup[], userId: string, product: string, id: string, now: number): { order: Order; topups: Topup[] } | { error: string } {
  if (!world.accounts.some((a) => a.id === userId)) return { error: "Спершу увійди." };
  if (!SELLABLE.includes(product as ProductId)) return { error: "Такого пакета немає." };
  if (product === STARTER.id && paidBy(topups, userId).some((t) => t.product === STARTER.id)) return { error: "Стартовий набір уже твій — він один на людину." };
  const g = productGrant(product as ProductId, firstDone(topups, userId));
  if (!g) return { error: "Такого пакета немає." };
  const order: Order = { id, userId, product: product as ProductId, usdCents: Math.round(g.usd * 100), spark: g.spark, bonus: g.bonus, status: "open", provider: "xsolla", providerRef: id, at: now };
  const open = topups.filter((t) => t.status === "open" && t.userId === userId && t.provider).slice(-4);
  const rest = topups.filter((t) => !(t.status === "open" && t.userId === userId && t.provider));
  return { order, topups: [...rest, ...open, { id, userId, amount: g.spark + g.bonus, status: "open", at: now, product, usdCents: order.usdCents, provider: "xsolla" }] };
}

export function creditOrder(world: World, topups: Topup[], orderId: string, usdCents: number): { world: World; topups: Topup[]; error?: string; notice?: string } {
  const row = topups.find((t) => t.id === orderId && t.provider);
  if (!row) return { world, topups, error: "Замовлення не знайдено." };
  if (row.status === "paid") return { world, topups, notice: "Вже зараховано." };
  if (row.usdCents !== usdCents) return { world, topups, error: "Сума не збігається." };
  const done = creditTopup(world, topups, { id: row.id, userId: row.userId, amount: row.amount });
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
