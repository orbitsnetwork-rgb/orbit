import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAccountOp, DELETE_WORD } from "./account";
import type { Identity } from "./access";

const P = (id: string, email: string, phone: string): Identity => ({ userId: id, given: "А", family: "Б", birth: "1990-01-01", email, phone, confirmed: true, mailCode: null });
const people = [P("u-a", "a@x.com", "0501112233"), P("u-b", "b@x.com", "0671112233")];
const keys = { "u-a": "h1$a", "u-b": "h1$b" };
const h = (k: string) => `h1$${k}`;

test("account: change email — validation, uniqueness, needs code only when mail is on", () => {
  assert.ok("error" in applyAccountOp(people, keys, "u-a", { op: "email", email: "bad" }, false, h));
  assert.ok("error" in applyAccountOp(people, keys, "u-a", { op: "email", email: "B@x.com" }, false, h));
  const off = applyAccountOp(people, keys, "u-a", { op: "email", email: "new@x.com" }, false, h);
  assert.ok(!("error" in off) && off.people[0].email === "new@x.com" && off.people[0].confirmed);
  const on = applyAccountOp(people, keys, "u-a", { op: "email", email: "new@x.com" }, true, h);
  assert.ok(!("error" in on) && !on.people[0].confirmed && /^\d{6}$/.test(on.people[0].mailCode ?? "") && on.sendCode);
});
test("account: change phone — uniqueness", () => {
  assert.ok("error" in applyAccountOp(people, keys, "u-a", { op: "phone", phone: "0671112233" }, false, h));
  const ok = applyAccountOp(people, keys, "u-a", { op: "phone", phone: "0931234567" }, false, h);
  assert.ok(!("error" in ok) && ok.people[0].phone !== "0501112233");
});
test("account: logout everywhere rotates only my key", () => {
  const r = applyAccountOp(people, keys, "u-a", { op: "logoutAll" }, false, h);
  assert.ok(!("error" in r) && r.key && r.keys["u-a"] === h(r.key) && r.keys["u-b"] === "h1$b");
});
test("account: delete requires the word; removes login + contacts, keeps others", () => {
  assert.ok("error" in applyAccountOp(people, keys, "u-a", { op: "delete", confirm: "так" }, false, h));
  const r = applyAccountOp(people, keys, "u-a", { op: "delete", confirm: DELETE_WORD.toLowerCase() }, false, h);
  assert.ok(!("error" in r) && !r.keys["u-a"] && r.people.length === 1 && r.removed?.userId === "u-a");
});

test("audit #3: changed contacts are unverified; verify needs a matching proof; reclaim frees squatted contacts", async () => {
  const { reclaim, releasedEmail } = await import("./access.ts");
  const me = { userId: "u-me", given: "A", family: "B", birth: "2000-01-01", email: "me@x.com", phone: "+380501112233", confirmed: true, mailCode: null };
  const h = (k: string) => `h:${k}`;
  const ph = applyAccountOp([me], {}, "u-me", { op: "phone", phone: "+41771112233" }, false, h);
  assert.ok("people" in ph && ph.people[0].phoneVerified === false);
  const em = applyAccountOp([me], {}, "u-me", { op: "email", email: "new@x.com" }, false, h);
  assert.ok("people" in em && em.people[0].emailVerified === false);
  const wrong = applyAccountOp([me], {}, "u-me", { op: "verify", kind: "phone", token: "t" }, false, h, { kind: "phone", phone: "+380999999999" });
  assert.ok("error" in wrong);
  const ok = applyAccountOp([me], {}, "u-me", { op: "verify", kind: "phone", token: "t" }, false, h, { kind: "phone", phone: "+380501112233" });
  assert.ok("people" in ok && ok.people[0].phoneVerified === true);
  const g = applyAccountOp([me], {}, "u-me", { op: "verify", kind: "google", token: "t" }, false, h, { kind: "google", email: "me@x.com" });
  assert.ok("people" in g && g.people[0].emailVerified === true);
  // squatter set my email without proof; legacy holder (no flag) is never touched
  const squat = { ...me, userId: "u-sq", email: "victim@x.com", phone: "0671234567", emailVerified: false, phoneVerified: false };
  const legacy = { ...me, userId: "u-old", email: "old@x.com", phone: "+380931112233" };
  const out = reclaim([squat, legacy], "victim@x.com", "+380671234567", { email: true, phone: true });
  assert.equal(out[0].email, releasedEmail("u-sq"));
  assert.notEqual(out[0].phone, "0671234567");
  assert.deepEqual(out[1], legacy);
  assert.deepEqual(reclaim([legacy], "old@x.com", "+380931112233", { email: true, phone: true }), [legacy]);
});
