export const ORBIT_CAP = 8_000_000;
export const MIN_PRICE = 100;
export const PRICE_FACTOR = 15;
export const PRICE_FLOOR_UNTIL = 1000;
/** Б3: ціна дня рахується із середнього обороту за 7 попередніх діб і змінюється не більше ніж на ±10% за добу. */
export const PRICE_WINDOW_DAYS = 7;
export const PRICE_DAILY_CAP = 0.1;
export const CHARGE_MS = 24 * 60 * 60 * 1000;
export const CODE_MS = 10 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const FUND_PERIOD_MS = 3 * DAY_MS;
/** Одне підтвердження від однієї людини запускає заряд. Пара «свідок → автор» — лише раз за життя. */
export const CONFIRM_NEED = 1;
/** Постійний екіпаж. Поки людей менше чотирьох — стільки свідків, скільки є, щоб старт був з двох. */
export const CREW_EASY_UNTIL = 4;
/** Зі стрічки можна підтвердити лише після 10 хвилин життя акаунта. Код від людини — одразу. */
export const FEED_MIN_AGE_MS = 10 * 60 * 1000;
export const CODES_PER_DAY = 3;
export const NOVICE_CODES_PER_DAY = 1;
export const STABILITY_GATE = 20;
export const STABILITY_CONFIRM = 3;
export const STABILITY_FAIL = 2;
export const STABILITY_CREATE = 8;
export const STABILITY_CONFIRM_CAP = 15;
export const STABILITY_BUY = 1;
export const SELLER_SHARE = 0.97;
export const FUND_SHARE = 0.025;
export const IMPULSE_MS = 48 * 60 * 60 * 1000;
export const STARTER_OD = 200;
export const WITNESS_OD = 20;

export type Confirm = { witnessId: string; at: number };

export type Account = {
  id: string;
  name: string;
  stability: number;
  balance: number;
  createdAt: number;
  confirmDay: string;
  confirmsToday: number;
  stabilityFromConfirmToday: number;
  /** Б4: окремий день для ліміту стабільності за підтвердження (раніше ділив поле confirmDay з лічильником кодів). */
  stabilityDay?: string;
  /** Б5: стартові ✦, що чекають першого внеску (успішне підтвердження або власна орбіта). */
  starterPending?: number;
  /**
   * Частина балансу з реальних (тестових) поповнень — окремо від зароблених ✦. Купівля списує спершу її.
   * Основа для можливого майбутнього обмеженого виводу саме цієї частини. Вивід НЕ ввімкнено.
   */
  toppedUp?: number;
  impulseUntil: number;
  lastActiveAt: number;
};

export type Orbit = { id: number; ownerId: string; createdAt: number };

export type Creation = {
  id: string;
  userId: string;
  confirms: Confirm[];
  status: "collecting" | "charging" | "done" | "failed";
  code: string | null;
  codeExpires: number;
  codeDay: string;
  codesToday: number;
  chargeStartedAt: number | null;
};

export type Listing = { id: string; orbitId: number; userId: string; createdAt: number };

/** buyerId/sellerId — з v16 (старі угоди їх не мають). На формули не впливають. */
export type Trade = { at: number; amount: number; orbitId: number; buyerId?: string; sellerId?: string };

export type Payout = { at: number; userId: string; amount: number };

export type World = {
  now: number;
  sessionId: string | null;
  accounts: Account[];
  orbits: Orbit[];
  creations: Creation[];
  queue: Listing[];
  trades: Trade[];
  payouts: Payout[];
  fund: number;
  reserve: number;
  nextNo: number;
  price: number;
  priceDay: string;
  lastDistributionAt: number;
  log: { at: number; text: string }[];
};

export type Step = { world: World; error?: string; notice?: string };

export function emptyWorld(now = Date.now()): World {
  return {
    now,
    sessionId: null,
    accounts: [],
    orbits: [],
    creations: [],
    queue: [],
    trades: [],
    payouts: [],
    fund: 0,
    reserve: 0,
    nextNo: 1,
    price: MIN_PRICE,
    priceDay: utcDay(now),
    lastDistributionAt: now,
    log: [],
  };
}

export function chanceOf(issued: number) {
  const raw = 0.95 - (issued / ORBIT_CAP) * 0.8;
  return Math.min(0.95, Math.max(0.15, raw));
}

export function priceOf(issued: number, turnover: number) {
  if (issued < PRICE_FLOOR_UNTIL) return MIN_PRICE;
  const raw = issued === 0 ? 0 : (turnover * PRICE_FACTOR) / issued;
  return Math.max(MIN_PRICE, Math.round(raw));
}

export function utcDay(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function holdBonus(heldMs: number) {
  if (heldMs >= 30 * DAY_MS) return 0.5;
  if (heldMs >= 14 * DAY_MS) return 0.25;
  if (heldMs >= 7 * DAY_MS) return 0.1;
  return 0;
}

export function me(world: World) {
  return world.accounts.find((account) => account.id === world.sessionId) ?? null;
}

export function crewNeed(world: World) {
  void world;
  return CONFIRM_NEED;
}

export function activeCreation(world: World, userId: string) {
  return world.creations.find((item) => item.userId === userId && (item.status === "collecting" || item.status === "charging")) ?? null;
}

function note(world: World, text: string): World {
  return { ...world, log: [{ at: world.now, text }, ...world.log].slice(0, 40) };
}

function patchAccount(world: World, id: string, edit: (account: Account) => Account): World {
  return { ...world, accounts: world.accounts.map((account) => (account.id === id ? edit(account) : account)) };
}

/** Б5: перший внесок відкриває стартові ✦. */
function vest(account: Account): Account {
  const pending = account.starterPending ?? 0;
  return pending > 0 ? { ...account, balance: account.balance + pending, starterPending: 0 } : account;
}

function touch(world: World, id: string): World {
  return patchAccount(world, id, (account) => ({ ...account, lastActiveAt: world.now }));
}

/** crew3-міграція: старі заявки, що вже мають ≥ потрібних підтверджень (з епохи «8»), одразу йдуть на заряд. */
function promoteReady(world: World): World {
  const need = crewNeed(world);
  if (!world.creations.some((item) => item.status === "collecting" && item.confirms.length >= need)) return world;
  return {
    ...world,
    creations: world.creations.map((item) =>
      item.status === "collecting" && item.confirms.length >= need ? { ...item, status: "charging", chargeStartedAt: world.now, code: null, codeExpires: 0 } : item,
    ),
  };
}

export function settle(world: World): World {
  let next = resolveCharges(promoteReady(world));
  next = rollPrice(next);
  next = distribute(next);
  return next;
}

/** Put the stored world on the wall clock, then settle. Formulas stay in settle. */
export function adoptClock(world: World, wall = Date.now()): World {
  const creations = world.creations.map((item) => {
    if (item.code && item.codeExpires > wall + CODE_MS) return { ...item, codeExpires: wall };
    return item;
  });
  return settle({
    ...world,
    now: wall,
    creations,
    lastDistributionAt: Math.min(world.lastDistributionAt, wall),
  });
}

function resolveCharges(world: World): World {
  let next = world;
  for (const creation of world.creations) {
    if (creation.status !== "charging" || creation.chargeStartedAt == null) continue;
    if (world.now < creation.chargeStartedAt + CHARGE_MS) continue;
    const issued = next.orbits.length;
    const chance = chanceOf(issued);
    const ok = Math.random() < chance;
    if (ok && next.nextNo <= ORBIT_CAP) {
      const stillOpen = next.orbits.length < ORBIT_CAP;
      const orbit: Orbit = { id: next.nextNo, ownerId: creation.userId, createdAt: next.now };
      next = {
        ...next,
        nextNo: next.nextNo + 1,
        orbits: [...next.orbits, orbit],
        creations: next.creations.map((item) => (item.id === creation.id ? { ...item, status: "done" as const, code: null } : item)),
      };
      if (stillOpen) {
        next = patchAccount(next, creation.userId, (account) => ({ ...account, stability: account.stability + STABILITY_CREATE }));
      }
      next = patchAccount(next, creation.userId, vest);
      if (stillOpen) {
        next = grantWitnesses(next, creation.confirms, STABILITY_CONFIRM);
      }
      next = note(next, `Заряд пройшов. Орбіта #${orbit.id} у ${nameOf(next, creation.userId)}. Шанс був ${Math.round(chance * 100)}%.`);
    } else {
      next = {
        ...next,
        creations: next.creations.map((item) => (item.id === creation.id ? { ...item, status: "failed" as const, code: null } : item)),
      };
      next = grantWitnesses(next, creation.confirms, -STABILITY_FAIL);
      next = note(next, `Заряд зірвався. Підтвердження згоріли. Шанс був ${Math.round(chance * 100)}%.`);
    }
  }
  return next;
}

function grantWitnesses(world: World, confirms: Confirm[], delta: number): World {
  let next = world;
  const day = utcDay(world.now);
  for (const confirm of confirms) {
    next = patchAccount(next, confirm.witnessId, (account) => {
      // Б4: лічильник кодів (confirmDay/confirmsToday) тут не чіпаємо — інакше вчорашній confirmsToday блокував новачка.
      const sameDay = (account.stabilityDay ?? account.confirmDay) === day;
      const used = sameDay ? account.stabilityFromConfirmToday : 0;
      let add = delta;
      if (delta > 0) add = Math.max(0, Math.min(delta, STABILITY_CONFIRM_CAP - used));
      const paid = delta > 0 ? vest(account) : account;
      return {
        ...paid,
        stability: Math.max(0, account.stability + add),
        stabilityDay: day,
        stabilityFromConfirmToday: delta > 0 ? used + add : used,
        balance: paid.balance + (delta > 0 ? WITNESS_OD : 0),
      };
    });
  }
  return next;
}

function rollPrice(world: World): World {
  const day = utcDay(world.now);
  if (day === world.priceDay) return world;
  const end = Date.parse(`${day}T00:00:00.000Z`);
  const start = end - PRICE_WINDOW_DAYS * DAY_MS;
  const turnover = world.trades.filter((trade) => trade.at >= start && trade.at < end).reduce((sum, trade) => sum + trade.amount, 0);
  const target = priceOf(world.orbits.length, turnover / PRICE_WINDOW_DAYS);
  const prev = world.price;
  const price =
    world.orbits.length < PRICE_FLOOR_UNTIL
      ? MIN_PRICE
      : Math.max(MIN_PRICE, Math.min(Math.round(prev * (1 + PRICE_DAILY_CAP)), Math.max(Math.round(prev * (1 - PRICE_DAILY_CAP)), target)));
  return note({ ...world, price, priceDay: day }, `Ціна на добу ${day}: ${price} ✦.`);
}

function distribute(world: World): World {
  if (world.now < world.lastDistributionAt + FUND_PERIOD_MS || world.fund <= 0) return world;
  const rows = amountsFor(world);
  if (rows.length === 0) return { ...world, lastDistributionAt: world.now };
  const payouts: Payout[] = [];
  let next = world;
  let spent = 0;
  for (const row of rows) {
    if (row.amount <= 0) continue;
    spent += row.amount;
    payouts.push({ at: world.now, userId: row.id, amount: row.amount });
    next = patchAccount(next, row.id, (account) => ({ ...account, balance: account.balance + row.amount }));
  }
  next = note(
    { ...next, fund: world.fund - spent, lastDistributionAt: world.now, payouts: [...payouts, ...world.payouts].slice(0, 30) },
    `Фонд поділено: ${spent} ✦ між ${payouts.length}.`,
  );
  return next;
}

function amountsFor(world: World, extraHoldMs = 0, onlyId = ""): { id: string; amount: number }[] {
  if (world.fund <= 0) return [];
  // Б1h: фонд ділиться лише між активними власниками орбіт (альт-акаунти без орбіт нічого не отримують).
  const holders = new Set(world.orbits.map((orbit) => orbit.ownerId));
  const active = world.accounts.filter((account) => world.now - account.lastActiveAt <= FUND_PERIOD_MS && holders.has(account.id));
  if (active.length === 0) return [];
  const equalPool = world.fund * 0.7;
  const weightPool = world.fund * 0.3;
  const weights = active.map((account) => {
    const recent = world.now - account.lastActiveAt <= DAY_MS ? 2 : 1;
    return Math.max(account.stability, 0) * recent;
  });
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const raw = active.map((account, index) => {
    const equal = equalPool / active.length;
    const weighted = weightSum > 0 ? (weightPool * weights[index]) / weightSum : weightPool / active.length;
    const bonus = holdOf(world, account.id, account.id === onlyId ? extraHoldMs : 0);
    return Math.floor((equal + weighted) * (1 + bonus));
  });
  let amounts = raw;
  const spent = raw.reduce((sum, value) => sum + value, 0);
  if (spent > world.fund && spent > 0) {
    const scale = world.fund / spent;
    amounts = raw.map((value) => Math.floor(value * scale));
  }
  return active.map((account, index) => ({ id: account.id, amount: amounts[index] ?? 0 }));
}

/** Read-only look at the current fund. Does not pay and does not move the clock. */
export function previewShare(world: World, userId: string, extraHoldMs = 0) {
  return amountsFor(world, extraHoldMs, userId).find((row) => row.id === userId)?.amount ?? 0;
}

function holdOf(world: World, userId: string, extraMs: number) {
  const mine = world.orbits.filter((orbit) => orbit.ownerId === userId);
  return mine.reduce((best, orbit) => Math.max(best, holdBonus(world.now + extraMs - orbit.createdAt)), 0);
}

function nameOf(world: World, id: string) {
  return world.accounts.find((account) => account.id === id)?.name ?? "хтось";
}

/** Випадкове ціле 0…n-1 з криптографічного джерела (без зсуву по модулю). */
function secureInt(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const box = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(box);
    if (box[0] < limit) return box[0] % n;
  }
}

/** Код підтвердження: 6 цифр, crypto-random і не збігається з жодним іншим живим кодом. */
function liveCode(world: World): string {
  const live = new Set(world.creations.filter((item) => item.status === "collecting" && item.code && world.now < item.codeExpires).map((item) => item.code));
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = String(100000 + secureInt(900000));
    if (!live.has(code)) return code;
  }
  return String(100000 + secureInt(900000));
}

/** Унікальний id лота: час + номер орбіти (+ суфікс, якщо такий id уже є в черзі). Детерміновано, без випадковості. */
function listingId(world: World, orbitId: number): string {
  const base = `q-${world.now.toString(36)}-${orbitId}`;
  const taken = new Set(world.queue.map((item) => item.id));
  if (!taken.has(base)) return base;
  let n = 1;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function register(world: World, rawName: string): Step {
  const name = rawName.trim().slice(0, 32);
  if (name.length < 2) return { world, error: "Ім’я — щонайменше дві літери." };
  const base = settle(world);
  if (base.accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) {
    return { world, error: "Таке ім’я вже є." };
  }
  const account: Account = {
    id: `u-${base.now.toString(36)}-${base.accounts.length}`,
    name,
    stability: 0,
    balance: 0,
    starterPending: STARTER_OD,
    createdAt: base.now,
    confirmDay: "",
    confirmsToday: 0,
    stabilityFromConfirmToday: 0,
    stabilityDay: "",
    impulseUntil: 0,
    lastActiveAt: base.now,
  };
  const next = note(
    { ...base, accounts: [...base.accounts, account], sessionId: account.id },
    `${name} у системі. Стабільність 0. Стартові ${STARTER_OD} ✦ — після першого внеску.`,
  );
  return { world: next, notice: `Можна підтверджувати одразу. До стабільності 20 — один код на добу. Стартові ${STARTER_OD} ✦ — після першого успішного підтвердження або власної орбіти.` };
}

export function enter(world: World, id: string): Step {
  if (!world.accounts.some((account) => account.id === id)) return { world, error: "Акаунта немає." };
  return { world: touch(settle({ ...world, sessionId: id }), id) };
}

export function startCreation(world: World): Step {
  const user = me(world);
  if (!user) return { world, error: "Спочатку ім’я." };
  const base = settle(world);
  if (base.orbits.length >= ORBIT_CAP) return { world: base, error: "Усі 8 000 000 вже видобуті." };
  if (activeCreation(base, user.id)) return { world: base, error: "Вже є одна активна заявка." };
  const creation: Creation = {
    id: `c-${base.now.toString(36)}-${base.creations.length}`,
    userId: user.id,
    confirms: [],
    status: "collecting",
    code: null,
    codeExpires: 0,
    codeDay: "",
    codesToday: 0,
    chargeStartedAt: null,
  };
  return { world: note({ ...base, creations: [...base.creations, creation] }, `${user.name} відкрив заявку на орбіту.`) };
}

export function issueCode(world: World): Step {
  const user = me(world);
  if (!user) return { world, error: "Спочатку ім’я." };
  const base = settle(world);
  const creation = activeCreation(base, user.id);
  if (!creation || creation.status !== "collecting") return { world: base, error: "Немає заявки, яка збирає підтвердження." };
  if (creation.code && base.now < creation.codeExpires) return { world: base, error: "Код ще живий. Зачекай, поки згасне." };
  const day = utcDay(base.now);
  const used = creation.codeDay === day ? creation.codesToday : 0;
  if (used >= CODES_PER_DAY) return { world: base, error: "Сьогодні вже 3 коди. Завтра можна знову." };
  const code = liveCode(base);
  const nextCreation: Creation = { ...creation, code, codeExpires: base.now + CODE_MS, codeDay: day, codesToday: used + 1 };
  return {
    world: note(
      { ...base, creations: base.creations.map((item) => (item.id === creation.id ? nextCreation : item)) },
      `${user.name} випустив код на 10 хвилин.`,
    ),
    notice: code,
  };
}

/** Захист від кілець фейків (ціну, Фонд і заряд не змінює). */
export const MUTUAL_MAX = 2;
export const GUARD_FROM = 10;
/** Скільки власників орбіт має бути у світі, щоб діяло правило «останній свідок — з орбітою». */
export const ANCHOR_FROM = 10;
export const WITNESS_MIN_AGE_MS = 60 * 60 * 1000;

/** Автор уже підтверджував цього свідка раніше — «взаємне» підтвердження. */
export function isMutual(world: World, authorId: string, witnessId: string) {
  return world.creations.some((item) => item.userId === witnessId && item.confirms.some((row) => row.witnessId === authorId));
}

/** Чому цей свідок зараз не може підтвердити цей запуск (або null). */
export function witnessBlock(world: World, creation: Creation, witness: Account): string | null {
  if (world.accounts.length < GUARD_FROM) return null;
  if (world.now - witness.createdAt < WITNESS_MIN_AGE_MS) return "Новий акаунт може підтверджувати через годину після реєстрації.";
  // Одне підтвердження = одна людина. Від 10 людей «ти мені — я тобі» не працює: зустрічне підтвердження має дати хтось інший.
  if (isMutual(world, creation.userId, witness.id)) {
    return "Ця людина вже підтверджувала тебе. Взаємно не можна — попроси когось іншого.";
  }
  const anchors = new Set(world.orbits.map((orbit) => orbit.ownerId)).size;
  if (anchors >= ANCHOR_FROM && !world.orbits.some((orbit) => orbit.ownerId === witness.id)) {
    return "Підтверджувати може той, у кого вже є орбіта. Так нові акаунти не запускають орбіти лише між собою.";
  }
  return null;
}

function applyConfirm(base: World, creation: Creation, user: Account): Step {
  const day = utcDay(base.now);
  const fresh = base.accounts.find((account) => account.id === user.id) ?? user;
  const blocked = witnessBlock(base, creation, fresh);
  if (blocked) return { world: base, error: blocked };
  const used = fresh.confirmDay === day ? fresh.confirmsToday : 0;
  const cap = fresh.stability >= STABILITY_GATE ? CODES_PER_DAY : NOVICE_CODES_PER_DAY;
  if (used >= cap) {
    return { world: base, error: fresh.stability >= STABILITY_GATE ? "Сьогодні вже 3 підтвердження." : "До стабільності 20 — одне підтвердження на добу." };
  }
  const need = crewNeed(base);
  const confirms = [...creation.confirms, { witnessId: user.id, at: base.now }];
  const full = confirms.length >= need;
  const nextCreation: Creation = {
    ...creation,
    confirms,
    code: null,
    codeExpires: 0,
    status: full ? "charging" : "collecting",
    chargeStartedAt: full ? base.now : null,
  };
  let next: World = {
    ...base,
    creations: base.creations.map((item) => (item.id === creation.id ? nextCreation : item)),
  };
  next = patchAccount(next, user.id, (account) => ({
    ...account,
    confirmDay: day,
    confirmsToday: used + 1,
    lastActiveAt: next.now,
  }));
  next = note(next, full ? `${user.name} зібрав екіпаж. Заряд на 24 години.` : `${user.name} підтвердив. Тепер ${confirms.length} з ${need}.`);
  return { world: next, notice: full ? "Заряд пішов. Результат через 24 години." : `${confirms.length} з ${need}.` };
}

/** Один свідок підтверджує одну й ту саму людину лише раз за життя. */
function alreadyVouched(world: World, witnessId: string, authorId: string) {
  return world.creations.some((item) =>
    item.userId === authorId && item.confirms.some((confirm) => confirm.witnessId === witnessId),
  );
}

export function acceptCode(world: World, raw: string): Step {
  const user = me(world);
  if (!user) return { world, error: "Спочатку ім’я." };
  const code = raw.replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) return { world, error: "Код — це 6 цифр." };
  const base = settle(world);
  const creation = base.creations.find((item) => item.status === "collecting" && item.code === code && base.now < item.codeExpires);
  if (!creation) return { world: base, error: "Код недійсний або вже згас." };
  if (creation.userId === user.id) return { world: base, error: "Свій код не приймають." };
  if (creation.confirms.some((confirm) => confirm.witnessId === user.id)) return { world: base, error: "Ти вже підтвердив цю заявку." };
  if (alreadyVouched(base, user.id, creation.userId)) return { world: base, error: "Цю людину ти вже підтверджував. Одну людину — лише раз за життя." };
  return applyConfirm(base, creation, user);
}

/** Підтвердження зі стрічки: без коду, з віковим лімітом. Одну людину — лише раз за життя. */
export function confirmLaunch(world: World, creationId: string): Step {
  const user = me(world);
  if (!user) return { world, error: "Спочатку ім’я." };
  const base = settle(world);
  const creation = base.creations.find((item) => item.id === creationId && item.status === "collecting");
  if (!creation) return { world: base, error: "Цей запуск уже не збирає екіпаж." };
  if (creation.userId === user.id) return { world: base, error: "Свій запуск підтвердити не можна." };
  if (creation.confirms.some((confirm) => confirm.witnessId === user.id)) return { world: base, error: "Ти вже підтвердив цю заявку." };
  if (alreadyVouched(base, user.id, creation.userId)) return { world: base, error: "Цю людину ти вже підтверджував. Одну людину — лише раз за життя." };
  const fresh = base.accounts.find((account) => account.id === user.id) ?? user;
  if (base.now - fresh.createdAt < FEED_MIN_AGE_MS) return { world: base, error: "Зі стрічки можна підтвердити через 10 хвилин після реєстрації. Код від людини працює одразу." };
  return applyConfirm(base, creation, user);
}

export function listOrbit(world: World, orbitId: number): Step {
  const user = me(world);
  if (!user) return { world, error: "Спочатку ім’я." };
  const base = settle(world);
  const orbit = base.orbits.find((item) => item.id === orbitId && item.ownerId === user.id);
  if (!orbit) return { world: base, error: "Ця орбіта не твоя." };
  if (base.queue.some((item) => item.orbitId === orbitId)) return { world: base, error: "Вона вже в черзі." };
  const listing: Listing = { id: listingId(base, orbitId), orbitId, userId: user.id, createdAt: base.now };
  return { world: note(touch({ ...base, queue: [...base.queue, listing] }, user.id), `${user.name} поставив #${orbitId} у чергу.`) };
}

export function cancelListing(world: World, orbitId: number): Step {
  const user = me(world);
  if (!user) return { world, error: "Спочатку ім’я." };
  const base = settle(world);
  const listing = base.queue.find((item) => item.orbitId === orbitId && item.userId === user.id);
  if (!listing) return { world: base, error: "У черзі цієї орбіти немає." };
  if (base.queue[0]?.id === listing.id) return { world: base, error: "Найстарішу в черзі вже не зняти. Її можуть купити." };
  return {
    world: note(
      { ...base, queue: base.queue.filter((item) => item.id !== listing.id) },
      `${user.name} зняв #${orbitId} з черги.`,
    ),
  };
}

export function buyOldest(world: World): Step {
  const user = me(world);
  if (!user) return { world, error: "Спочатку ім’я." };
  const base = settle(world);
  const listing = base.queue[0];
  if (!listing) return { world: base, error: "Черга порожня." };
  const buyer = base.accounts.find((account) => account.id === user.id) ?? user;
  if (listing.userId === buyer.id) return { world: base, error: "Перша в черзі твоя. Купити її собі не можна." };
  const price = base.price;
  if (buyer.balance < price) return { world: base, error: `Не вистачає ✦. Потрібно ${price}.` };
  const sellerCut = Math.floor(price * SELLER_SHARE);
  const fundCut = Math.floor(price * FUND_SHARE);
  const reserveCut = price - sellerCut - fundCut;
  let next = {
    ...base,
    queue: base.queue.slice(1),
    orbits: base.orbits.map((orbit) => (orbit.id === listing.orbitId ? { ...orbit, ownerId: buyer.id, createdAt: base.now } : orbit)),
    trades: [...base.trades, { at: base.now, amount: price, orbitId: listing.orbitId, buyerId: buyer.id, sellerId: listing.userId }],
    fund: base.fund + fundCut,
    reserve: base.reserve + reserveCut,
  };
  next = patchAccount(next, listing.userId, (account) => ({
    ...account,
    balance: account.balance + sellerCut,
    impulseUntil: next.now + IMPULSE_MS,
    lastActiveAt: next.now,
  }));
  const frozen = base.orbits.length >= ORBIT_CAP;
  next = patchAccount(next, buyer.id, (account) => ({
    ...account,
    balance: account.balance - price,
    toppedUp: Math.max(0, (account.toppedUp ?? 0) - price),
    stability: frozen ? account.stability : account.stability + STABILITY_BUY,
    lastActiveAt: next.now,
  }));
  next = note(next, `${buyer.name} купив #${listing.orbitId} за ${price} ✦. Продавцю ${sellerCut}. У фонд ${fundCut}.`);
  return { world: next };
}

export function skip(world: World, ms: number): World {
  const days = Math.round(ms / DAY_MS);
  const word = days === 1 ? "доба" : "доби";
  return note(settle({ ...world, now: world.now + ms }), `Годинник перевірки: +${days} ${word}.`);
}

/** Середній добовий оборот за вікно ціни (7 попередніх діб). */
/** Скільки з балансу — поповнене (не більше за баланс) і скільки зароблене. */
export function walletSplit(account: Account) {
  const toppedUp = Math.min(Math.max(0, account.toppedUp ?? 0), Math.max(0, account.balance));
  return { toppedUp, earned: Math.max(0, account.balance - toppedUp) };
}

export function turnoverPrev(world: World) {
  return Math.round(turnoverWindow(world) / PRICE_WINDOW_DAYS);
}

export function turnoverWindow(world: World) {
  const end = Date.parse(`${utcDay(world.now)}T00:00:00.000Z`);
  const start = end - PRICE_WINDOW_DAYS * DAY_MS;
  return world.trades.filter((trade) => trade.at >= start && trade.at < end).reduce((sum, trade) => sum + trade.amount, 0);
}
