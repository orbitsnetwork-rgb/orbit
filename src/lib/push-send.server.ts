import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type WebPush = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<unknown>;
  generateVAPIDKeys: () => { publicKey: string; privateKey: string };
};

async function sqlClient() {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function webPush(): Promise<WebPush> {
  const mod = (await import("web-push")) as { default?: WebPush } & WebPush;
  return mod.default?.generateVAPIDKeys ? mod.default : mod;
}

const file = join(process.cwd(), "data", "vapid.json");

export async function publicKey() {
  const keys = await keysOf();
  return keys.publicKey;
}

async function keysOf() {
  try {
    const saved = JSON.parse(await readFile(file, "utf8")) as { publicKey?: string; privateKey?: string };
    if (saved.publicKey && saved.privateKey) return { publicKey: saved.publicKey, privateKey: saved.privateKey };
  } catch {
    /* ще немає пари ключів */
  }
  const made = (await webPush()).generateVAPIDKeys();
  await mkdir(join(process.cwd(), "data"), { recursive: true });
  await writeFile(file, JSON.stringify(made), { mode: 0o600 });
  return made;
}

export async function tellPerson(personId: string, body: string, url: string) {
  if (!personId || body.length < 2) return;
  const sql = await sqlClient();
  const rows = await sql<{ id: string; endpoint: string; p256dh: string; auth: string }>`
    select id, endpoint, p256dh, auth from push_subs where person_key = ${personId}
  `;
  if (rows.length === 0) return;
  const keys = await keysOf();
  const push = await webPush();
  push.setVapidDetails("mailto:push@vosma.local", keys.publicKey, keys.privateKey);
  const payload = JSON.stringify({ title: "8", body: body.slice(0, 180), url });
  await Promise.all(rows.map(async (row) => {
    try {
      await push.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
    } catch (error) {
      const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (status === 404 || status === 410) await sql`delete from push_subs where id = ${row.id}`;
    }
  }));
}
