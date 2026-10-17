import { createFileRoute } from "@tanstack/react-router";

/**
 * 9: звірка балансів для адміністратора. GET з заголовком `Authorization: Bearer <ORBIT_ADMIN_TOKEN>`.
 * Якщо змінної ORBIT_ADMIN_TOKEN немає — маршрут вимкнено (404). Відповідь — лише агрегати, без id.
 * Щогодинний запуск: scripts/reconcile.mjs (cron) або Netlify Scheduled Function — після схвалення.
 */
export const Route = createFileRoute("/api/reconcile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const want = process.env.ORBIT_ADMIN_TOKEN?.trim() ?? "";
        if (want.length < 24) return new Response("not found", { status: 404 });
        const got = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        const { timingSafeEqual } = await import("node:crypto");
        const a = Buffer.from(got);
        const b = Buffer.from(want);
        if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("not found", { status: 404 });
        const { getSql } = await import("@/lib/db");
        const { unpackDoc } = await import("@/lib/orbit/access");
        const { adoptClock } = await import("@/lib/orbit/engine");
        const social = await import("@/lib/orbit/social-db");
        const sql = await getSql();
        await social.ensureSocial(sql);
        const rows = await sql.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world'`, []);
        const bag = unpackDoc(rows[0]?.doc);
        const check = await social.reconcile(sql, adoptClock({ ...bag.world, sessionId: null }));
        // v16/v17: архів (0036) має збігатися зі світом: угоди поелементно, вікно журналу, кожен завершений запуск.
        const counts = await social.archiveCounts(sql);
        const parity = social.archiveParity(bag.world, await social.archiveRead(sql));
        const launches = await social.launchParity(sql, bag.world);
        const archive = {
          trades: counts.trades,
          worldTrades: bag.world.trades.length,
          log: counts.log,
          launches: counts.launches,
          tradesOk: parity.tradesOk,
          logOk: parity.logOk,
          launchesOk: launches.ok,
          launchesMissing: launches.missing,
          ok: parity.ok && launches.ok,
        };
        if (!archive.ok) console.error("orbit reconcile: archive mismatch", JSON.stringify(archive));
        if (!check.ok) console.error("orbit reconcile: mismatch", check.diff, check.unexplained);
        return Response.json({ ...check, archive, at: new Date().toISOString() }, { status: check.ok ? 200 : 409, headers: { "cache-control": "no-store" } });
      },
    },
  },
});
