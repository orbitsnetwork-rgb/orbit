import { createServerFn } from "@tanstack/react-start";
import { readCreds } from "@/lib/orbit/who-server";
import { cleanEmblem, unlockedGlyphs, type Emblem } from "@/lib/orbit/emblem";

/**
 * Емблеми: читати може будь-хто (публічна частина профілю), змінювати — лише власник за ключем сесії.
 * Окрема таблиця (міграція 0050), документ світу не блокується і не змінюється.
 */
const flag: { p?: Promise<void> } = {};
async function db() {
  const { getSql } = await import("@/lib/db");
  const { ensureSchema } = await import("@/lib/orbit/who-server");
  const sql = await getSql();
  await ensureSchema(sql, flag, String((await import("../../../migrations/0050_orbit_emblems.sql?raw")).default));
  return sql;
}

export const emblemsAll = createServerFn({ method: "GET" }).handler(async (): Promise<Record<string, Emblem>> => {
  try {
    const rows = await (await db()).query<{ user_id: string; hue: number; glyph: string }>(`select user_id, hue, glyph from orbit_emblems`, []);
    const out: Record<string, Emblem> = {};
    for (const r of rows) {
      const e = cleanEmblem({ hue: Number(r.hue), glyph: r.glyph });
      if (e) out[r.user_id] = e;
    }
    return out;
  } catch {
    return {};
  }
});

export const emblemSet = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...readCreds(raw), emblem: cleanEmblem((raw as { emblem?: unknown })?.emblem) }))
  .handler(async ({ data }): Promise<{ ok: true; emblem: Emblem } | { ok: false; error: string }> => {
    if (!data.sessionId || !data.sessionKey) return { ok: false, error: "Спершу увійди." };
    if (!data.emblem) return { ok: false, error: "Такої емблеми немає." };
    try {
      const sql = await db();
      const W = await import("@/lib/orbit/who-server");
      const me = await W.whoAmI(sql, data);
      if (!me) return { ok: false, error: "Сесія застаріла. Увійди ще раз." };
      if (!unlockedGlyphs(me.world, me.id).has(data.emblem.glyph)) return { ok: false, error: "Цей знак ще закритий." };
      if (!W.allowRate(`em:${me.id}`, 10)) return { ok: false, error: "Забагато змін. Спробуй за хвилину." };
      await sql.query(
        `insert into orbit_emblems (user_id, hue, glyph, at) values ($1, $2, $3, $4)
         on conflict (user_id) do update set hue = excluded.hue, glyph = excluded.glyph, at = excluded.at`,
        [me.id, data.emblem.hue, data.emblem.glyph, Date.now()],
      );
      return { ok: true, emblem: data.emblem };
    } catch {
      return { ok: false, error: "Не вдалося зберегти. Перевір зв'язок." };
    }
  });
