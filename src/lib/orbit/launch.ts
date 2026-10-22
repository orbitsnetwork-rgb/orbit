import { createServerFn } from "@tanstack/react-start";

/**
 * 18: жива сторінка запуску /l/<заявка> — без встановлення і без входу.
 * Повертає лише «Ім’я П.» автора і тих, хто підтвердив, скільки підтверджень і стан заряду. Код ніколи не повертається:
 * якщо в посиланні є ?c=, сервер лише каже, чи він ще живий (codeLive), і тоді кнопка веде на /?c=… у застосунку.
 */
export type LaunchLive = {
  found: boolean;
  who: string | null;
  n: number;
  need: number;
  status: "collecting" | "charging" | "done" | "failed" | null;
  names: string[];
  codeLive: boolean;
  chargeEndsAt: number | null;
  orbit: number | null;
  origin: string;
  now: number;
};

const HITS = new Map<string, { n: number; start: number }>();
/** Ліміт на процес і адресу: сторінка опитує раз на 5 с (120 за 10 хв); перевірок коду — не більше 20, щоб це не стало підбором. */
function allow(key: string, now: number, max: number) {
  const row = HITS.get(key);
  if (!row || now - row.start > 10 * 60_000) {
    HITS.set(key, { n: 1, start: now });
    if (HITS.size > 5000) HITS.clear();
    return true;
  }
  row.n += 1;
  return row.n <= max;
}

export const launchLive = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as { cr?: unknown; c?: unknown };
    return { cr: String(raw.cr ?? "").replace(/[^a-z0-9_-]/gi, "").slice(0, 40), c: String(raw.c ?? "").replace(/\D/g, "").slice(0, 6) };
  })
  .handler(async ({ data }): Promise<LaunchLive> => {
    const server = await import("@tanstack/react-start/server");
    const site = process.env.URL?.trim() ?? "";
    const origin = site.startsWith("https://") ? site.replace(/\/$/, "") : new URL(server.getRequestUrl()).origin;
    const now = Date.now();
    const empty: LaunchLive = { found: false, who: null, n: 0, need: 8, status: null, names: [], codeLive: false, chargeEndsAt: null, orbit: null, origin, now };
    const ip = server.getRequestHeader("x-nf-client-connection-ip") ?? server.getRequestIP({ xForwardedFor: true }) ?? "unknown";
    // L1: лише випадковий slug з orbit_links; старі /l/<id заявки> більше нічого не показують (404, автору — перенаправлення).
    if (!/^[A-Za-z0-9_-]{16}$/.test(data.cr) || !allow(`l:${ip}`, now, 150)) return empty;
    const checkCode = data.c.length === 6 && allow(`lc:${ip}`, now, 20);
    try {
      const [{ getSql }, { unpackDoc, shortName }, E] = await Promise.all([import("@/lib/db"), import("@/lib/orbit/access"), import("@/lib/orbit/engine")]);
      const sql = await getSql();
      const { ensureSocial, crOfSlug } = await import("@/lib/orbit/social-db");
      await ensureSocial(sql);
      const crId = await crOfSlug(sql, data.cr);
      if (!crId) return empty;
      const rows = await sql.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world'`, []);
      const bag = unpackDoc(rows[0]?.doc);
      const item = bag.world.creations.find((row) => row.id === crId);
      if (!item) return empty;
      const nameOf = (id: string) => {
        const person = bag.people.find((row) => row.userId === id);
        return person ? shortName(person.given, person.family) : (bag.world.accounts.find((row) => row.id === id)?.name ?? "Учасник");
      };
      let orbit: number | null = null;
      if (item.status === "done") {
        const hit = await sql.query<{ orbit: number }>(`select orbit from orbit_origins where cr = $1 limit 1`, [item.id]);
        orbit = hit[0] ? Number(hit[0].orbit) : null;
      }
      return {
        found: true,
        who: nameOf(item.userId),
        n: item.confirms.length,
        need: E.crewNeed(bag.world),
        status: item.status,
        names: item.confirms.map((row) => nameOf(row.witnessId)),
        codeLive: item.status === "collecting" && checkCode && item.code === data.c && now < item.codeExpires,
        chargeEndsAt: item.status === "charging" && item.chargeStartedAt ? item.chargeStartedAt + E.CHARGE_MS : null,
        orbit,
        origin,
        now,
      };
    } catch (error) {
      console.error("launchLive failed", error instanceof Error ? error.message : "unknown");
      return empty;
    }
  });
