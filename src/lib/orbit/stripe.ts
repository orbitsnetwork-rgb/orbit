import { createHmac, timingSafeEqual } from "node:crypto";
import { trimTopups, type Topup } from "@/lib/orbit/access";
import type { World } from "@/lib/orbit/engine";

export const TOPUP_AMOUNTS = [100, 500, 1000] as const;

export function testKey() {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  return key.startsWith("sk_test_") ? key : "";
}

export function amountOk(value: number) {
  return (TOPUP_AMOUNTS as readonly number[]).includes(value);
}

/** Stripe ніколи не тримає нас довше за STRIPE_TIMEOUT_MS (аудит K3). */
export const STRIPE_TIMEOUT_MS = 8000;
async function stripeFetch(url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(STRIPE_TIMEOUT_MS) });
  } catch {
    return null;
  }
}

export async function openCheckout(userId: string, amount: number, origin: string) {
  const key = testKey();
  if (!key) return { error: "Тестове поповнення ще не підключено." as const };
  if (!amountOk(amount)) return { error: "Сума 100, 500 або 1000 ОД." as const };
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", `${origin}/?topup={CHECKOUT_SESSION_ID}`);
  body.set("cancel_url", `${origin}/`);
  body.set("client_reference_id", userId);
  body.set("metadata[userId]", userId);
  body.set("metadata[amountOd]", String(amount));
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][unit_amount]", String(amount));
  body.set("line_items[0][price_data][product_data][name]", `${amount} ОД`);
  const response = await stripeFetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response) return { error: "Stripe не відповів вчасно. Спробуй ще раз." as const };
  const json = (await response.json()) as { id?: string; url?: string; livemode?: boolean; error?: { message?: string } };
  if (json.livemode) return { error: "Бойовий режим заборонено." as const };
  if (!response.ok || !json.id || !json.url) return { error: "Stripe не відкрив оплату." as const };
  return { id: json.id, url: json.url };
}

export async function readCheckout(sessionId: string) {
  const key = testKey();
  if (!key) return { error: "Тестове поповнення ще не підключено." as const };
  if (!sessionId.startsWith("cs_")) return { error: "Невідома оплата." as const };
  const response = await stripeFetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response) return { error: "Stripe не відповів вчасно. Спробуй ще раз." as const };
  const json = (await response.json()) as {
    id?: string;
    livemode?: boolean;
    payment_status?: string;
    amount_total?: number;
    metadata?: { userId?: string; amountOd?: string };
  };
  if (!response.ok || !json.id) return { error: "Оплату не знайдено." as const };
  if (json.livemode) return { error: "Бойовий режим заборонено." as const };
  if (json.payment_status !== "paid") return { error: "Оплату ще не завершено." as const };
  const amount = Number(json.metadata?.amountOd);
  if (!amountOk(amount) || json.amount_total !== amount) return { error: "Сума не збіглася." as const };
  if (!json.metadata?.userId?.startsWith("u-")) return { error: "Оплата без імені." as const };
  return { id: json.id, userId: json.metadata.userId, amount };
}

/** Стільки ж записів, скільки тримає рушій у note(): поповнення не має обрізати спільний журнал. */
const LOG_KEEP = 40;

export function creditTopup(world: World, topups: Topup[], paid: { id: string; userId: string; amount: number }) {
  if (topups.some((row) => row.id === paid.id && row.status === "paid")) {
    return { world, topups, notice: "Вже зараховано." };
  }
  if (!world.accounts.some((account) => account.id === paid.userId)) {
    return { world, topups, error: "Імені немає." };
  }
  const accounts = world.accounts.map((account) =>
    account.id === paid.userId ? { ...account, balance: account.balance + paid.amount, toppedUp: (account.toppedUp ?? 0) + paid.amount } : account,
  );
  const next = [
    ...topups.filter((row) => row.id !== paid.id),
    { id: paid.id, userId: paid.userId, amount: paid.amount, status: "paid" as const, at: Date.now() },
  ];
  const log = [{ at: Date.now(), text: `Поповнення ${paid.amount} ОД.` }, ...world.log].slice(0, LOG_KEEP);
  return { world: { ...world, accounts, log }, topups: trimTopups(next), notice: `Зараховано ${paid.amount} ОД.` };
}

export function signedEvent(raw: string, header: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret || !header) return null;
  const pairs = header.split(",").map((part) => part.split("="));
  const time = pairs.find((pair) => pair[0] === "t")?.[1];
  const signatures = pairs.filter((pair) => pair[0] === "v1").map((pair) => pair[1]);
  if (!time || signatures.length === 0) return null;
  if (Math.abs(Date.now() / 1000 - Number(time)) > 300) return null;
  const expected = createHmac("sha256", secret).update(`${time}.${raw}`).digest("hex");
  const left = Buffer.from(expected);
  const match = signatures.some((value) => {
    const right = Buffer.from(value);
    return left.length === right.length && timingSafeEqual(left, right);
  });
  if (!match) return null;
  try {
    return JSON.parse(raw) as { type?: string; data?: { object?: Record<string, unknown> } };
  } catch {
    return null;
  }
}
