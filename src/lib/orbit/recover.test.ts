import { test } from "node:test";
import assert from "node:assert/strict";
import { matchPerson } from "./recover";

const people = [
  { userId: "u-1", email: "a@x.com", phone: "050 111 22 33", confirmed: true },
  { userId: "u-2", email: "b@x.com", phone: "+380671234567", confirmed: false },
];
test("recover: match by email (case-insensitive input already lowered) and by phone in any local format", () => {
  assert.equal(matchPerson(people, { kind: "mail", email: "a@x.com" })?.userId, "u-1");
  assert.equal(matchPerson(people, { kind: "google", email: "b@x.com" })?.userId, "u-2");
  assert.equal(matchPerson(people, { kind: "phone", phone: "+380501112233" })?.userId, "u-1");
  assert.equal(matchPerson(people, { kind: "phone", phone: "+380671234567" })?.userId, "u-2");
  assert.equal(matchPerson(people, { kind: "phone", phone: "+380999999999" }), null);
  assert.equal(matchPerson(people, { kind: "mail", email: "c@x.com" }), null);
});

test("sms errors: friendly quota message", async () => {
  const { smsErrorText } = await import("./recover");
  assert.match(smsErrorText("auth/quota-exceeded"), /Ліміт SMS на сьогодні/);
  assert.match(smsErrorText("weird"), /SMS не надіслано/);
});

test("audit #3: no 9-digit tail match across countries; unverified-changed contacts don't recover", () => {
  const ppl = [
    { userId: "u-ua", email: "ua@x.com", phone: "+380501112233", confirmed: true },
    { userId: "u-ch", email: "ch@x.com", phone: "+41771112233", confirmed: true, phoneVerified: false, emailVerified: false },
  ];
  // same last 9 digits, other country → no match
  assert.equal(matchPerson(ppl, { kind: "phone", phone: "+44501112233" }), null);
  assert.equal(matchPerson(ppl, { kind: "phone", phone: "+380501112233" })?.userId, "u-ua");
  // changed without proof → recovery refuses even with a valid proof
  assert.equal(matchPerson(ppl, { kind: "phone", phone: "+41771112233" }), null);
  assert.equal(matchPerson(ppl, { kind: "google", email: "ch@x.com" }), null);
});
