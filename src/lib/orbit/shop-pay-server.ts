/** Запис замовлень у документ світу під блокуванням (як вебхук Stripe): події, емісія, архів. */
import type { Topup } from "@/lib/orbit/access";
import type { World } from "@/lib/orbit/engine";

type Change = { world: World; topups: Topup[] } | null;

export async function withWorld<T>(edit: (world: World, topups: Topup[], people: { userId: string }[]) => { change: Change; out: T }): Promise<T> {
  const { withTransaction } = await import("@/lib/db");
  const { packDoc, unpackDoc } = await import("@/lib/orbit/access");
  return withTransaction(async (sql) => {
    const rows = await sql.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world' for update`, []);
    const bag = unpackDoc(rows[0]?.doc);
    const { change, out } = edit(bag.world, bag.topups, bag.people);
    if (!change) return out;
    const social = await import("@/lib/orbit/social-db");
    await social.ensureSocial(sql);
    await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
      packDoc({ ...change.world, sessionId: null }, bag.keys, bag.devices, bag.people, change.topups, bag.limits, bag.seen, bag.extra),
    ]);
    const { diffEvents } = await import("@/lib/orbit/social");
    const evs = diffEvents(bag.world, change.world, bag.topups, change.topups);
    await social.insertEvents(sql, evs);
    const { emissionOf, massOf } = await import("@/lib/orbit/emission");
    await social.insertEmission(sql, emissionOf(bag.world, change.world, bag.topups, change.topups, evs), massOf(bag.world));
    await social.archiveWrite(sql, bag.world, change.world, Date.now());
    return out;
  });
}
