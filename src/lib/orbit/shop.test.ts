import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyWorld, type Account, type World } from "./engine";
import { BOOST_MS, PACKS, boosted, packGrant, shopBuy, shopWear } from "./shop";
import { checkoutEnabled, productGrant } from "./checkout";

const G = { verified: true, vouchers: 1, ring: false };
const acct = (id: string, balance: number, extra: Partial<Account> = {}): Account => ({ id, name: id, stability: 0, balance, createdAt: 0, confirmDay: "", confirmsToday: 0, stabilityFromConfirmToday: 0, impulseUntil: 0, lastActiveAt: 0, toppedUp: 0, ...extra });
const world = (a: Account[]): World => ({ ...emptyWorld(1_000_000), sessionId: a[0].id, accounts: a, lastDistributionAt: 1_000_000 });

test("shop: buying a style spends ✦ into the fund, owns and wears it", () => {
  const w = world([acct("u-a", 300, { toppedUp: 100 })]);
  const s = shopBuy(w, "style:neon");
  assert.equal(s.error, undefined);
  const a = s.world.accounts[0];
  assert.equal(a.balance, 220);
  assert.equal(a.toppedUp, 20);
  assert.deepEqual(a.owned, ["style:neon"]);
  assert.equal(a.wearStyle, "neon");
  assert.equal(s.world.fund, w.fund + 80);
  assert.match(shopBuy(s.world, "style:neon").error ?? "", /вже твоє/);
});
test("shop: not enough ✦, unknown item, no session", () => {
  const w = world([acct("u-a", 10)]);
  assert.match(shopBuy(w, "theme:deep").error ?? "", /Не вистачає/);
  assert.equal(shopBuy(w, "theme:deep").world.accounts[0].balance, 10);
  assert.match(shopBuy(w, "x").error ?? "", /немає/);
  assert.match(shopBuy({ ...w, sessionId: null }, "boost").error ?? "", /увійди/);
});
test("shop: boost lasts 24h and cannot stack", () => {
  const w = world([acct("u-a", 200)]);
  const s = shopBuy(w, "boost");
  const a = s.world.accounts[0];
  assert.equal(a.boostUntil, s.world.now + BOOST_MS);
  assert.equal(boosted(a, s.world.now + BOOST_MS - 1), true);
  assert.equal(boosted(a, s.world.now + BOOST_MS), false);
  assert.match(shopBuy(s.world, "boost").error ?? "", /вже діє/);
});
test("shop: wear only owned, empty ref resets", () => {
  const w = world([acct("u-a", 0, { owned: ["theme:deep"] })]);
  assert.match(shopWear(w, "theme", "nebula").error ?? "", /придбай/);
  const on = shopWear(w, "theme", "deep");
  assert.equal(on.world.accounts[0].wearTheme, "deep");
  assert.equal(shopWear(on.world, "theme", "").world.accounts[0].wearTheme, undefined);
});
test("packs: live rate at start ≈ old fixed packs, first purchase doubles, checkout disabled", () => {
  const S = 8_000_000, M = 9_900;
  assert.deepEqual(PACKS.map((p) => [p.usd, packGrant(p, true, M, S).spark]), [[0.99, 100], [4.99, 554], [9.99, 1210], [19.99, 2624]]);
  assert.deepEqual(packGrant(PACKS[1], false, M, S), { spark: 554, bonus: 554 });
  assert.equal(packGrant(PACKS[1], true, M * 2, S).spark, 277);
  assert.equal(productGrant("starter", false, M, S)?.spark, 498);
  delete process.env.ORBIT_PAYMENTS_ENABLED;
  assert.equal(checkoutEnabled(), false);
  process.env.ORBIT_PAYMENTS_ENABLED = "1";
  process.env.ORBIT_SHOP_PROVIDER = "xsolla";
  assert.equal(checkoutEnabled(), false); // провайдера ще не реалізовано
  delete process.env.ORBIT_PAYMENTS_ENABLED;
  delete process.env.ORBIT_SHOP_PROVIDER;
});

import { createHash } from "node:crypto";
import { openOrder, creditOrder } from "./shop-pay";
import { parseXsolla, tokenBody, xsollaConf, xsollaProvider, xsollaSigned } from "./xsolla";

test("xsolla: conf needs all keys, sandbox unless ORBIT_SHOP_LIVE=1", () => {
  assert.equal(xsollaConf({}), null);
  const env = { XSOLLA_MERCHANT_ID: "1", XSOLLA_PROJECT_ID: "2", XSOLLA_API_KEY: "k", XSOLLA_WEBHOOK_SECRET: "s" };
  assert.equal(xsollaConf(env)?.sandbox, true);
  assert.equal(xsollaConf({ ...env, ORBIT_SHOP_LIVE: "1" })?.sandbox, false);
});
test("xsolla: signature sha1(body+secret), timing-safe", () => {
  const raw = '{"notification_type":"payment"}';
  const sig = createHash("sha1").update(raw + "sec").digest("hex");
  assert.equal(xsollaSigned(raw, `Signature ${sig}`, "sec"), true);
  assert.equal(xsollaSigned(raw, `Signature ${sig}`, "other"), false);
  assert.equal(xsollaSigned(raw, null, "sec"), false);
});
test("xsolla: parse payment + token body has server amount and sandbox", () => {
  const ev = parseXsolla({ notification_type: "payment", user: { id: "u-a" }, transaction: { id: 9, external_id: "xs-1", dry_run: 1 }, purchase: { checkout: { amount: 4.99, currency: "USD" } } });
  assert.deepEqual(ev, { kind: "paid", orderId: "xs-1", userId: "u-a", usdCents: 499, currency: "USD", dryRun: true, txId: "9" });
  const conf = { merchantId: "1", projectId: "2", apiKey: "k", secret: "s", sandbox: true };
  const b = tokenBody(conf, { id: "xs-1", userId: "u-a", product: "p550", usdCents: 499, spark: 550, bonus: 550, status: "open", provider: "xsolla", providerRef: "xs-1", at: 0, quoteUntil: 0 }, "https://x/");
  assert.equal(b.settings.mode, "sandbox");
  assert.equal(b.purchase.checkout.amount, 4.99);
});
test("xsolla: createSession calls token API with basic auth and returns sandbox url", async () => {
  let seen: { url: string; auth: string } | null = null;
  const fake = (async (url: string, init: RequestInit) => { seen = { url, auth: String((init.headers as Record<string, string>).authorization) }; return new Response(JSON.stringify({ token: "T" })); }) as unknown as typeof fetch;
  const p = xsollaProvider({ merchantId: "1", projectId: "2", apiKey: "k", secret: "s", sandbox: true }, fake);
  const s = await p.createSession({ id: "xs-1", userId: "u-a", product: "p100", usdCents: 99, spark: 100, bonus: 100, status: "open", provider: "xsolla", providerRef: "xs-1", at: 0, quoteUntil: 0 }, "https://x/");
  assert.equal(s.url, "https://sandbox-secure.xsolla.com/paystation4/?token=T");
  assert.equal(seen!.url, "https://api.xsolla.com/merchant/v2/merchants/1/token");
  assert.equal(seen!.auth, `Basic ${Buffer.from("1:k").toString("base64")}`);
});
test("orders: first pack doubles, credit once, amount must match, starter once with cosmetics", () => {
  const w = { ...world([acct("u-a", 0)]), fund: 1000 };
  const o = openOrder(w, [], "u-a", "p100", "xs-1", 1, G);
  assert.ok(!("error" in o));
  if ("error" in o) return;
  assert.equal(o.topups[0].amount, 200);
  assert.match(creditOrder(w, o.topups, "xs-1", 100).error ?? "", /Сума/);
  const c = creditOrder(w, o.topups, "xs-1", 99);
  assert.equal(c.world.accounts[0].balance, 200);
  assert.equal(creditOrder(c.world, c.topups, "xs-1", 99).notice, "Вже зараховано.");
  const o2 = openOrder(c.world, c.topups, "u-a", "p100", "xs-2", 2, G);
  assert.ok(!("error" in o2) && o2.topups.at(-1)!.amount === 100);
  const s = openOrder(c.world, c.topups, "u-a", "starter", "xs-3", 3, G);
  if ("error" in s) throw new Error(s.error);
  const sc = creditOrder(c.world, s.topups, "xs-3", 299);
  const a = sc.world.accounts[0];
  assert.equal(a.balance, 698);
  assert.deepEqual(a.owned, ["style:neon", "theme:nebula"]);
  assert.match((openOrder(sc.world, sc.topups, "u-a", "starter", "xs-4", 4, G) as { error: string }).error, /один/);
  assert.match((openOrder(w, [], "u-a", "plus", "x", 1, G) as { error: string }).error, /немає/);
});
