import { createServerFn } from "@tanstack/react-start";
import type { Transparency } from "@/lib/orbit/emission";

/** 15: публічні агрегати випуску ✦ (без id і балансів окремих людей). */
export const orbitTransparency = createServerFn({ method: "GET" }).handler(async (): Promise<Transparency | null> => {
  try {
    const { getSql } = await import("@/lib/db");
    const { unpackDoc } = await import("@/lib/orbit/access");
    const { adoptClock } = await import("@/lib/orbit/engine");
    const social = await import("@/lib/orbit/social-db");
    const sql = await getSql();
    await social.ensureSocial(sql);
    const rows = await sql.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world'`, []);
    const bag = unpackDoc(rows[0]?.doc);
    return await social.readTransparency(sql, adoptClock({ ...bag.world, sessionId: null }));
  } catch (error) {
    console.error("transparency", error);
    return null;
  }
});
