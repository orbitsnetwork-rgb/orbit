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
        const orphan = await withTransaction(async (sql) => {
          const rows = await sql.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world' for update`, []);
          const bag = unpackDoc(rows[0]?.doc);
          const done = creditTopup(bag.world, bag.topups, { id, userId, amount });
          const social = await import("@/lib/orbit/social-db");
          await social.ensureSocial(sql);
          if (done.error) {
            // K4: гроші отримано, а імені немає — не мовчимо. Запис для ручного розбору, і 500, щоб Stripe повторив.
            await sql.query(`insert into orbit_orphans (session_id, user_id, amount, reason) values ($1, $2, $3, $4)`, [id, userId, amount, done.error]);
            return true;
          }
          await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
            packDoc({ ...done.world, sessionId: null }, bag.keys, bag.devices, bag.people, done.topups, bag.limits, bag.seen, bag.extra),
          ]);
          const evs = diffEvents(bag.world, done.world, bag.topups, done.topups);
          await social.insertEvents(sql, evs);
          const { emissionOf, massOf } = await import("@/lib/orbit/emission");
          await social.insertEmission(sql, emissionOf(bag.world, done.world, bag.topups, done.topups, evs), massOf(bag.world));
          return false;
        });
        if (orphan) {
          console.error("stripe webhook: orphan payment, account not found", id);
          return new Response("orphan", { status: 500 });
        }
        return new Response("ok");
      },
    },
  },
});
