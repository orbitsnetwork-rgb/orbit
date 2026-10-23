import { createServerFn } from "@tanstack/react-start";
import { CHECKOUT_SOON, checkoutEnabled, checkoutProvider } from "@/lib/orbit/checkout";
import { readCreds } from "@/lib/orbit/who-server";

/** Стан оплати для клієнта: увімкнена (є провайдер і ключі) чи «Скоро»; і чи ще діє бонус першої покупки. */
export const checkoutState = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => readCreds(raw))
  .handler(async ({ data }) => {
    const enabled = checkoutEnabled();
    let first = true;
    let starter = false;
    if (data.sessionId) {
      try {
        const { getSql } = await import("@/lib/db");
        const W = await import("@/lib/orbit/who-server");
        const me = await W.whoAmI(await getSql(), data);
        if (me) {
          const { unpackDoc } = await import("@/lib/orbit/access");
          const rows = await (await getSql()).query<{ doc: unknown }>(`select doc from orbit_world where id = 'world'`, []);
          const { firstDone } = await import("@/lib/orbit/shop-pay");
          const topups = unpackDoc(rows[0]?.doc).topups;
          first = !firstDone(topups, me.id);
          starter = topups.some((t) => t.userId === me.id && t.status === "paid" && t.product === "starter");
        }
      } catch {
        /* показуємо типовий стан */
      }
    }
    return { enabled, first, starter, note: CHECKOUT_SOON };
  });

/** Почати оплату пакета: сервер сам рахує суму, відкриває замовлення і повертає сторінку провайдера. */
export const checkoutStart = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...readCreds(raw), product: String((raw as { product?: unknown })?.product ?? "").slice(0, 16) }))
  .handler(async ({ data }): Promise<{ ok: true; url: string } | { ok: false; soon?: true; error: string }> => {
    const provider = checkoutProvider();
    if (!provider) return { ok: false, soon: true, error: CHECKOUT_SOON };
    if (!data.sessionId || !data.sessionKey) return { ok: false, error: "Спершу увійди." };
    try {
      const { getSql } = await import("@/lib/db");
      const W = await import("@/lib/orbit/who-server");
      const me = await W.whoAmI(await getSql(), data);
      if (!me) return { ok: false, error: "Сесія застаріла. Увійди ще раз." };
      if (!W.allowRate(`pay:${me.id}`, 5)) return { ok: false, error: "Забагато спроб. Спробуй за хвилину." };
      const { openOrder } = await import("@/lib/orbit/shop-pay");
      const { withWorld } = await import("@/lib/orbit/shop-pay-server");
      const { randomUUID } = await import("node:crypto");
      const id = `xs-${randomUUID()}`;
      type Opened = { error: string } | { order: import("@/lib/orbit/checkout").Order };
      const opened = await withWorld<Opened>((world, topups) => {
        const o = openOrder(world, topups, me.id, data.product, id, Date.now());
        return "error" in o ? { change: null, out: o } : { change: { world, topups: o.topups }, out: { order: o.order } };
      });
      if ("error" in opened) return { ok: false, error: opened.error };
      const server = await import("@tanstack/react-start/server");
      let origin = "https://orbit.orbits-network.workers.dev";
      try { origin = new URL(server.getRequest().url).origin; } catch { /* типова адреса */ }
      const s = await provider.createSession(opened.order, `${origin}/?paid=${encodeURIComponent(id)}`);
      return { ok: true, url: s.url };
    } catch (e) {
      console.error("checkoutStart failed", e instanceof Error ? e.message : "unknown");
      return { ok: false, error: "Оплата тимчасово недоступна. Спробуй пізніше." };
    }
  });
