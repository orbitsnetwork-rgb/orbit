import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { knownSession, paymentsEnabled, PAYMENTS_FLAG } from "./payments.ts";
import { HUB_LOCKS, LOCKS, MONEY_LOCKS } from "./locked.ts";

test("payments flag: OFF by default, ON only with exactly 1", () => {
  const was = process.env[PAYMENTS_FLAG];
  try {
    delete process.env[PAYMENTS_FLAG];
    assert.equal(paymentsEnabled(), false);
    for (const v of ["0", "true", "yes", ""]) {
      process.env[PAYMENTS_FLAG] = v;
      assert.equal(paymentsEnabled(), false, v);
    }
    process.env[PAYMENTS_FLAG] = "1";
    assert.equal(paymentsEnabled(), true);
  } finally {
    if (was === undefined) delete process.env[PAYMENTS_FLAG];
    else process.env[PAYMENTS_FLAG] = was;
  }
});

test("payments flag: only sessions our server opened before count as already started", () => {
  const rows = [{ id: "cs_open", userId: "u-1", amount: 100, status: "open" as const, at: 1 }, { id: "cs_paid", userId: "u-1", amount: 500, status: "paid" as const, at: 2 }];
  assert.equal(knownSession(rows, "cs_open"), true);
  assert.equal(knownSession(rows, "cs_paid"), true);
  assert.equal(knownSession(rows, "cs_other"), false);
});

test("no UI path reaches Stripe: client store has no topup action; components never call it", () => {
  const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  assert.doesNotMatch(store, /type: "topup"/);
  for (const f of ["app.tsx", "home.tsx", "exchange.tsx", "more.tsx"]) {
    const src = readFileSync(new URL(`../../components/orbit/${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\.topup\(|TopupRow|TopupSheet/, f);
  }
  const remote = readFileSync(new URL("./remote.ts", import.meta.url), "utf8");
  assert.match(remote, /topup" && !paymentsEnabled\(\)/, "server checks the flag before calling Stripe");
});

test("locked list: money items are legal-locked, no dates, no income promises", () => {
  for (const id of ["buy", "deposit", "withdraw"] as const) assert.equal(LOCKS[id].kind, "legal");
  for (const id of [...MONEY_LOCKS, ...HUB_LOCKS]) {
    const text = [LOCKS[id].title, LOCKS[id].short, ...LOCKS[id].body].join(" ");
    assert.doesNotMatch(text, /\b20\d\d\b|січн|лютого|березн|квітн|травн|червн|липн|серпн|вересн|жовтн|листопад|грудн/i, `${id}: no dates`);
    assert.doesNotMatch(text, /заробиш|дохід гарантовано|прибуток|відсотк(и|ів) на/i, `${id}: no income promises`);
  }
});
