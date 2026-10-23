import { createFileRoute } from "@tanstack/react-router";
import { parseXsolla, xsollaConf, xsollaSigned } from "@/lib/orbit/xsolla";

const err = (code: string, status = 400) => new Response(JSON.stringify({ error: { code } }), { status, headers: { "content-type": "application/json" } });

/** Вебхук Xsolla: перевірка підпису, перевірка користувача, зарахування оплаченого замовлення (ідемпотентно). */
export const Route = createFileRoute("/api/xsolla")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const conf = xsollaConf();
        if (!conf || process.env.ORBIT_SHOP_PROVIDER?.trim() !== "xsolla") return err("INVALID_PARAMETER");
        const raw = await request.text();
        if (!xsollaSigned(raw, request.headers.get("authorization"), conf.secret)) return err("INVALID_SIGNATURE");
        let ev;
        try { ev = parseXsolla(JSON.parse(raw)); } catch { return err("INVALID_PARAMETER"); }
        if (ev.kind === "other") return new Response(null, { status: 204 });
        const { withWorld } = await import("@/lib/orbit/shop-pay-server");
        if (ev.kind === "user") {
          const uid = ev.userId;
          const ok = await withWorld((world) => ({ change: null, out: world.accounts.some((a) => a.id === uid) }));
          return ok ? new Response(null, { status: 204 }) : err("INVALID_USER");
        }
        if (conf.sandbox && !ev.dryRun) return err("INVALID_PARAMETER"); // тестовий режим: лише тестові оплати
        if (ev.currency !== "USD") return err("INCORRECT_AMOUNT");
        const { creditOrder } = await import("@/lib/orbit/shop-pay");
        const paid = ev;
        const out = await withWorld<string>((world, topups) => {
          const row = topups.find((t) => t.id === paid.orderId);
          if (!row || row.userId !== paid.userId) return { change: null, out: "INVALID_INVOICE" };
          const done = creditOrder(world, topups, paid.orderId, paid.usdCents);
          if (done.error) return { change: null, out: done.error === "Сума не збігається." ? "INCORRECT_AMOUNT" : "INVALID_INVOICE" };
          return { change: done.notice === "Вже зараховано." ? null : { world: done.world, topups: done.topups }, out: "" };
        });
        if (out) {
          console.error("xsolla webhook rejected", out, paid.orderId);
          return err(out);
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
