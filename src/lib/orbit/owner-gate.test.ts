import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerListed } from "./owner";

test("owner by account id list", () => {
  assert.equal(ownerListed("u-a", null, { ORBIT_OWNER_IDS: "u-x, u-A" }), true);
  assert.equal(ownerListed("u-b", null, { ORBIT_OWNER_IDS: "u-x,u-a" }), false);
});
test("owner by email list; empty env = nobody", () => {
  assert.equal(ownerListed("u-b", "Me@Mail.com", { ORBIT_OWNER_EMAILS: "me@mail.com" }), true);
  assert.equal(ownerListed("u-b", null, { ORBIT_OWNER_EMAILS: "me@mail.com" }), false);
  assert.equal(ownerListed("u-b", "me@mail.com", {}), false);
  assert.equal(ownerListed("u-b", "", { ORBIT_OWNER_EMAILS: "" }), false);
});
