import assert from "node:assert/strict";
import test from "node:test";
import { archiveEvents, confirmEvents, credentialAccepted, credentialBits, eightNo, lifeOf, mayArchive, mayVerify, mergeServerEight, refusalLine, type Eight, type HistoryEvent } from "./model.ts";

function wall(patch: Partial<Eight> = {}): Eight {
  return {
    id: "100184",
    city: "Київ",
    country: "Україна",
    lat: 50.45,
    lng: 30.52,
    creator: "Оля",
    holder: "Оля",
    createdAt: "2026-09-24T08:00:00.000Z",
    state: "created",
    kind: "draw",
    story: "Сині двері",
    proof: "",
    observations: [],
    transfers: [],
    commitments: [],
    reports: [],
    history: [{ id: "e-created-100184", at: "2026-09-24T08:00:00.000Z", kind: "created", by: "Оля", status: "DRAFT", text: "Чернетка." }],
    attention: 0,
    ...patch,
  };
}

test("create keeps one id and starts as draft", () => {
  const entry = wall();
  assert.equal(entry.id, "100184");
  assert.equal(eightNo(entry.id), "8 #100184");
  assert.equal(lifeOf(entry), "DRAFT");
});

test("place keeps the same id and waits for a person", () => {
  const placed = wall({
    state: "submitted",
    history: [
      ...wall().history,
      { id: "e-placed-100184", at: "2026-09-24T08:01:00.000Z", kind: "placed", by: "Оля", status: "PLACED", lat: 50.45, lng: 30.52, text: "8 поставлена на стіну." },
    ],
  });
  assert.equal(placed.id, "100184");
  assert.equal(lifeOf(placed), "WAITING_VERIFICATION");
  assert.equal(placed.history.filter((event) => event.kind === "placed").length, 1);
  assert.equal(placed.history.some((event) => event.kind === "verification_requested"), false);
});

test("confirm writes verification once and activates the same 8", () => {
  const placed = wall({ state: "submitted" });
  const once = confirmEvents(placed.history, placed.id, "Ігор", "2026-09-24T09:00:00.000Z", { lat: 50.45, lng: 30.52 });
  const twice = confirmEvents(once, placed.id, "Ігор", "2026-09-24T09:05:00.000Z", { lat: 50.45, lng: 30.52 });
  assert.deepEqual(twice.map((event) => event.kind), ["created", "verification_requested", "verified", "activated"]);
  assert.equal(new Set(twice.map((event) => event.id)).size, twice.length);
  const active = wall({
    state: "submitted",
    confirmedBy: "Ігор",
    confirmedAt: "2026-09-24T09:00:00.000Z",
    history: twice,
  });
  assert.equal(active.id, "100184");
  assert.equal(lifeOf(active), "ACTIVE");
  assert.equal(twice.filter((event) => event.kind === "verified").length, 1);
});

test("archive keeps id, history and does not append twice", () => {
  const placed = wall({
    state: "submitted",
    history: [...wall().history, { id: "e-placed-100184", at: "2026-09-24T08:01:00.000Z", kind: "placed", by: "Оля", status: "PLACED", text: "8 поставлена на стіну." }],
  });
  const archived = archiveEvents(placed, "Оля", "2026-09-24T10:00:00.000Z");
  const again = archiveEvents(archived, "Оля", "2026-09-24T11:00:00.000Z");
  assert.equal(again.id, "100184");
  assert.equal(lifeOf(again), "ARCHIVED");
  assert.equal(again.history.length, placed.history.length + 1);
  assert.equal(again.history.at(-1)?.kind, "archived");
  assert.equal(again.city, "Київ");
  assert.ok(again.history.some((event: HistoryEvent) => event.kind === "created"));
});

test("reload keeps id, status, timeline, origin and verification", () => {
  const saved = wall({
    state: "submitted",
    confirmedBy: "Ігор",
    confirmedAt: "2026-09-24T09:00:00.000Z",
    media: [{ id: "p-100184", kind: "image", name: "стіна", caption: "", at: "2026-09-24T08:00:00.000Z", preview: "data:image/jpeg,abc" }],
    history: confirmEvents(wall({ state: "submitted" }).history, "100184", "Ігор", "2026-09-24T09:00:00.000Z", { lat: 50.45, lng: 30.52 }),
  });
  const restored = JSON.parse(JSON.stringify(saved)) as Eight;
  assert.equal(restored.id, "100184");
  assert.equal(lifeOf(restored), "ACTIVE");
  assert.equal(restored.city, "Київ");
  assert.equal(restored.confirmedBy, "Ігор");
  assert.equal(restored.media?.[0]?.preview, "data:image/jpeg,abc");
  assert.deepEqual(restored.history.map((event) => event.kind), ["created", "verification_requested", "verified", "activated"]);
});

test("two users share one server wall and a cleared cache restores it", () => {
  const server = {
    id: "100184",
    city: "Київ",
    country: "Україна",
    lat: 50.45,
    lng: 30.52,
    creator: "Оля",
    holder: "Оля",
    createdAt: "2026-09-24T08:00:00.000Z",
    story: "Сині двері",
    photo: "/proofs/wall.jpg",
    status: "confirmed" as const,
    confirmedBy: "Ігор",
    confirmPhoto: null,
    archivedAt: null,
    events: [
      { id: "e-created-100184", at: "2026-09-24T08:00:00.000Z", kind: "created" as const, by: "Оля", status: "DRAFT", lat: null, lng: null },
      { id: "e-placed-100184", at: "2026-09-24T08:00:00.000Z", kind: "placed" as const, by: "Оля", status: "PLACED", lat: 50.45, lng: 30.52 },
      { id: "e-req-100184", at: "2026-09-24T09:00:00.000Z", kind: "verification_requested" as const, by: "Ігор", status: "WAITING_VERIFICATION", lat: 50.45, lng: 30.52 },
      { id: "e-ver-100184", at: "2026-09-24T09:00:00.000Z", kind: "verified" as const, by: "Ігор", status: "VERIFIED", lat: 50.45, lng: 30.52 },
      { id: "e-act-100184", at: "2026-09-24T09:00:00.000Z", kind: "activated" as const, by: "Ігор", status: "ACTIVE", lat: null, lng: null },
    ],
  };
  const onPhoneA = mergeServerEight(undefined, server);
  const onPhoneB = mergeServerEight(undefined, server);
  assert.equal(onPhoneA.id, "100184");
  assert.equal(onPhoneB.id, onPhoneA.id);
  assert.equal(lifeOf(onPhoneA), "ACTIVE");
  assert.equal(onPhoneA.confirmedBy, "Ігор");
  assert.equal(onPhoneA.holder, "Оля");
  assert.deepEqual(
    onPhoneA.history.map((event) => event.id),
    onPhoneB.history.map((event) => event.id),
  );
  const again = mergeServerEight(onPhoneA, server);
  assert.equal(again.id, "100184");
  assert.equal(again.history.filter((event) => event.kind === "verified").length, 1);
});

test("owner key, not the display name, decides archive and verify", () => {
  const wall = { ownerId: "hash-a", status: "waiting", device: "phone-a" };
  assert.equal(mayArchive("hash-a", wall, "phone-b"), true);
  assert.equal(mayArchive("hash-b", wall, "phone-a"), false);
  assert.equal(mayArchive("", wall, "phone-a"), false);
  assert.equal(mayVerify("hash-b", wall, "phone-b"), true);
  assert.equal(mayVerify("hash-a", wall, "phone-b"), false);
  assert.equal(mayVerify("hash-b", { ...wall, status: "gone" }, "phone-b"), false);
  assert.equal(mayVerify("hash-b", { ...wall, status: "confirmed" }, "phone-b"), false);
  assert.equal(mayArchive("hash-a", { ...wall, status: "gone" }, "phone-a"), false);
  assert.equal(mayArchive("hash-a", { ...wall, status: "confirmed" }, "phone-a"), false);
});

test("credential shape and idor", () => {
  assert.equal(credentialAccepted("8-ABCD-2345"), true);
  assert.equal(credentialAccepted(""), false);
  assert.equal(credentialAccepted("8-abc"), false);
  assert.equal(credentialAccepted("not-a-key"), false);
  assert.equal(credentialBits(), 40);
  const people = [{ id: "identity-a", credentialHash: "hash-old" }];
  const rotated = { ...people[0], credentialHash: "hash-new" };
  assert.equal(rotated.id, "identity-a");
  assert.equal(people.find((row) => row.credentialHash === "hash-old")?.id, "identity-a");
  assert.equal([rotated].find((row) => row.credentialHash === "hash-old"), undefined);
  assert.equal([rotated].find((row) => row.credentialHash === "hash-new")?.id, "identity-a");
  const wall = { ownerId: "hash-a", status: "waiting", device: "phone-a" };
  assert.equal(mayArchive("hash-b", wall, "phone-b"), false);
  assert.equal(mayVerify("hash-b", wall, "phone-b"), true);
  assert.equal(mayVerify("hash-b", { ...wall, status: "gone" }, "phone-b"), false);
});

test("refusal codes stay the sentences a person can read", () => {
  assert.equal(refusalLine("TOO_FAR"), "Занадто далеко. Підійди ближче ніж 200 м.");
  assert.equal(refusalLine("GPS_COARSE"), "GPS ширший за 65 м. Вийди відкритіше і спробуй ще.");
  assert.equal(refusalLine("SAME_PHOTO"), "Це фото вже було або збігається з авторським. Зніми з цього місця ще раз.");
  assert.equal(refusalLine("SAME_PHONE"), "З цього телефона підтвердити не можна.");
  assert.equal(refusalLine("OWN_WALL"), "Свою стіну підтверджує інша людина.");
  assert.equal(refusalLine("DAY_LIMIT"), "За останні 24 години з цього ключа вже є 8 підтверджень.");
  assert.equal(refusalLine("PAIR_LIMIT"), "Ця пара за останні 24 години вже підтверджувала стіну.");
  assert.equal(refusalLine("ALREADY_CONFIRMED"), "Цю стіну вже підтвердили.");
  assert.equal(refusalLine("GONE"), "Стіну прибрано з «Поруч».");
  assert.equal(refusalLine("NOT_WAITING"), "Підтвердити можна лише стіну, яка ще чекає.");
  assert.equal(refusalLine("NO_GPS"), "Місце недоступне.");
  assert.equal(refusalLine("NO_PHOTO"), "Потрібне фото цієї стіни.");
  assert.equal(refusalLine("З цього телефона вже 8 підтверджень за добу."), "За останні 24 години з цього ключа вже є 8 підтверджень.");
});


