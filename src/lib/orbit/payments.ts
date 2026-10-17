/**
 * Єдиний перемикач грошей ззовні (поповнення ✦ через Stripe, а в майбутньому — ввід/вивід гривні).
 * За замовчуванням ВИМКНЕНО: провайдера оберемо після юридичного оформлення.
 * Увімкнути можна лише змінною середовища ORBIT_PAYMENTS_ENABLED=1 (і тільки з тестовими ключами Stripe).
 * Коли вимкнено: нові сесії оплати не створюються; вебхук і повернення з оплати зараховують ЛИШЕ ті сесії,
 * які вже були відкриті раніше (є в журналі topups), — так жодна вже розпочата оплата не загубиться.
 */
import type { Topup } from "@/lib/orbit/access";

export const PAYMENTS_FLAG = "ORBIT_PAYMENTS_ENABLED";

export function paymentsEnabled(): boolean {
  return process.env[PAYMENTS_FLAG]?.trim() === "1";
}

export const PAYMENTS_OFF = "Поповнення відкриємо після юридичного оформлення. Платіжного провайдера ще не обрано.";

/** Сесія, яку наш сервер уже відкривав раніше (відкрита або вже зарахована). */
export function knownSession(topups: Topup[], sessionId: string): boolean {
  return topups.some((row) => row.id === sessionId);
}
