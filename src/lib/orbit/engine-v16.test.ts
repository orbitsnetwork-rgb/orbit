import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptCode, buyOldest, emptyWorld, issueCode, listOrbit, register, startCreation, type World } from "./engine.ts";
import { buildLedger } from "./ledger.ts";

const T0 = Date.UTC(2026, 9, 19, 12);
const OD = /(?<!\p{L})ОД(?!\p{L})/u;

function people(n: number): World {
  let w = emptyWorld(T0);
  for (let i = 0; i < n; i++) w = { ...register({ ...w, now: T0 }, `Людина ${i}`).world, now: T0 };
  return w;
}
const as = (w: World, i: number): World => ({ ...w, sessionId: w.accounts[i].id, now: T0 });

test("v16: every trade records buyer and seller ids; log speaks ✦, never «ОД»", () => {
  let w = people(4);
  w = { ...w, orbits: [{ id: 1, ownerId: w.accounts[0].id, createdAt: T0 }], nextNo: 2, accounts: w.accounts.map((a) => ({ ...a, balance: 1000 })) };
  w = listOrbit(as(w, 0), 1).world;
  const step = buyOldest(as(w, 1));
  assert.equal(step.error, undefined);
  const trade = step.world.trades.at(-1)!;
  assert.equal(trade.buyerId, w.accounts[1].id);
  assert.equal(trade.sellerId, w.accounts[0].id);
  assert.equal(trade.amount, 100);
  assert.ok(step.world.log.every((row) => !OD.test(row.text)), "no «ОД» in engine log");
  assert.match(step.world.log[0].text, /за 100 ✦\. Продавцю 97\. У фонд 2\./);
  assert.match(buyOldest(as({ ...w, accounts: w.accounts.map((a) => ({ ...a, balance: 0 })) }, 1)).error ?? "", /Не вистачає ✦/);
});

test("v16: listing ids are unique even when listed in the same millisecond", () => {
  let w = people(5);
  w = { ...w, orbits: w.accounts.map((a, i) => ({ id: i + 1, ownerId: a.id, createdAt: T0 })), nextNo: 6 };
  for (let i = 0; i < 5; i++) w = listOrbit(as(w, i), i + 1).world;
  const ids = w.queue.map((row) => row.id);
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
});

test("v16: live codes are crypto-random (Math.random is not used) and never collide with another live code", () => {
  const realRandom = Math.random;
  Math.random = () => 0.5; // the old generator would give 550000 every time
  try {
    // crew3: свідок старше години (правило від 10 людей) — акаунти «старші» на 2 год.
    let w = people(60);
    w = { ...w, accounts: w.accounts.map((a) => ({ ...a, createdAt: a.createdAt - 2 * 60 * 60 * 1000 })) };
    for (let i = 0; i < 60; i++) {
      w = startCreation(as(w, i)).world;
      const step = issueCode(as(w, i));
      assert.match(step.notice ?? "", /^\d{6}$/);
      w = step.world;
    }
    const codes = w.creations.map((c) => c.code).filter(Boolean);
    assert.equal(codes.length, 60);
    assert.equal(new Set(codes).size, 60, "all live codes distinct");
    assert.ok(codes.filter((c) => c === "550000").length <= 1, "codes do not come from Math.random");
    // and a code still works end to end
    const target = w.creations[0];
    const ok = acceptCode(as(w, 1), target.code!);
    assert.equal(ok.error, undefined);
  } finally {
    Math.random = realRandom;
  }
});

test("v16: ledger reads purchases from both legacy «ОД» and new ✦ log lines", () => {
  const w0 = people(2);
  const user = { ...w0.accounts[0] };
  const before = T0 - 10_000;
  const world: World = {
    ...w0,
    log: [
      { at: before + 2, text: `${user.name} купив #7 за 120 ✦. Продавцю 116. У фонд 3.` },
      { at: before + 1, text: `${user.name} купив #5 за 100 ОД. Продавцю 97. У фонд 2.` },
    ],
  };
  const rows = buildLedger(world, user, [], [{ t: "join", at: T0 }]);
  const buys = rows.filter((row) => row.kind === "buy").map((row) => [row.orbitId, row.amount]);
  assert.deepEqual(buys.sort(), [[5, -100], [7, -120]].sort());
});
