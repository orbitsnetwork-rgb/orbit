import { test } from "node:test";
import assert from "node:assert/strict";
import { trustGraph } from "./trust-path";
import { cardTrust, pickCardWords, trustLine, vouchersLine, vouchersOf } from "./seek-trust";

const acc = (id: string) => ({ id, name: id }) as never;
const cr = (userId: string, w: string[]) => ({ id: userId + w.join(), userId, status: "done", confirms: w.map((x) => ({ witnessId: x, at: 1 })) }) as never;
// me — a — b — c — d (ланцюжок), x — окремо; b має двох поручителів (a, z).
const world = { accounts: ["me", "a", "b", "c", "d", "x", "z"].map(acc), creations: [cr("a", ["me"]), cr("b", ["a", "z", "ghost"]), cr("b", ["a"]), cr("c", ["b"]), cr("d", ["c"])] };

test("seek trust: degree and via-chain from the viewer (≤3°)", () => {
  const g = trustGraph(world);
  assert.deepEqual(cardTrust(g, world, "me", "a"), { d: 1, via: [], vouchers: 1 });
  assert.deepEqual(cardTrust(g, world, "me", "b"), { d: 2, via: ["a"], vouchers: 2 });
  assert.deepEqual(cardTrust(g, world, "me", "c"), { d: 3, via: ["a", "b"], vouchers: 1 });
  assert.equal(cardTrust(g, world, "me", "d").d, null, "4 кроки — поза колом");
  assert.equal(cardTrust(g, world, "me", "x").d, null);
});

test("seek trust: vouchers are distinct known people, no self, no ghosts", () => {
  assert.equal(vouchersOf(world, "b"), 2);
  assert.equal(vouchersOf(world, "x"), 0);
  assert.equal(vouchersOf({ accounts: world.accounts, creations: [cr("x", ["x"])] }, "x"), 0);
});

test("seek trust: lines in Ukrainian with plurals", () => {
  const n = (id: string) => id.toUpperCase();
  assert.equal(trustLine({ d: 1, via: [], vouchers: 1 }, n), "Пряме підтвердження з тобою");
  assert.equal(trustLine({ d: 3, via: ["a", "b"], vouchers: 1 }, n), "Через A → B");
  assert.equal(trustLine({ d: null, via: [], vouchers: 0 }, n), "Поза твоїм колом довіри");
  assert.equal(vouchersLine(0), "Ще без поручителів — знайомся обережно");
  assert.equal(vouchersLine(1), "1 поручитель");
  assert.equal(vouchersLine(3), "3 поручителі");
  assert.equal(vouchersLine(5), "5 поручителів");
  assert.equal(vouchersLine(11), "11 поручителів");
  assert.equal(vouchersLine(21), "21 поручитель");
  assert.equal(vouchersLine(22), "22 поручителі");
});

test("seek trust: card words — hidden/unknown/blocked dropped, newest first, max 2", () => {
  const known = new Set(["a", "b", "c", "d", "e"]);
  const rows = [
    { witness_id: "a", author_id: "b", text: "old", at: "1" },
    { witness_id: "c", author_id: "b", text: "new", at: 5 },
    { witness_id: "d", author_id: "b", text: "mid", at: 3 },
    { witness_id: "e", author_id: "b", text: "hidden", at: 9, hidden: true },
    { witness_id: "ghost", author_id: "b", text: "ghost", at: 10 },
    { witness_id: "e", author_id: "c", text: "blocked", at: 4 },
    { witness_id: "a", author_id: "c", text: "ok", at: 2 },
  ];
  const m = pickCardWords(rows, known, new Set(["e"]));
  assert.deepEqual(m.get("b")?.map((w) => w.text), ["new", "mid"]);
  assert.deepEqual(m.get("c"), [{ from: "a", text: "ok", at: 2 }]);
  assert.equal(m.has("a"), false);
});
