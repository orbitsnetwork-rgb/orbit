import { createServerFn } from "@tanstack/react-start";
import { readCreds } from "@/lib/orbit/who-server";
import { canVouch, prepWord } from "@/lib/orbit/vouch-word";

/**
 * «Слово поручителя». Писати може лише той, хто справді підтвердив запуск людини (перевіряє сервер за світом),
 * одне слово на пару — назавжди (без редагування: як і саме підтвердження). Людина може сховати слово зі свого профілю.
 * Читати несховані слова будь-кого може кожен, хто увійшов (це сенс: перевірити незнайомця).
 */
export type WordOut = { from: string; text: string; at: number; hidden?: boolean };
const flag: { p?: Promise<void> } = {};
async function db() {
  const { getSql } = await import("@/lib/db");
  const { ensureSchema } = await import("@/lib/orbit/who-server");
  const sql = await getSql();
  await ensureSchema(sql, flag, String((await import("../../../migrations/0051_orbit_vouch_words.sql?raw")).default));
  return sql;
}
type Row = { witness_id: string; author_id: string; text: string; at: string | number; hidden: boolean };
const cleanId = (v: unknown) => (typeof v === "string" && /^u-[a-z0-9-]{1,40}$/i.test(v) ? v : null);

export const wordsFor = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...readCreds(raw), who: cleanId((raw as { who?: unknown })?.who) }))
  .handler(async ({ data }): Promise<{ got: WordOut[]; given: string[] }> => {
    try {
      const sql = await db();
      const me = await (await import("@/lib/orbit/who-server")).whoAmI(sql, data);
      if (!me || !data.who) return { got: [], given: [] };
      const own = data.who === me.id;
      const rows = await sql.query<Row>(`select witness_id, author_id, text, at, hidden from orbit_vouch_words where author_id = $1 ${own ? "" : "and not hidden"} order by at desc limit 50`, [data.who]);
      const given = own ? (await sql.query<{ author_id: string }>(`select author_id from orbit_vouch_words where witness_id = $1`, [me.id])).map((r) => r.author_id) : [];
      const known = new Set(me.world.accounts.map((a) => a.id));
      return { got: rows.filter((r) => known.has(r.witness_id)).map((r) => ({ from: r.witness_id, text: r.text, at: Number(r.at), ...(own ? { hidden: r.hidden } : {}) })), given };
    } catch {
      return { got: [], given: [] };
    }
  });

export const wordSay = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...readCreds(raw), to: cleanId((raw as { to?: unknown })?.to), text: String((raw as { text?: unknown })?.text ?? "").slice(0, 600) }))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    try {
      const sql = await db();
      const W = await import("@/lib/orbit/who-server");
      const me = await W.whoAmI(sql, data);
      if (!me) return { ok: false, error: "Сесія застаріла. Увійди ще раз." };
      if (!data.to || !canVouch(me.world, me.id, data.to)) return { ok: false, error: "Слово можна лишити лише людині, чий запуск ти підтвердив." };
      const prep = prepWord(data.text);
      if ("error" in prep) return { ok: false, error: prep.error };
      if (!W.allowRate(`vw:${me.id}`, 6)) return { ok: false, error: "Забагато за хвилину. Спробуй трохи згодом." };
      const rows = await sql.query<{ a: string }>(
        `insert into orbit_vouch_words (witness_id, author_id, text, at) values ($1, $2, $3, $4) on conflict do nothing returning author_id as a`,
        [me.id, data.to, prep.text, Date.now()],
      );
      return rows.length ? { ok: true } : { ok: false, error: "Ти вже лишив слово цій людині — воно назавжди, як і підтвердження." };
    } catch {
      return { ok: false, error: "Не вдалося зберегти. Перевір зв'язок." };
    }
  });

export const wordHide = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ({ ...readCreds(raw), from: cleanId((raw as { from?: unknown })?.from), hidden: (raw as { hidden?: unknown })?.hidden === true }))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    try {
      const sql = await db();
      const me = await (await import("@/lib/orbit/who-server")).whoAmI(sql, data);
      if (!me || !data.from) return { ok: false };
      await sql.query(`update orbit_vouch_words set hidden = $3 where author_id = $1 and witness_id = $2`, [me.id, data.from, data.hidden]);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });
