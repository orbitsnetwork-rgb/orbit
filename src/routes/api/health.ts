import { createFileRoute } from "@tanstack/react-router";

/**
 * Перевірка стану для моніторингу (UptimeRobot, cron, Netlify-резерв): GET /api/health.
 * 200 {ok:true} — сайт і база відповідають; 503 — база недоступна. Без секретів, без даних людей.
 * Таймаут бази 4 с (холодний старт Neon ~0,5–3 с). Відповідь не кешується.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const host = process.env.ORBIT_HOST?.trim() || (process.env.NETLIFY === "true" ? "netlify" : "node");
        let db: "ok" | "down" | "timeout" = "down";
        try {
          const { getSql } = await import("@/lib/db");
          const ping = (async () => {
            const sql = await getSql();
            await sql.query(`select 1`, []);
            return "ok" as const;
          })();
          db = await Promise.race([ping, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 4000))]);
        } catch (error) {
          console.error("health: db failed", error instanceof Error ? error.message : "unknown");
          db = "down";
        }
        const ok = db === "ok";
        return Response.json(
          { ok, db, host, ms: Date.now() - started, at: new Date().toISOString() },
          { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
