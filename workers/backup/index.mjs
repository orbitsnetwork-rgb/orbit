/** Щоденна резервна копія Neon (Cron Trigger), правило «лише одна копія» — див. scripts/neon-backup.mjs. */
import { backup } from "../../scripts/neon-backup.mjs";

export default {
  async scheduled(_event, env, ctx) {
    const name = `pre-daily-${new Date().toISOString().slice(0, 10)}`;
    ctx.waitUntil(
      backup(name, { key: env.NEON_API_KEY, log: (m) => console.log("[backup]", m) }).catch((e) => console.error("[backup] failed", e?.message ?? e)),
    );
  },
  async fetch() {
    return new Response("orbit-backup: cron only", { status: 404 });
  },
};
