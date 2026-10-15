import { createServerFn } from "@tanstack/react-start";
import { resolveKey } from "@/lib/account";

async function sqlClient() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function personId(personKey: string) {
  const id = await resolveKey(personKey);
  if (!id) return null;
  const sql = await sqlClient();
  const rows = await sql<{ key: string }>`select key from people where key = ${id} limit 1`;
  return rows[0] ? id : null;
}

export const pushPublic = createServerFn({ method: "POST" })
  .inputValidator(() => ({}))
  .handler(async (): Promise<{ ok: true; publicKey: string } | { ok: false; error: string }> => {
    try {
      const { publicKey } = await import("@/lib/push-send.server");
      return { ok: true, publicKey: await publicKey() };
    } catch {
      return { ok: false, error: "Сповіщення сервера ще не готові." };
    }
  });

export const savePush = createServerFn({ method: "POST" })
  .inputValidator((input: { personKey: string; endpoint: string; p256dh: string; auth: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const id = await personId(data.personKey);
    if (!id) return { ok: false, error: "Спочатку заведи ключ." };
    let endpoint: URL;
    try {
      endpoint = new URL(data.endpoint);
    } catch {
      return { ok: false, error: "Підписка не вийшла." };
    }
    if (endpoint.protocol !== "https:") return { ok: false, error: "Підписка не вийшла." };
    const p256dh = data.p256dh.trim();
    const auth = data.auth.trim();
    if (p256dh.length < 8 || p256dh.length > 200 || auth.length < 8 || auth.length > 200) {
      return { ok: false, error: "Підписка не вийшла." };
    }
    const sql = await sqlClient();
    const subId = `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await sql`
      insert into push_subs (id, person_key, endpoint, p256dh, auth)
      values (${subId}, ${id}, ${endpoint.toString().slice(0, 2000)}, ${p256dh}, ${auth})
      on conflict (endpoint) do update
        set person_key = excluded.person_key, p256dh = excluded.p256dh, auth = excluded.auth
    `;
    return { ok: true };
  });
