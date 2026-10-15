export const MAX_RADIUS_M = 25_000;

export function kmBetween(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function coordError(lat: unknown, lng: unknown) {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return "Немає місця.";
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return "Координати недійсні.";
  return "";
}

export function nearbyError(input: { lat: unknown; lng: unknown; radiusM: unknown }) {
  if (typeof input.lat !== "number" || typeof input.lng !== "number" || !Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    return "Location unavailable";
  }
  if (coordError(input.lat, input.lng)) return "Координати недійсні.";
  if (typeof input.radiusM !== "number" || !Number.isFinite(input.radiusM) || input.radiusM <= 0 || input.radiusM > MAX_RADIUS_M) {
    return "Радіус завеликий.";
  }
  return "";
}

export function nearbyRequest(input: { lat: number; lng: number; radiusM: number; accuracy?: number | null; personKey?: string }) {
  const accuracy = typeof input.accuracy === "number" && Number.isFinite(input.accuracy) ? input.accuracy : null;
  const personKey = typeof input.personKey === "string" ? input.personKey.slice(0, 160) : "";
  return { lat: input.lat, lng: input.lng, radiusM: input.radiusM, accuracy, personKey };
}

const SEE_M = 200;
const FIX_M = 65;

export function photoOpen(input: {
  status: string;
  creator: string;
  viewer: string;
  owner: boolean;
  distanceM: number | null;
  accuracy: number | null;
}) {
  if (input.status === "confirmed" || input.status === "gone") return true;
  if (input.owner) return true;
  if (input.distanceM == null || input.accuracy == null) return false;
  if (!Number.isFinite(input.accuracy) || input.accuracy > FIX_M) return false;
  return input.distanceM <= SEE_M;
}

export type NearbySource = {
  id: string;
  status: string;
  lat: number | null;
  lng: number | null;
  city: string;
  country: string;
  placedAt: string;
};

export type NearbyHit = {
  id: string;
  status: "waiting" | "confirmed";
  lat: number;
  lng: number;
  distanceM: number;
  city: string;
  country: string;
  placedAt: string;
};

export function nearbyBounds(lat: number, lng: number, radiusM: number) {
  const radiusKm = radiusM / 1000;
  const dLat = radiusKm / 110;
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLng = Math.abs(cos) < 0.01 ? 180 : Math.min(180, radiusKm / (110 * Math.abs(cos)));
  let minLng = lng - dLng;
  let maxLng = lng + dLng;
  if (minLng < -180) minLng += 360;
  if (maxLng > 180) maxLng -= 360;
  return {
    minLat: Math.max(-90, lat - dLat),
    maxLat: Math.min(90, lat + dLat),
    minLng,
    maxLng,
  };
}

export function selectNearby(rows: NearbySource[], viewer: { lat: number; lng: number }, radiusM: number): NearbyHit[] {
  const hits: NearbyHit[] = [];
  for (const row of rows) {
    if (row.status !== "waiting" && row.status !== "confirmed") continue;
    if (coordError(row.lat, row.lng)) continue;
    const distanceM = kmBetween(viewer.lat, viewer.lng, row.lat as number, row.lng as number) * 1000;
    if (distanceM > radiusM) continue;
    hits.push({
      id: row.id,
      status: row.status,
      lat: row.lat as number,
      lng: row.lng as number,
      distanceM,
      city: row.city,
      country: row.country,
      placedAt: row.placedAt,
    });
  }
  hits.sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id));
  return hits;
}
