import { createServerFn } from "@tanstack/react-start";

/**
 * Прев’ю посилання на запуск (/?c=КОД) для Telegram, Viber, Facebook.
 * Відповідь містить лише «Ім’я П.» автора і скільки підтверджень зібрано — без коду.
 * Лише читання, без блокування документа. Щоб прев’ю не стало способом підбирати коди,
 * на один процес діє простий ліміт запитів з однієї адреси.
 */
export type LaunchPreview = { who: string | null; n: number; origin: string };

const HITS = new Map<string, { n: number; start: number }>();
const WINDOW = 10 * 60_000;
const MAX = 30;

function allow(ip: string, now: number) {
  const row = HITS.get(ip);
  if (!row || now - row.start > WINDOW) {
    HITS.set(ip, { n: 1, start: now });
    if (HITS.size > 5000) HITS.clear();
    return true;
  }
  row.n += 1;
  return row.n <= MAX;
}

export const launchPreview = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as { c?: unknown };
    return { c: String(raw.c ?? "").replace(/\D/g, "").slice(0, 6) };
  })
  .handler(async ({ data }): Promise<LaunchPreview> => {
    const server = await import("@tanstack/react-start/server");
    const site = process.env.URL?.trim() ?? "";
    const origin = site.startsWith("https://") ? site.replace(/\/$/, "") : new URL(server.getRequestUrl()).origin;
    if (data.c.length !== 6) return { who: null, n: 0, origin };
    const ip = server.getRequestHeader("x-nf-client-connection-ip") ?? server.getRequestIP({ xForwardedFor: true }) ?? "unknown";
    if (!allow(ip, Date.now())) return { who: null, n: 0, origin };
    try {
      const [{ getSql }, { unpackDoc, shortName }] = await Promise.all([import("@/lib/db"), import("@/lib/orbit/access")]);
      const sql = await getSql();
      const rows = await sql.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world'`, []);
      const bag = unpackDoc(rows[0]?.doc);
      const now = Date.now();
      const item = bag.world.creations.find((row) => row.status === "collecting" && row.code === data.c && now < row.codeExpires);
      if (!item) return { who: null, n: 0, origin };
      const person = bag.people.find((row) => row.userId === item.userId);
      const name = person ? shortName(person.given, person.family) : (bag.world.accounts.find((row) => row.id === item.userId)?.name ?? null);
      return { who: name, n: item.confirms.length, origin };
    } catch (error) {
      console.error("launchPreview failed", error instanceof Error ? error.message : "unknown");
      return { who: null, n: 0, origin };
    }
  });

export function previewMeta(p: LaunchPreview | undefined) {
  const origin = p?.origin ?? "";
  const title = p?.who ? `Запуск ${p.who} · підтверджень: ${p.n}` : "Орбіти — запускаємо разом";
  const description = p?.who
    ? "Підтверди запуск орбіти: потрібно 3 підтвердження від різних людей і 24 години заряду. Код уже в посиланні."
    : "Вісім мільйонів рівних орбіт. Одна ціна. Внутрішня одиниця — іскра ✦. Запускаємо разом.";
  const image = `${origin}/og-launch.png`;
  return [
    { title: p?.who ? `${title} — Орбіти` : "Орбіти" },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Орбіти" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    // Адреса без коду: код живе лише в посиланні, яке людина надіслала.
    { property: "og:url", content: `${origin}/` },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: "Орбіти: підтверди мій запуск" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:image", content: image },
  ];
}
