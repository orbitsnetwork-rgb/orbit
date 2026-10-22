import { test } from "node:test";
import assert from "node:assert/strict";
import { resetAllowed, PROD_ENDPOINT } from "./reset-all.mjs";

const prodUrl = `postgresql://u:p@${PROD_ENDPOINT}-pooler.eu-central-1.aws.neon.tech/db`;
const devUrl = "postgresql://u:p@ep-some-child-123.eu-central-1.aws.neon.tech/db";
test("reset: refuses without ORBIT_ALLOW_RESET", () => {
  assert.equal(resetAllowed({ DATABASE_URL: devUrl }).ok, false);
});
test("reset: refuses on prod without the final flag; allows child branch", () => {
  assert.equal(resetAllowed({ ORBIT_ALLOW_RESET: "1", DATABASE_URL: prodUrl }).ok, false);
  assert.equal(resetAllowed({ ORBIT_ALLOW_RESET: "1", DATABASE_URL: prodUrl, ORBIT_RESET_FINAL_PROD: "yes" }).ok, false);
  assert.equal(resetAllowed({ ORBIT_ALLOW_RESET: "1", DATABASE_URL: devUrl }).ok, true);
  assert.equal(resetAllowed({ ORBIT_ALLOW_RESET: "1", DATABASE_URL: prodUrl, ORBIT_RESET_FINAL_PROD: PROD_ENDPOINT }).ok, true);
});
