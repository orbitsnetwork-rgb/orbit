import assert from "node:assert/strict";
import test from "node:test";
import type { Creation, World } from "./engine.ts";
import { confirmLaunch, crewNeed, emptyWorld, register, startCreation } from "./engine.ts";

function as(world: ReturnType<typeof emptyWorld>, id: string) {
  return { ...world, sessionId: id };
}

test("one confirmation is always enough, at any world size", () => {
  let world = emptyWorld(1_700_000_000_000);
  for (const name of ["Аня", "Богдан", "Віра", "Гриць", "Дана"]) {
    world = register(as(world, ""), name).world;
    assert.equal(crewNeed(world), 1);
  }
});

test("feed confirm is blocked for a brand new account", () => {
  let world = emptyWorld(1_700_000_000_000);
  world = register(world, "Аня").world;
  const anya = world.sessionId!;
  world = startCreation(world).world;
  world = register(as(world, ""), "Богдан").world;
  const bogdan = world.sessionId!;
  const launch = world.creations.find((item) => item.userId === anya)!;
  const blocked = confirmLaunch(as(world, bogdan), launch.id);
  assert.equal(blocked.error, "Зі стрічки можна підтвердити через 10 хвилин після реєстрації. Код від людини працює одразу.");
});

test("one witness confirms the same person only once in a lifetime", async () => {
  const { acceptCode, issueCode, skip, DAY_MS } = await import("./engine.ts");
  let world = emptyWorld(1_700_000_000_000);
  world = register(world, "Аня").world;
  const anya = world.sessionId!;
  world = register(as(world, ""), "Богдан").world;
  const bogdan = world.sessionId!;
  world = startCreation(as(world, anya)).world;
  let r = issueCode(as(world, anya));
  world = r.world;
  const first = acceptCode(as(world, bogdan), r.notice!);
  assert.equal(first.error, undefined);
  world = skip(first.world, DAY_MS * 2);
  world = startCreation(as(world, anya)).world;
  r = issueCode(as(world, anya));
  const again = acceptCode(as(r.world, bogdan), r.notice!);
  assert.equal(again.error, "Цю людину ти вже підтверджував. Одну людину — лише раз за життя.");
});

test("guards: no reciprocal, anchor rule, witness age (only in a world of 10+)", async () => {
  const E = await import("./engine.ts");
  const now = 1_700_000_000_000;
  let world: World = emptyWorld(now);
  const ids: string[] = [];
  for (let i = 0; i < 12; i++) { world = E.register(as(world, ""), "Люди" + i).world; ids.push(world.sessionId!); }
  world = E.skip(world, 2 * E.DAY_MS);
  const acc = (id: string) => world.accounts.find((a) => a.id === id)!;
  let n = 0;
  const cr = (author: string, witnesses: string[], status = "done") =>
    ({ id: `c-t${n++}`, userId: author, status, confirms: witnesses.map((w) => ({ witnessId: w, at: now })), code: null, codeExpires: 0, codeDay: "", codesToday: 0, chargeStartedAt: null }) as unknown as Creation;
  // B (ids[1]) раніше підтвердив A (ids[0]). Зустрічно A підтвердити B не може; інший — може.
  world = { ...world, creations: [cr(ids[0], [ids[1]])] };
  const back = cr(ids[1], [], "collecting");
  assert.match(E.witnessBlock(world, back, acc(ids[0])) ?? "", /Взаємно не можна/);
  assert.equal(E.witnessBlock(world, back, acc(ids[4])), null);
  // 10 власників орбіт (ids[2..11]); у ids[0], ids[1] орбіт немає.
  world = { ...world, orbits: ids.slice(2, 12).map((o, i) => ({ id: i + 1, ownerId: o, createdAt: now })) as unknown as World["orbits"] };
  const other = cr(ids[5], [], "collecting");
  assert.match(E.witnessBlock(world, other, acc(ids[0])) ?? "", /вже є орбіта/);
  assert.equal(E.witnessBlock(world, other, acc(ids[6])), null);
  // Новий акаунт — лише через годину.
  world = E.register(as(world, ""), "Новий").world;
  const fresh = world.accounts.at(-1)!;
  assert.match(E.witnessBlock(world, other, fresh) ?? "", /через годину/);
});

test("guards: non-holder witness is refused once 10+ people hold orbits", async () => {
  const E = await import("./engine.ts");
  const now = 1_700_000_000_000;
  let world: World = emptyWorld(now);
  const ids: string[] = [];
  for (let i = 0; i < 14; i++) { world = E.register(as(world, ""), "Ліга" + i).world; ids.push(world.sessionId!); }
  world = E.skip(world, 2 * E.DAY_MS);
  world = { ...world, orbits: ids.slice(4, 14).map((o, i) => ({ id: i + 1, ownerId: o, createdAt: now })) as unknown as World["orbits"] };
  const open = { id: "c-x", userId: ids[0], status: "collecting", confirms: [], code: null, codeExpires: 0, codeDay: "", codesToday: 0, chargeStartedAt: null } as unknown as Creation;
  const acc = (id: string) => world.accounts.find((a) => a.id === id)!;
  assert.match(E.witnessBlock(world, open, acc(ids[3])) ?? "", /вже є орбіта/);
  assert.equal(E.witnessBlock(world, open, acc(ids[5])), null);
});

test("migration: an old collecting launch with ≥3 confirms starts charging on settle", async () => {
  const E = await import("./engine.ts");
  let world: World = emptyWorld(1_700_000_000_000);
  for (let i = 0; i < 6; i++) world = E.register(as(world, ""), "Мі" + i).world;
  const ids = world.accounts.map((a) => a.id);
  const old = { id: "c-old", userId: ids[0], status: "collecting", confirms: ids.slice(1, 6).map((w) => ({ witnessId: w, at: world.now })), code: null, codeExpires: 0, codeDay: "", codesToday: 0, chargeStartedAt: null } as unknown as Creation;
  const next = E.settle({ ...world, creations: [old] });
  assert.equal(next.creations[0].status, "charging");
  assert.equal(next.creations[0].chargeStartedAt, world.now);
});
