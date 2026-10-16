// 14a: перевірка без UI — екран знайомства вантажиться окремим чанком.
/** Той самий ключ, що й у старої картки «Перші кроки», — хто її закрив, вдруге не побачить. */
export const seenKey = (id: string) => `orbits-seen-${id}`;

/** Знайомство — для нових акаунтів (до 7 днів), один раз на пристрої. */
export function onboardingDue(userId: string, createdAt: number, now: number) {
  if (now - createdAt > 7 * 24 * 60 * 60 * 1000) return false;
  try {
    return localStorage.getItem(seenKey(userId)) !== "1";
  } catch {
    return false;
  }
}

