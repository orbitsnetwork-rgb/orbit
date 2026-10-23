import { test } from "node:test";
import assert from "node:assert/strict";
import { findRings, type RingInput } from "./bot-ring";

const H = 3_600_000, D = 24 * H, T0 = Date.UTC(2026, 9, 1);
const acc = (id: string, at: number) => ({ id, name: id.toUpperCase() + ".", createdAt: at });
const cf = (witness: string, author: string, at: number) => ({ witness, author, at });

// Кільце: 4 акаунти за 20 хв, по двоє на двох пристроях, підтверджують одне одного по колу, ззовні — ніхто.
const ring: RingInput = {
  accounts: [acc("u-a", T0), acc("u-b", T0 + 5 * 60_000), acc("u-c", T0 + 12 * 60_000), acc("u-d", T0 + 20 * 60_000)],
  confirms: [cf("u-c", "u-a", T0 + H), cf("u-d", "u-b", T0 + H), cf("u-a", "u-d", T0 + 2 * H), cf("u-b", "u-c", T0 + 2 * H)],
  seen: { "d-AAAAAAAA": ["u-a", "u-b"], "d-BBBBBBBB": ["u-c", "u-d"] },
  flagged: [],
};

test("bot ring: dense burst cluster on shared devices is flagged high, with plain reasons", () => {
  const out = findRings(ring);
  assert.equal(out.length, 1);
  const r = out[0];
  assert.equal(r.level, "high");
  assert.equal(r.stats.size, 4);
  assert.deepEqual(r.members.map((m) => m.userId), ["u-a", "u-b", "u-c", "u-d"], "ordered by creation time");
  assert.equal(r.stats.sharedDevices, 2);
  assert.equal(r.stats.maxPerDevice, 2);
  assert.equal(r.stats.inside, 4);
  assert.equal(r.stats.outside, 0);
  assert.equal(r.stats.spanMin, 20);
  assert.ok(r.reasons.some((s) => s.includes("2 пристрої")), r.reasons.join(" | "));
  assert.ok(r.reasons.some((s) => s.includes("створені за 20 хв")), r.reasons.join(" | "));
  assert.ok(r.reasons.includes("жодного підтвердження від людей поза групою"));
});

test("bot ring: no device ids ever leave the module", () => {
  const json = JSON.stringify(findRings(ring));
  assert.ok(!/d-[A-Z2-9]{8}/.test(json), json);
  assert.ok(!json.includes("AAAAAAAA"));
});

test("bot ring: a real community grown over weeks is not reported", () => {
  const accounts = Array.from({ length: 12 }, (_, i) => acc("u-" + i, T0 + i * 3 * D));
  const confirms = accounts.slice(1).map((a, i) => cf(accounts[i].id, a.id, a.createdAt + 2 * H));
  assert.deepEqual(findRings({ accounts, confirms, seen: {}, flagged: [] }), []);
});

test("bot ring: friends who joined together but have an outside voucher stay hidden", () => {
  const host = acc("u-host", T0 - 30 * D);
  const friends = ["u-f1", "u-f2", "u-f3", "u-f4"].map((id, i) => acc(id, T0 + i * 10 * 60_000));
  // Подруга f1 прийшла першою і за неї поручилась давня учасниця; далі f1 підтвердила решту.
  const confirms = [cf("u-host", "u-f1", T0 + H), cf("u-f1", "u-f2", T0 + 2 * H), cf("u-f1", "u-f3", T0 + 2 * H), cf("u-f2", "u-f4", T0 + 3 * H)];
  assert.deepEqual(findRings({ accounts: [host, ...friends], confirms, seen: {}, flagged: [] }), []);
});

test("bot ring: outside vouchers lower the score; a family tablet alone is not a ring", () => {
  const base = findRings(ring)[0].score;
  const old = acc("u-old", T0 - 60 * D);
  const withRoots = findRings({ ...ring, accounts: [...ring.accounts, old], confirms: [...ring.confirms, cf("u-old", "u-a", T0 + H)] });
  assert.ok(!withRoots[0] || withRoots[0].score < base);
  // Троє на одному планшеті, створені в різні місяці, без підтверджень між собою.
  const fam = [acc("u-m", T0), acc("u-p", T0 + 40 * D), acc("u-k", T0 + 80 * D)];
  assert.deepEqual(findRings({ accounts: fam, confirms: [], seen: { "d-CCCCCCCC": ["u-m", "u-p", "u-k"] }, flagged: [] }), []);
});

test("bot ring: pairs are ignored, ghosts/self-confirms/duplicates don't count, bot flags add weight", () => {
  const two: RingInput = { accounts: ring.accounts.slice(0, 2), confirms: [cf("u-b", "u-a", T0 + H)], seen: { "d-AAAAAAAA": ["u-a", "u-b"] }, flagged: [] };
  assert.deepEqual(findRings(two), [], "a pair is never a ring");
  const noisy = { ...ring, confirms: [...ring.confirms, ...ring.confirms, cf("u-a", "u-a", T0), cf("u-ghost", "u-a", T0)], seen: { ...ring.seen, "d-DDDDDDDD": ["u-ghost", "u-zz"] } };
  assert.equal(findRings(noisy)[0].stats.inside, 4);
  assert.equal(findRings(noisy)[0].stats.outside, 0);
  const flaggedRing = findRings({ ...ring, flagged: ["u-a"] })[0];
  assert.ok(flaggedRing.score >= findRings(ring)[0].score);
  assert.equal(flaggedRing.stats.flagged, 1);
  assert.ok(flaggedRing.reasons.some((s) => s.includes("схоже на бота")));
});

test("bot ring: stable key, capped output", () => {
  assert.equal(findRings(ring)[0].key, findRings({ ...ring, accounts: [...ring.accounts].reverse() })[0].key);
  const many: RingInput = { accounts: [], confirms: [], seen: {}, flagged: [] };
  for (let k = 0; k < 40; k++) {
    const ids = [0, 1, 2].map((i) => `u-${k}-${i}`);
    many.accounts.push(...ids.map((id, i) => acc(id, T0 + k * 30 * D + i * 60_000)));
    many.seen[`d-${String(k).padStart(8, "X")}`] = ids;
    many.confirms.push(cf(ids[0], ids[1], T0 + k * 30 * D + H), cf(ids[1], ids[2], T0 + k * 30 * D + H), cf(ids[2], ids[0], T0 + k * 30 * D + H));
  }
  assert.equal(findRings(many).length, 30);
});
