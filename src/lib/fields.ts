import { credentialAccepted } from "@/lib/model";

const RECOVERY = /^R-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

export function checkName(value: string) {
  const name = value.trim();
  if (name.length < 2) return "Ім’я — хоча б дві літери.";
  if (name.length > 40) return "Ім’я коротше за 40 знаків.";
  if (/8-[A-Z0-9]/i.test(name)) return "Ключ в ім’я не пишуть.";
  return "";
}

export function checkCity(value: string) {
  const city = value.trim();
  if (!city) return "";
  if (city.length < 2) return "Місто — хоча б дві літери, або залиш порожнім.";
  if (city.length > 40) return "Місто коротше за 40 знаків.";
  return "";
}

export function checkPrice(value: string) {
  const raw = value.replace(",", ".").trim();
  if (!raw) return "Напиши ціну.";
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return "Ціна — число, без букв.";
  const amount = Number(raw);
  if (!(amount > 0)) return "Ціна більша за нуль.";
  if (amount > 1_000_000) return "Завелика ціна.";
  return "";
}

export function checkNote(value: string, max = 280) {
  const text = value.trim();
  if (text.length < 2) return "Хоча б два знаки.";
  if (text.length > max) return `Коротше за ${max} знаків.`;
  if (/8-[A-Z0-9]{4}/i.test(text)) return "Ключ сюди не пишуть.";
  return "";
}

export function checkRestore(value: string) {
  const code = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!code) return "Встав ключ або код R-.";
  if (code.startsWith("R-")) return RECOVERY.test(code) ? "" : "Код має вигляд R-XXXX-XXXX.";
  return credentialAccepted(code) ? "" : "Ключ має вигляд 8-XXXX-XXXX…";
}
