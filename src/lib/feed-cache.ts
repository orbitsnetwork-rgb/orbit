import { confirmQuota, loadDone, myLife, nearbyBoard, type LifeNote, type NearbyCard } from "@/lib/board";

export type DoneCard = Awaited<ReturnType<typeof loadDone>>[number];

export type FeedSnap = {
  life: LifeNote[];
  done: DoneCard[];
  need: NearbyCard[];
  geo: "ok" | "no";
  stale: boolean;
  left: number | null;
};

const blank: FeedSnap = { life: [], done: [], need: [], geo: "no", stale: false, left: null };
let snap: FeedSnap = blank;
let job: Promise<FeedSnap> | null = null;
let jobKey = "";

function here() {
  try {
    const raw = sessionStorage.getItem("vosma-here");
    if (!raw) return null;
    const point = JSON.parse(raw) as { lat?: number; lng?: number; accuracy?: number; at?: number };
    if (typeof point.lat === "number" && typeof point.lng === "number") {
      return { lat: point.lat, lng: point.lng, accuracy: point.accuracy, at: point.at };
    }
  } catch {
    /* старе місце не читається */
  }
  return null;
}

function waiting(rows: NearbyCard[]) {
  return rows
    .filter((row) => row.status === "waiting")
    .sort((a, b) => Number(b.own) - Number(a.own) || a.distanceM - b.distanceM)
    .slice(0, 6);
}

let nearRows: NearbyCard[] | null = null;

export function peekNear() {
  return nearRows;
}

export function savedPoint() {
  return here();
}

export function peekFeed() {
  return snap;
}

export function sameFeed(a: FeedSnap, b: FeedSnap) {
  const ids = (rows: { id: string }[]) => rows.map((row) => row.id).join("|");
  return a.geo === b.geo && a.stale === b.stale && a.left === b.left && ids(a.life) === ids(b.life) && ids(a.done) === ids(b.done) && ids(a.need) === ids(b.need);
}

export function warmFeed(personKey: string) {
  if (job && (jobKey === personKey || (jobKey && !personKey))) return job;
  jobKey = personKey;
  job = (async () => {
    const point = here();
    const [life, done, quota, book] = await Promise.all([
      personKey ? myLife({ data: { personKey } }).catch(() => [] as LifeNote[]) : Promise.resolve([] as LifeNote[]),
      loadDone(8).catch(() => []),
      personKey ? confirmQuota({ data: { personKey } }).catch(() => null) : Promise.resolve(null),
      point
        ? nearbyBoard({
            data: { lat: point.lat, lng: point.lng, radiusM: 25_000, accuracy: point.accuracy, personKey },
          }).catch(() => null)
        : Promise.resolve(null),
    ]);
    snap = {
      life,
      done,
      left: quota ? quota.left : null,
      stale: Boolean(point?.at && Date.now() - point.at > 5 * 60 * 1000),
      geo: book && book.ok ? "ok" : "no",
      need: book && book.ok ? waiting(book.rows) : [],
    };
    nearRows = book && book.ok ? book.rows : null;
    return snap;
  })();
  return job;
}
