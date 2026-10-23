import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_MS, emptyWorld, register, type Account, type World } from "./engine";
import { creditTopup } from "./stripe";
import { openOrder, spentToday } from "./shop-pay";
import { shopBuy } from "./shop";
import { HOLD_CAP, RELEASE_PER_DAY, releasedLeft, P0_MICRO, SUPPLY_CAP, CURVE_MULT, drawFund, ensureSupply, rollSpark, sparkForUsd, supplyGap, supplyOf, targetMicro } from "./supply";

const acct = (id: string, balance: number, extra: Partial<Account> = {}): Account => ({ id, name: id, stability: 0, balance, createdAt: 0, confirmDay: "", confirmsToday: 0, stabilityFromConfirmToday: 0, impulseUntil: 0, lastActiveAt: 0, toppedUp: 0, ...extra });
const G = { verified: true, vouchers: 1, ring: false };
const T0 = Date.UTC(2026, 9, 23, 12);

test("supply: fresh world = 8M in the sale basket, gap 0", () => {
  const w = ensureSupply(emptyWorld(T0));
  assert.equal(w.supply!.sale, SUPPLY_CAP);
  assert.equal(supplyGap(w), 0);
});
test("supply: legacy world counts existing ✦ as already issued", () => {
  const w: World = { ...emptyWorld(T0), accounts: [acct("u-a", 300, { starterPending: 200 })], fund: 50 };
  assert.equal(supplyOf(w).sale, SUPPLY_CAP - 550);
  assert.equal(supplyGap(ensureSupply(w)), 0);
});
test("no minting: register with empty fund gives 0 starter; with fund — from fund, gap stays 0", () => {
  const a = register(emptyWorld(T0), "Аня");
  assert.equal(a.world.accounts[0].starterPending, 0);
  assert.equal(supplyGap(a.world), 0);
  const rich = ensureSupply({ ...emptyWorld(T0), accounts: [acct("u-x", 0)], fund: 100_000 });
  const b = register(rich, "Богдан");
  const nb = b.world.accounts.find((x) => x.name === "Богдан")!;
  assert.equal(nb.starterPending, 200);
  assert.equal(b.world.fund, 100_000 - 200);
  assert.equal(supplyGap(b.world), 0);
});
test("fund grants taper smoothly (≤2% of fund per grant)", () => {
  const w = ensureSupply({ ...emptyWorld(T0), fund: 500 });
  assert.equal(drawFund(w, 200).amount, 10);
  assert.equal(drawFund({ ...w, fund: 0 }, 200).amount, 0);
});
test("topup: from sale basket only, bonus from fund, toppedUp = bought part only; gap 0", () => {
  const w = ensureSupply({ ...emptyWorld(T0), accounts: [acct("u-a", 0)], fund: 40 });
  const c = creditTopup(w, [], { id: "xs-1", userId: "u-a", amount: 200, bonus: 100 });
  const a = c.world.accounts[0];
  assert.equal(a.balance, 140);
  assert.equal(a.toppedUp, 100);
  assert.equal(c.world.supply!.sale, SUPPLY_CAP - 40 - 100);
  assert.equal(c.world.fund, 0);
  assert.equal(supplyGap(c.world), 0);
});
test("shop spend recycles into fund and counts as burned", () => {
  const w = ensureSupply({ ...emptyWorld(T0), sessionId: "u-a", accounts: [acct("u-a", 300)], lastDistributionAt: T0 });
  const s = shopBuy(w, "style:neon");
  assert.equal(s.world.fund, 80);
  assert.equal(s.world.spark!.days.at(-1)!.burned, 80);
  assert.equal(supplyGap(s.world), 0);
});
test("price: floor, ceiling, ±3%/day, curve integral", () => {
  assert.equal(Math.round(targetMicro(SUPPLY_CAP, 1)), P0_MICRO);
  assert.equal(Math.round(targetMicro(0, 1.1)), P0_MICRO * CURVE_MULT);
  let w = ensureSupply({ ...emptyWorld(T0), supply: { sale: 0 } });
  w = rollSpark({ ...w, now: T0 + DAY_MS });
  assert.equal(w.spark!.micro, Math.round(P0_MICRO * 1.03));
  // інтеграл: подвійна сума дає трохи менше ніж подвійні ✦
  assert.ok(sparkForUsd(100, P0_MICRO, SUPPLY_CAP) < 2 * sparkForUsd(50, P0_MICRO, SUPPLY_CAP));
  assert.equal(sparkForUsd(0.99, P0_MICRO, SUPPLY_CAP), 100);
});
test("orders: $100/day limit and 10-min quote lock", () => {
  const w = ensureSupply({ ...emptyWorld(T0), accounts: [acct("u-a", 0)] });
  let tops: import("./access").Topup[] = [];
  for (let i = 0; i < 5; i++) {
    const o = openOrder(w, tops, "u-a", "p2600", `xs-${i}`, T0 + i, G);
    if ("error" in o) throw new Error(o.error);
    assert.equal(o.order.quoteUntil, T0 + i + 10 * 60 * 1000);
    tops = o.topups.map((t) => (t.id === `xs-${i}` ? { ...t, status: "paid" as const } : t));
  }
  assert.equal(spentToday(tops, "u-a", T0 + 10), 9995);
  assert.match((openOrder(w, tops, "u-a", "p550", "xs-9", T0 + 10, G) as { error: string }).error, /\$100/);
  assert.ok(!("error" in openOrder(w, tops, "u-a", "p550", "xs-9", T0 + DAY_MS + 10, G)));
});

test("anti-whale: gate (verified + voucher, no ring), monthly cap, holding cap, daily release", () => {
  const w = ensureSupply({ ...emptyWorld(T0), accounts: [acct("u-a", 0)] });
  assert.match((openOrder(w, [], "u-a", "p100", "x1", T0, { ...G, verified: false }) as { error: string }).error, /телефону/);
  assert.match((openOrder(w, [], "u-a", "p100", "x1", T0, { ...G, vouchers: 0 }) as { error: string }).error, /поручитель/);
  assert.match((openOrder(w, [], "u-a", "p100", "x1", T0, { ...G, ring: true }) as { error: string }).error, /призупинено/);
  let tops: import("./access").Topup[] = [];
  for (let d = 0; d < 3; d++) for (let i = 0; i < 5; i++) {
    const at = T0 + d * DAY_MS + i;
    const o = openOrder(w, tops, "u-a", "p2600", `m${d}${i}`, at, G);
    if ("error" in o) throw new Error(`${d}/${i}: ${o.error}`);
    tops = o.topups.map((t) => (t.id === `m${d}${i}` ? { ...t, status: "paid" as const } : t));
  }
  assert.match((openOrder(w, tops, "u-a", "p100", "mx", T0 + 3 * DAY_MS + 5, G) as { error: string }).error, /\$300/);
  const rich = ensureSupply({ ...emptyWorld(T0), accounts: [acct("u-a", HOLD_CAP - 50)] });
  assert.match((openOrder(rich, [], "u-a", "p100", "h", T0, G) as { error: string }).error, /80 000/);
  const s0 = { sale: 8_000_000, base: 8_000_000, since: T0 };
  assert.equal(releasedLeft(s0, T0), RELEASE_PER_DAY);
  assert.equal(releasedLeft({ ...s0, sale: 8_000_000 - 30_000 }, T0 + 2 * DAY_MS), 3 * RELEASE_PER_DAY - 30_000);
  const drained = ensureSupply({ ...emptyWorld(T0), accounts: [acct("u-a", 0)], supply: { sale: 8_000_000 - RELEASE_PER_DAY + 50, base: 8_000_000, since: T0 } });
  assert.match((openOrder(drained, [], "u-a", "p100", "r", T0, G) as { error: string }).error, /випуск/);
});
