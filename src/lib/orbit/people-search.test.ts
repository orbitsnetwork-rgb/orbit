import { test } from "node:test";
import assert from "node:assert/strict";
import { searchPeople } from "./people-search";

const acc = [{ id: "u-1", name: "Юлія К." }, { id: "u-2", name: "Максим Ш." }, { id: "u-3", name: "Станіслав" }, { id: "u-4", name: "Юрій О." }];
const ppl = [{ userId: "u-1", given: "Юлія", family: "Коваль" }, { userId: "u-2", given: "Максим", family: "Шевчук" }, { userId: "u-4", given: "Юрій", family: "О'Нілл" }];
const sh = (n: string) => n;
test("min 2 chars, prefix by name or surname, no self", () => {
  assert.deepEqual(searchPeople("ю", acc, ppl, "u-3", new Set(), sh), []);
  assert.deepEqual(searchPeople("юл", acc, ppl, "u-3", new Set(), sh).map((p) => p.id), ["u-1"]);
  assert.deepEqual(searchPeople("шев", acc, ppl, "u-3", new Set(), sh).map((p) => p.id), ["u-2"]);
  assert.deepEqual(searchPeople("стані", acc, ppl, "u-3", new Set(), sh), []);
  assert.deepEqual(searchPeople("онілл", acc, ppl, "u-3", new Set(), sh).map((p) => p.id), ["u-4"]);
});
test("blocked hidden; only id + display name leak", () => {
  assert.deepEqual(searchPeople("юл", acc, ppl, "u-3", new Set(["u-1"]), sh), []);
  const r = searchPeople("макс", acc, ppl, "u-3", new Set(), sh);
  assert.deepEqual(Object.keys(r[0]).sort(), ["id", "name"]);
});
