export type Lang = "uk" | "en" | "ru" | "pl" | "de";

const rows = {
  uk: {
    brand: "Орбіти",
    sub: "8 000 000 · усі рівні · ціна одна",
    lead: "Пошта і телефон. Потім ім’я. Ключ лишається на цьому телефоні.",
    email: "Пошта",
    phone: "Телефон",
    given: "Ім’я",
    family: "Прізвище",
    birth: "Дата народження",
    next: "Далі",
    enter: "Увійти",
    create: "Створити",
    key: "Ключ",
    old: "Старе ім’я без пошти",
    card: "Картка має збігатися з ім’ям.",
    sound: "Звук",
    music: "Звук",
    leave: "Вийти",
    buy: "Купити найстарішу",
    sell: "Поставити в чергу",
    home: "Ціна",
    market: "Обмін",
    mine: "Заявка",
    flow: "Потік",
    me: "Я",
  },
  en: {
    brand: "Orbits",
    sub: "8 000 000 · all equal · one price",
    lead: "Email and phone. Then your name. The key stays on this phone.",
    email: "Email",
    phone: "Phone",
    given: "First name",
    family: "Last name",
    birth: "Date of birth",
    next: "Next",
    enter: "Enter",
    create: "Create",
    key: "Key",
    old: "Old name without email",
    card: "No card provider yet. Preview trading stays open.",
    sound: "Sound",
    music: "No music yet",
    leave: "Leave",
    buy: "Buy the oldest",
    sell: "Join the queue",
    home: "Price",
    market: "Exchange",
    mine: "Request",
    flow: "Flow",
    me: "Me",
  },
  ru: {
    brand: "Орбиты",
    sub: "8 000 000 · все равны · цена одна",
    lead: "Почта и телефон. Потом имя. Ключ остаётся на этом телефоне.",
    email: "Почта",
    phone: "Телефон",
    given: "Имя",
    family: "Фамилия",
    birth: "Дата рождения",
    next: "Дальше",
    enter: "Войти",
    create: "Создать",
    key: "Ключ",
    old: "Старое имя без почты",
    card: "Карта ещё не подключена. Торговля в превью открыта.",
    sound: "Звук",
    music: "Музыки ещё нет",
    leave: "Выйти",
    buy: "Купить старейшую",
    sell: "Поставить в очередь",
    home: "Цена",
    market: "Обмен",
    mine: "Заявка",
    flow: "Поток",
    me: "Я",
  },
  pl: {
    brand: "Orbity",
    sub: "8 000 000 · wszystkie równe · jedna cena",
    lead: "E-mail i telefon. Potem imię. Klucz zostaje w tym telefonie.",
    email: "E-mail",
    phone: "Telefon",
    given: "Imię",
    family: "Nazwisko",
    birth: "Data urodzenia",
    next: "Dalej",
    enter: "Wejdź",
    create: "Utwórz",
    key: "Klucz",
    old: "Stare imię bez e-maila",
    card: "Karty jeszcze nie podłączono. Handel w podglądzie zostaje.",
    sound: "Dźwięk",
    music: "Muzyki jeszcze nie ma",
    leave: "Wyjdź",
    buy: "Kup najstarszą",
    sell: "Do kolejki",
    home: "Cena",
    market: "Wymiana",
    mine: "Wniosek",
    flow: "Przepływ",
    me: "Ja",
  },
  de: {
    brand: "Orbits",
    sub: "8 000 000 · alle gleich · ein Preis",
    lead: "E-Mail und Telefon. Dann der Name. Der Schlüssel bleibt auf diesem Telefon.",
    email: "E-Mail",
    phone: "Telefon",
    given: "Vorname",
    family: "Nachname",
    birth: "Geburtsdatum",
    next: "Weiter",
    enter: "Rein",
    create: "Anlegen",
    key: "Schlüssel",
    old: "Alter Name ohne E-Mail",
    card: "Keine Karte angebunden. Handel in der Vorschau bleibt offen.",
    sound: "Ton",
    music: "Noch keine Musik",
    leave: "Raus",
    buy: "Die älteste kaufen",
    sell: "In die Reihe",
    home: "Preis",
    market: "Tausch",
    mine: "Antrag",
    flow: "Strom",
    me: "Ich",
  },
} as const;

export type CopyKey = keyof (typeof rows)["uk"];

export function readLang(): Lang {
  if (typeof window === "undefined") return "uk";
  const value = localStorage.getItem("orbits-lang");
  if (value === "en" || value === "ru" || value === "pl" || value === "de" || value === "uk") return value;
  return "uk";
}

export function writeLang(lang: Lang) {
  localStorage.setItem("orbits-lang", lang);
  window.dispatchEvent(new Event("orbit-lang"));
}

export function t(lang: Lang, key: CopyKey) {
  return rows[lang][key];
}

/** Українські форми: 1 іскра, 2 іскри, 5 іскор. Лише відображення. */
export function sparkWord(n: number) {
  const abs = Math.abs(Math.trunc(n));
  const ten = abs % 10;
  const hundred = abs % 100;
  if (ten === 1 && hundred !== 11) return "іскра";
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return "іскри";
  return "іскор";
}

const sparkFmt = new Intl.NumberFormat("uk-UA");

/** «1 250 іскор» */
export function sparks(n: number) {
  return `${sparkFmt.format(n)} ${sparkWord(n)}`;
}

/** «1 250 ✦» — коротко для чисел у картках. */
export function spk(n: number) {
  return `${sparkFmt.format(n)} ✦`;
}

/** Повідомлення з сервера ще кажуть «ОД». Показуємо їх як іскри, нічого не міняючи в рушії. */
export function sparkText(text: string) {
  return text
    .replace(/(\d[\d\u00a0\u202f ]*)\s?ОД(?!\p{L})/gu, (_match, num: string) => {
      return `${num.trim()} ✦`;
    })
    .replace(/(?<!\p{L})ОД(?!\p{L})/gu, "іскор");
}
