import { createServerFn } from "@tanstack/react-start";
import { forgive, keyMatches, limited, mailCode, markDevice, mintKey, namesLeft, packDoc, readPerson, strike, unpackDoc, type Identity, type Limit, type Topup } from "@/lib/orbit/access";
import {
  acceptCode,
  adoptClock,
  buyOldest,
  cancelListing,
  emptyWorld,
  enter,
  issueCode,
  listOrbit,
  register,
  startCreation,
  utcDay,
  type Step,
  type World,
} from "@/lib/orbit/engine";
import { creditTopup, openCheckout, readCheckout } from "@/lib/orbit/stripe";

export type OrbitAction =
  | { type: "pull" }
  | { type: "probe"; email: string }
  | { type: "register"; name: string; family: string; birth: string; email: string; phone: string }
  | { type: "enter"; id: string }
  | { type: "enterMail"; email: string }
  | { type: "confirmMail"; code: string }
  | { type: "start" }
  | { type: "issue" }
  | { type: "accept"; code: string }
  | { type: "list"; orbitId: number }
  | { type: "cancel"; orbitId: number }
  | { type: "buy"; price: number }
  | { type: "topup"; amount: number }
  | { type: "confirmTopup"; sessionId: string };

type Call = { sessionId: string | null; sessionKey: string | null; key: string | null; device: string | null; action: OrbitAction };
export type OrbitReply = Step & { key?: string; taken?: boolean; self?: Identity | null; url?: string };

const LOCKED = "Це ім’я відкрите на іншому пристрої. Потрібен його ключ.";

function clipKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (key.length < 8 || key.length > 64) return null;
  return key;
}

function clipDevice(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^d-[A-Z2-9]{8}$/.test(value) ? value : null;
}

function clean(input: unknown): Call {
  const raw = (input ?? {}) as {
    sessionId?: unknown;
    sessionKey?: unknown;
    key?: unknown;
    device?: unknown;
    action?: { type?: string; name?: unknown; family?: unknown; birth?: unknown; email?: unknown; phone?: unknown; id?: unknown; code?: unknown; orbitId?: unknown; amount?: unknown; sessionId?: unknown; price?: unknown };
  };
  const sessionId = typeof raw.sessionId === "string" && raw.sessionId.startsWith("u-") ? raw.sessionId : null;
  const sessionKey = clipKey(raw.sessionKey);
  const key = clipKey(raw.key);
  const device = clipDevice(raw.device);
  const action = raw.action ?? {};
  const type = action.type;
  if (type === "probe") return { sessionId, sessionKey, key, device, action: { type, email: String(action.email ?? "").slice(0, 80) } };
  if (type === "register") {
    return {
      sessionId,
      sessionKey,
      key,
      device,
      action: {
        type,
        name: String(action.name ?? "").slice(0, 32),
        family: String(action.family ?? "").slice(0, 32),
        birth: String(action.birth ?? "").slice(0, 10),
        email: String(action.email ?? "").slice(0, 80),
        phone: String(action.phone ?? "").slice(0, 20),
      },
    };
  }
  if (type === "enterMail") return { sessionId, sessionKey, key, device, action: { type, email: String(action.email ?? "").slice(0, 80) } };
  if (type === "confirmMail") {
    return { sessionId, sessionKey, key, device, action: { type, code: String(action.code ?? "").replace(/\D/g, "").slice(0, 6) } };
  }
  if (type === "enter") return { sessionId, sessionKey, key, device, action: { type, id: String(action.id ?? "") } };
  if (type === "accept") return { sessionId, sessionKey, key, device, action: { type, code: String(action.code ?? "") } };
  if (type === "list" || type === "cancel") return { sessionId, sessionKey, key, device, action: { type, orbitId: Number(action.orbitId) } };
  if (type === "topup") return { sessionId, sessionKey, key, device, action: { type, amount: Number(action.amount) } };
  if (type === "confirmTopup") {
    return { sessionId, sessionKey, key, device, action: { type, sessionId: String(action.sessionId ?? "").slice(0, 80) } };
  }
  if (type === "buy") {
    const price = Number(action.price);
    return { sessionId, sessionKey, key, device, action: { type, price: Number.isFinite(price) ? Math.round(price) : -1 } };
  }
  if (type === "start" || type === "issue" || type === "pull") return { sessionId, sessionKey, key, device, action: { type } };
  return { sessionId, sessionKey, key, device, action: { type: "pull" } };
}

function attach(world: World, sessionId: string | null): World {
  if (!sessionId || !world.accounts.some((account) => account.id === sessionId)) return { ...world, sessionId: null };
  return { ...world, sessionId };
}

/** Що бачить клієнт: світ лише з власними приватними полями. */
function reply(step: OrbitReply): OrbitReply {
  return { ...step, world: project(step.world, step.world.sessionId) };
}

/**
 * Публічна проєкція світу. Кожен отримує повні дані лише про себе.
 * Про інших — тільки те, що потрібно для черги, оглядача, рейтингу й стрічки:
 * без балансів, денних лічильників і живих кодів підтвердження.
 */
export function project(world: World, selfId: string | null): World {
  return {
    ...world,
    sessionId: selfId,
    accounts: world.accounts.map((account) =>
      account.id === selfId
        ? account
        : { ...account, balance: 0, confirmDay: "", confirmsToday: 0, stabilityFromConfirmToday: 0 },
    ),
    creations: world.creations.map((item) =>
      item.userId === selfId ? item : { ...item, code: null, codeExpires: 0, codeDay: "", codesToday: 0 },
    ),
  };
}

const MIN = 60_000;
/** Ліміти спроб: [скільки, за яке вікно, на скільки блок]. */
const RULES = {
  mail: [5, 60 * MIN, 60 * MIN],
  code: [10, 60 * MIN, 30 * MIN],
  key: [10, 60 * MIN, 60 * MIN],
  probe: [30, 60 * MIN, 30 * MIN],
} as const;
const SLOW = "Забагато спроб. Спробуй пізніше.";

function run(world: World, action: OrbitAction): Step {
  if (action.type === "pull") return { world };
  if (action.type === "register") return register(world, action.name);
  if (action.type === "enter") return enter(world, action.id);
  if (action.type === "start") return startCreation(world);
  if (action.type === "issue") return issueCode(world);
  if (action.type === "accept") return acceptCode(world, action.code);
  if (action.type === "list") return listOrbit(world, action.orbitId);
  if (action.type === "cancel") return cancelListing(world, action.orbitId);
  if (action.type === "buy") return buyOldest(world);
  return { world };
}

function actsAsSelf(action: OrbitAction) {
  return action.type !== "pull" && action.type !== "register" && action.type !== "enter" && action.type !== "enterMail" && action.type !== "probe";
}

function own(people: Identity[], id: string | null): Identity | null {
  if (!id) return null;
  return people.find((person) => person.userId === id) ?? null;
}

export const orbitAct = createServerFn({ method: "POST" })
  .inputValidator(clean)
  .handler(async ({ data }): Promise<OrbitReply> => {
    try {
      return reply(await act(data));
    } catch (error) {
      // Внутрішні подробиці (SQL, стек) лишаються в журналі сервера.
      console.error("orbitAct failed", error instanceof Error ? error.message : "unknown");
      throw new Error("Сервер тимчасово недоступний.");
    }
  });

async function act(data: Call): Promise<OrbitReply> {
    const { withTransaction } = await import("@/lib/db");
    return withTransaction(async (sql) => {
      await sql.query(`insert into orbit_world (id, doc) values ('world', $1::jsonb) on conflict (id) do nothing`, [
        packDoc(emptyWorld(), {}),
      ]);
      const rows = await sql.query<{ doc: unknown }>(`select doc from orbit_world where id = 'world' for update`, []);
      const bag = unpackDoc(rows[0]?.doc);
      let limits: Record<string, Limit> = bag.limits;
      const clocked = adoptClock({ ...bag.world, sessionId: null });
      const self = keyMatches(bag.keys, data.sessionId, data.sessionKey) ? data.sessionId : null;
      const base = attach(clocked, self);
      const wall = Date.now();
      const persist = (people = bag.people) =>
        sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
          packDoc(clocked, bag.keys, bag.devices, people, bag.topups, limits),
        ]);
      const gate = async (id: string, rule: keyof typeof RULES): Promise<OrbitReply | null> => {
        if (!limited(limits, id, wall)) return null;
        await persist();
        return { world: base, error: SLOW, self: own(bag.people, self) };
      };
      const miss = (id: string, rule: keyof typeof RULES) => {
        const [max, windowMs, lockMs] = RULES[rule];
        limits = strike(limits, id, wall, max, windowMs, lockMs);
      };

      if (data.action.type === "probe") {
        const blocked = await gate(`p:${data.device ?? "none"}`, "probe");
        if (blocked) return blocked;
        miss(`p:${data.device ?? "none"}`, "probe");
      }
      if (data.action.type === "enterMail" || data.action.type === "enter") {
        const target = data.action.type === "enter" ? data.action.id : data.action.email.trim().toLowerCase();
        const blocked = (await gate(`k:${target}`, "key")) ?? (await gate(`kd:${data.device ?? "none"}`, "key"));
        if (blocked) return blocked;
      }
      if (data.action.type === "confirmMail" && self) {
        const blocked = await gate(`m:${self}`, "mail");
        if (blocked) return blocked;
      }
      if (data.action.type === "accept" && self) {
        const blocked = await gate(`c:${self}`, "code");
        if (blocked) return blocked;
      }

      if (data.action.type === "probe") {
        const email = data.action.email.trim().toLowerCase();
        await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
          packDoc(clocked, bag.keys, bag.devices, bag.people, bag.topups, limits),
        ]);
        return { world: base, taken: bag.people.some((person) => person.email === email), self: own(bag.people, self) };
      }
      if (data.action.type === "enterMail") {
        const email = data.action.email.trim().toLowerCase();
        const person = bag.people.find((row) => row.email === email);
        if (!person || !keyMatches(bag.keys, person.userId, data.key)) {
          miss(`k:${email}`, "key");
          miss(`kd:${data.device ?? "none"}`, "key");
          await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
            packDoc(clocked, bag.keys, bag.devices, bag.people, bag.topups, limits),
          ]);
          return { world: base, error: LOCKED };
        }
        limits = forgive(limits, `k:${email}`);
        const opened = enter(attach(clocked, null), person.userId);
        const sharedMail = { ...opened.world, sessionId: null };
        await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
          packDoc(sharedMail, bag.keys, bag.devices, bag.people, bag.topups, limits),
        ]);
        return { ...opened, world: attach(sharedMail, person.userId), self: person };
      }
      if (data.action.type === "enter" && !keyMatches(bag.keys, data.action.id, data.key)) {
        miss(`k:${data.action.id}`, "key");
        miss(`kd:${data.device ?? "none"}`, "key");
        await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
          packDoc(clocked, bag.keys, bag.devices, bag.people, bag.topups, limits),
        ]);
        return { world: base, error: LOCKED };
      }
      if (actsAsSelf(data.action) && !self) {
        const step = data.sessionId ? { world: base, error: LOCKED } : run(base, data.action);
        await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
          packDoc(clocked, bag.keys, bag.devices, bag.people, bag.topups, limits),
        ]);
        return { ...step, self: own(bag.people, self) };
      }

      if (data.action.type === "confirmMail") {
        const person = bag.people.find((row) => row.userId === self);
        if (!person) {
          return { world: base, error: "У цього імені немає пошти.", self: null };
        }
        if (person.confirmed) {
          return { world: base, self: person, notice: "Пошта вже підтверджена." };
        }
        if (!person.mailCode || person.mailCode !== data.action.code) {
          miss(`m:${self}`, "mail");
          await persist();
          return { world: base, error: "Код не той.", self: person };
        }
        limits = forgive(limits, `m:${self}`);
        const people = bag.people.map((row) => (row.userId === self ? { ...row, confirmed: true, mailCode: null } : row));
        await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
          packDoc(clocked, bag.keys, bag.devices, people, bag.topups, limits),
        ]);
        return { world: base, self: people.find((row) => row.userId === self) ?? null, notice: "Пошту підтверджено." };
      }
      if ((data.action.type === "buy" || data.action.type === "list") && self) {
        const person = bag.people.find((row) => row.userId === self);
        if (person && !person.confirmed) {
          return { world: base, error: "Спочатку код з пошти.", self: person };
        }
      }
      if (data.action.type === "buy" && self && data.action.price !== clocked.price) {
        // Ціна могла змінитися опівночі UTC між відкриттям вікна й натисканням. Рушій не чіпаємо: перевіряємо тут.
        await persist();
        return { world: base, error: `Ціна щойно змінилась: тепер ${clocked.price} ✦. Перевір і підтвердь ще раз.`, self: own(bag.people, self) };
      }
      if (data.action.type === "topup" && self) {
        const { getRequestUrl } = await import("@tanstack/react-start/server");
        // Адресу повернення беремо з налаштувань сайту, а не з заголовка Host.
        const site = process.env.URL?.trim() ?? "";
        const origin = site.startsWith("https://") ? site.replace(/\/$/, "") : new URL(getRequestUrl()).origin;
        const opened = await openCheckout(self, data.action.amount, origin);
        if ("error" in opened) return { world: base, error: opened.error, self: own(bag.people, self) };
        const topups: Topup[] = [
          ...bag.topups.filter((row) => row.id !== opened.id),
          { id: opened.id, userId: self, amount: data.action.amount, status: "open", at: clocked.now },
        ];
        await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
          packDoc(clocked, bag.keys, bag.devices, bag.people, topups, limits),
        ]);
        return { world: base, url: opened.url, notice: "Відкриваю тестову оплату.", self: own(bag.people, self) };
      }
      if (data.action.type === "confirmTopup" && self) {
        const paid = await readCheckout(data.action.sessionId);
        if ("error" in paid) return { world: base, error: paid.error, self: own(bag.people, self) };
        if (paid.userId !== self) return { world: base, error: "Це не твоя оплата.", self: own(bag.people, self) };
        const done = creditTopup(clocked, bag.topups, paid);
        const sharedPay = { ...done.world, sessionId: null };
        await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
          packDoc(sharedPay, bag.keys, bag.devices, bag.people, done.topups, limits),
        ]);
        return {
          world: attach(sharedPay, self),
          error: done.error,
          notice: done.notice,
          self: own(bag.people, self),
        };
      }

      const day = utcDay(clocked.now);
      let fresh: Identity | null = null;
      if (data.action.type === "register") {
        const person = readPerson(
          {
            given: data.action.name,
            family: data.action.family,
            birth: data.action.birth,
            email: data.action.email,
            phone: data.action.phone,
          },
          clocked.now,
        );
        if ("error" in person) {
          await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
            packDoc(clocked, bag.keys, bag.devices, bag.people, bag.topups, limits),
          ]);
          return { world: base, error: person.error };
        }
        if (bag.people.some((row) => row.email === person.email || row.phone === person.phone)) {
          await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
            packDoc(clocked, bag.keys, bag.devices, bag.people, bag.topups, limits),
          ]);
          return { world: base, error: "Така пошта або телефон вже є." };
        }
        if (!data.device || namesLeft(bag.devices, data.device, day) <= 0) {
          await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [
            packDoc(clocked, bag.keys, bag.devices, bag.people, bag.topups, limits),
          ]);
          return { world: base, error: data.device ? "Сьогодні з цього пристрою вже 3 імені." : "Пристрій не впізнано." };
        }
        fresh = { userId: "", ...person, confirmed: false, mailCode: mailCode() };
      }

      const step = run(data.action.type === "enter" ? attach(clocked, null) : base, data.action);
      if (data.action.type === "accept" && self) {
        // Лише невгаданий код рахується як спроба; помилки на кшталт «свій код» — ні.
        if (step.error === "Код недійсний або вже згас." || step.error === "Код — це 6 цифр.") {
          miss(`c:${self}`, "code");
          await persist();
          return { world: base, error: step.error, self: own(bag.people, self) };
        }
        if (!step.error) limits = forgive(limits, `c:${self}`);
      }
      let keys = bag.keys;
      let devices = bag.devices;
      let people = bag.people;
      let topups = bag.topups;
      let key: string | undefined;
      if (data.action.type === "register" && fresh && !step.error && step.world.sessionId && data.device) {
        key = mintKey();
        keys = { ...keys, [step.world.sessionId]: key };
        devices = markDevice(devices, data.device, day);
        fresh = { ...fresh, userId: step.world.sessionId };
        people = [...people, fresh];
      }
      const shared = { ...step.world, sessionId: null };
      await sql.query(`update orbit_world set doc = $1::jsonb, updated_at = now() where id = 'world'`, [packDoc(shared, keys, devices, people, topups, limits)]);
      const session = step.world.sessionId;
      return { ...step, world: attach(shared, session), key, self: fresh?.userId ? fresh : own(people, session) };
    });
}
