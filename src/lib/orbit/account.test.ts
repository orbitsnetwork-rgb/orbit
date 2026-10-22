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
