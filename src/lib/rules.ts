import { norm, type Eight } from "@/lib/model";

const MONEY = /(?:\d[\d\s.,]{0,8}\s?(?:грн|uah|usd|eur))|(?:[$€£₴])|(?:\b(?:грн|долар|доларів|ціна|прайс|bitcoin|btc|eth)\b)/i;

export function moneyIn(text: string) {
  return MONEY.test(text);
}

export const MONEY_ERROR = "Суму пиши на ринку, не в цьому тексті.";

export function isOwn(name: string, entry: Eight) {
  const key = norm(name);
  return key.length > 0 && (key === norm(entry.creator) || key === norm(entry.holder));
}

export function canWitness(name: string | undefined, entry: Eight) {
  return (name ?? "").trim().length >= 2 && !isOwn(name ?? "", entry) && !entry.anchor && entry.state !== "created";
}

export function witnessLabel(name: string | undefined, entry: Eight) {
  if (entry.anchor) return "Якір не підтверджують";
  if ((name ?? "").trim().length < 2) return "Спочатку вкажи ім'я в профілі";
  if (isOwn(name ?? "", entry)) return "Це ваша 8. Підтвердити її має інша людина на місці";
  return "Лишити нотатку";
}
