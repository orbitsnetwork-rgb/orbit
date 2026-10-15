import assert from "node:assert/strict";
import test from "node:test";
import { coordError, kmBetween, nearbyError, nearbyRequest, photoOpen, selectNearby, type NearbySource } from "./nearby.ts";

const wall: NearbySource & { owner: string; timeline: string[] } = {
  id: "100184",
  status: "waiting",
  lat: 50.45,
  lng: 30.52,
  city: "Київ",
  country: "Україна",
  placedAt: "2026-09-24T08:00:00.000Z",
  owner: "identity-a",
  timeline: ["placed"],
};

function at(lat: number, lng: number, id = "100200", status = "waiting"): NearbySource & { distanceM?: number } {
  return { id, status, lat, lng, city: wall.city, country: wall.country, placedAt: wall.placedAt, distanceM: 1 };
}

test("nearby shows a placed 8 only inside the radius", () => {
  const near = at(50.4509, 30.52, "100201");
  const far = at(50.8, 30.52, "100202");
  const here = { lat: 50.45, lng: 30.52 };
  const seen = selectNearby([wall, near, far], here, 500);
  assert.deepEqual(seen.map((row) => row.id), ["100184", "100201"]);
  assert.equal(selectNearby([wall], { lat: 49.8, lng: 30.52 }, 500).length, 0);
  const moved = selectNearby([wall], { lat: 50.4504, lng: 30.52 }, 500);
  assert.equal(moved.length, 1);
  assert.notEqual(moved[0].distanceM, seen.find((row) => row.id === "100184")?.distanceM);
});

test("distance is calculated by the server and a client value is ignored", () => {
  const claimed = at(50.55, 30.52, "100203");
  const hit = selectNearby([claimed], { lat: 50.45, lng: 30.52 }, 25_000);
  const serverM = kmBetween(50.45, 30.52, 50.55, 30.52) * 1000;
  assert.equal(hit.length, 1);
  assert.equal(hit[0].distanceM, serverM);
  assert.notEqual(hit[0].distanceM, claimed.distanceM);
  assert.deepEqual(nearbyRequest({ lat: 50.45, lng: 30.52, radiusM: 1000, distanceM: 1, id: "100184" } as { lat: number; lng: number; radiusM: number }), {
    lat: 50.45,
    lng: 30.52,
    radiusM: 1000,
    accuracy: null,
    personKey: "",
  });
});

test("a waiting photo opens only for the owner or from within 200 m", () => {
  const far = { status: "waiting", creator: "Олена", viewer: "Марко", owner: false, distanceM: 840, accuracy: 12 };
  assert.equal(photoOpen(far), false);
  assert.equal(photoOpen({ ...far, distanceM: 40 }), true);
  assert.equal(photoOpen({ ...far, distanceM: 40, accuracy: 90 }), false);
  assert.equal(photoOpen({ ...far, distanceM: null, accuracy: null }), false);
  assert.equal(photoOpen({ ...far, owner: true, distanceM: 4000, accuracy: null }), true);
  assert.equal(photoOpen({ ...far, status: "confirmed", distanceM: 4000, accuracy: null }), true);
});

test("archived and draft 8 stay out, and missing coordinates are not invented", () => {
  const rows: NearbySource[] = [
    wall,
    { ...at(50.45, 30.52, "100204"), status: "gone" },
    { ...at(50.45, 30.52, "100205"), status: "hidden" },
    { ...at(50.45, 30.52, "100206"), status: "draft" },
    { ...at(50.45, 30.52, "100207"), status: "confirmed" },
    { id: "100208", status: "waiting", lat: null, lng: null, city: "", country: "", placedAt: "" },
  ];
  const ids = selectNearby(rows, { lat: 50.45, lng: 30.52 }, 1000).map((row) => row.id);
  assert.deepEqual(ids, ["100184", "100207"]);
  assert.equal(nearbyError({ lat: Number.NaN, lng: 30, radiusM: 1000 }), "Location unavailable");
  assert.equal(selectNearby(rows, { lat: 50.45, lng: 30.52 }, 1000).some((row) => row.lat === 0 && row.lng === 0), false);
});

test("coordinate bounds and radius cap", () => {
  assert.equal(coordError(0, 0), "");
  assert.equal(coordError(90, 180), "");
  assert.equal(coordError(-90, -180), "");
  assert.equal(coordError(-33.87, 151.2), "");
  assert.notEqual(coordError(90.0001, 0), "");
  assert.notEqual(coordError(0, 180.0001), "");
  assert.notEqual(coordError(-91, 0), "");
  assert.equal(nearbyError({ lat: 50, lng: 30, radiusM: 25_000 }), "");
  assert.notEqual(nearbyError({ lat: 50, lng: 30, radiusM: 25_001 }), "");
  assert.notEqual(nearbyError({ lat: 50, lng: 30, radiusM: 0 }), "");
});

test("reading nearby does not change 8 #100184, its owner or its timeline", () => {
  const before = { ...wall, timeline: [...wall.timeline] };
  selectNearby([wall], { lat: wall.lat as number, lng: wall.lng as number }, 1000);
  assert.equal(wall.id, "100184");
  assert.equal(wall.owner, before.owner);
  assert.deepEqual(wall.timeline, before.timeline);
  assert.equal(wall.lat, before.lat);
  assert.equal(wall.lng, before.lng);
  assert.equal(wall.status, "waiting");
});
