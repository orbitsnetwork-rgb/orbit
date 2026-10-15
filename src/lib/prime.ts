import { cityAtlas, listMarket, marketBook, marketPulse, type BoardEight, type BookLevel, type CityMark, type MarketCard, type MarketPulse, type MyBid, type PassedDeal, type TapeTick } from "@/lib/board";
import { warmFeed } from "@/lib/feed-cache";

export type MarketSnap = {
  open: MarketCard[];
  mine: BoardEight[];
  passed: PassedDeal[];
  bought: PassedDeal[];
};

export type BookSnap = {
  bids: BookLevel[];
  asks: BookLevel[];
  tape: TapeTick[];
  mine: MyBid[];
  topId: string | null;
  topAmount: number | null;
};

type PrimeSnap = {
  pulse: MarketPulse | null;
  cities: CityMark[] | null;
  market: MarketSnap | null;
  book: BookSnap | null;
};

const empty: PrimeSnap = { pulse: null, cities: null, market: null, book: null };
let snap: PrimeSnap = empty;
let job: Promise<void> | null = null;

export function peekPrime() {
  return snap;
}

function paint() {
  return new Promise<void>((resolve) => {
    const el = new Image();
    el.onload = () => resolve();
    el.onerror = () => resolve();
    el.src = "/canon/chalk.jpg";
  });
}

export function warmApp(personKey: string, name: string) {
  if (job) return job;
  job = (async () => {
    await paint();
    const [pulse, cities, market, book] = await Promise.all([
      marketPulse({ data: {} }).catch(() => null),
      cityAtlas({ data: {} }).catch(() => [] as CityMark[]),
      personKey ? listMarket({ data: { name, personKey } }).catch(() => null) : Promise.resolve(null),
      personKey ? marketBook({ data: { currency: "UAH", personKey } }).catch(() => null) : Promise.resolve(null),
      warmFeed(personKey),
    ]);
    snap = { pulse, cities, market, book };
  })().catch(() => undefined);
  return job;
}
