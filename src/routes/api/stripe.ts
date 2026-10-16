import { createFileRoute } from "@tanstack/react-router";
import { packDoc, unpackDoc } from "@/lib/orbit/access";
import { creditTopup, signedEvent } from "@/lib/orbit/stripe";
import { diffEvents } from "@/lib/orbit/social";

export const Route = createFileRoute("/api/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const event = signedEvent(raw, request.headers.get("stripe-signature"));
        if (!event) return new Response("підпис", { status: 400 });
        if (event.type !== "checkout.session.completed") return new Response("ok");
        const session = event.data?.object ?? {};
        if (session.livemode === true) return new Response("бойовий", { status: 400 });
        const id = typeof session.id === "string" ? session.id : "";
        const userId = typeof session.metadata === "object" && session.metadata && "userId" in session.metadata ? String(session.metadata.userId) : "";
        const amount = typeof session.metadata === "object" && session.metadata && "amountOd" in session.metadata ? Number(session.metadata.amountOd) : 0;
        const paid = session.payment_status === "paid" && id.startsWith("cs_") && userId.startsWith("u-") && (amount === 100 || amount === 500 || amount === 1000);
        if (!paid || session.amount_total !== amount) return new Response("сума", { status: 400 });
        const { withTransaction } = await import("@/lib/db");
        await withTransaction(async (sql) => {
          const rows = await sql.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world' for update`, []);
          const bag = unpackDoc(rows[0]?.doc);
          const done = creditTopup(bag.world, bag.topups, { id, userId, amount });
          await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
            packDoc({ ...done.world, sessionId: null }, bag.keys, bag.devices, bag.people, done.topups, bag.limits, bag.seen, bag.extra),
          ]);
          const social = await import("@/lib/orbit/social-db");
          await social.ensureSocial(sql);
          await social.insertEvents(sql, diffEvents(bag.world, done.world, bag.topups, done.topups));
        });
        return new Response("ok");
      },
    },
  },
});
