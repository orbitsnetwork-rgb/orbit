/**
 * Оплата пакетів ✦ справжніми грошима — інтерфейс, незалежний від провайдера (готовий під Xsolla як merchant of record).
 * Вмикається, щойно є ключі провайдера: ORBIT_SHOP_PROVIDER=xsolla + XSOLLA_* у секретах Worker. Без них кнопки — «Скоро».
 * Режим тестовий (sandbox), доки не задано ORBIT_SHOP_LIVE=1.
 * Ми ніколи не бачимо і не зберігаємо дані картки: оплата відбувається на сторінці провайдера,
 * а до нас приходить лише підписане повідомлення «замовлення X оплачене».
 */
import { xsollaConf, xsollaProvider } from "./xsolla";
import { PACKS, PLUS, STARTER, packGrant, quoteSpark, type Pack } from "./shop";

export type ProductId = Pack["id"] | typeof STARTER.id | typeof PLUS.id;
export type Order = { id: string; userId: string; product: ProductId; usdCents: number; spark: number; bonus: number; status: "open" | "paid" | "refunded"; provider: string; providerRef: string; at: number; /** Ціна зафіксована до цього часу (10 хв). */ quoteUntil: number };

export interface CheckoutProvider {
  readonly id: string;
  /** Відкрити сторінку оплати провайдера; повертає адресу переходу. */
  createSession(order: Order, returnUrl: string): Promise<{ url: string; providerRef: string }>;
  /** Перевірити підпис вебхука; повертає оплачене замовлення або null. */
  verifyWebhook(body: string, headers: Record<string, string>): Promise<{ providerRef: string; paid: boolean } | null>;
}

export const SHOP_PROVIDER_FLAG = "ORBIT_SHOP_PROVIDER";
export const CHECKOUT_SOON = "Скоро. Оплату відкриємо після юридичного оформлення. Поки ✦ можна заробити в застосунку.";

/** Провайдер увімкнено лише прапорцем ORBIT_SHOP_PROVIDER і повним набором ключів. */
export function checkoutProvider(fetcher?: typeof fetch): CheckoutProvider | null {
  const id = process.env[SHOP_PROVIDER_FLAG]?.trim();
  if (id === "xsolla") {
    const conf = xsollaConf();
    return conf ? xsollaProvider(conf, fetcher) : null;
  }
  return null;
}

export function checkoutEnabled() {
  return checkoutProvider() !== null;
}

export const SELLABLE: ProductId[] = [...PACKS.map((p) => p.id), STARTER.id];

/** Що отримає людина за продукт за живою ціною (micro — мікродолари за 1 ✦, saleLeft — залишок кошика продажу). */
export function productGrant(product: ProductId, firstDone: boolean, micro: number, saleLeft: number): { usd: number; spark: number; bonus: number } | null {
  const pack = PACKS.find((p) => p.id === product);
  if (pack) return { usd: pack.usd, ...packGrant(pack, firstDone, micro, saleLeft) };
  if (product === STARTER.id) return { usd: STARTER.usd, spark: quoteSpark(STARTER.usd, STARTER.extraPct, micro, saleLeft), bonus: 0 };
  return null;
}
