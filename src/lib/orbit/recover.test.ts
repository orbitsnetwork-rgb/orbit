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
