import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { cancelHold, listMarket, marketPulse, NEXT_PHOTOS, placeSale, repriceSale, RESERVE_MS, settleSale, takeSale, type BoardEight, type MarketCard, type MarketPulse, type PassedDeal } from "@/lib/board";
import { checkPrice } from "@/lib/fields";
import { CURRENCIES, derivedStatus, eightNo, norm, type Currency, type Eight } from "@/lib/model";
import { useAtlas } from "@/lib/store";
import { onLive } from "@/lib/live";
import { playCue } from "@/lib/sound";
import { peekPrime } from "@/lib/prime";

export const Route = createFileRoute("/exchange")({
  validateSearch: (search: Record<string, unknown>) => ({
    sell: typeof search.sell === "string" ? search.sell : undefined,
  }),
  component: ExchangePage,
});

type Book = { open: MarketCard[]; mine: BoardEight[]; passed: PassedDeal[]; bought: PassedDeal[] };

let lastBook: Book | null = null;
let lastStamp = "";

function ExchangePage() {
  const { sell } = Route.useSearch();
  const eights = useAtlas((state) => state.eights);
  const profile = useAtlas((state) => state.profile);
  const claimHeld = useAtlas((state) => state.claimHeld);
  const handOff = useAtlas((state) => state.handOff);
  const placeListing = useAtlas((state) => state.placeListing);
  const [currency, setCurrency] = useState<Currency>("UAH");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [priceError, setPriceError] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const primed = peekPrime();
  const [open, setOpen] = useState<MarketCard[]>(() => primed.market?.open ?? lastBook?.open ?? []);
  const [held, setHeld] = useState<BoardEight[]>(() => primed.market?.mine ?? lastBook?.mine ?? []);
  const [passed, setPassed] = useState<PassedDeal[]>(() => primed.market?.passed ?? lastBook?.passed ?? []);
  const [bought, setBought] = useState<PassedDeal[]>(() => primed.market?.bought ?? lastBook?.bought ?? []);
  const [boardOpen, setBoardOpen] = useState(false);
  const [marketReady, setMarketReady] = useState(Boolean(primed.market || lastBook));
  const [pulse, setPulse] = useState<MarketPulse | null>(primed.pulse);

  function reload() {
    void listMarket({ data: { name: profile.name ?? "", personKey: profile.key } })
      .then((book) => {
        setMarketReady(true);
        const stamp = [
          ...book.open.map((item) => `${item.listingId}:${item.amount}:${item.reservedBy ?? ""}:${item.reservedAt ?? ""}`),
          ...book.mine.map((item) => item.id),
          ...book.passed.map((item) => `${item.eightId}:${item.amount}`),
          ...book.bought.map((item) => `${item.eightId}:${item.amount}`),
        ].join("|");
        if (stamp === lastStamp && lastBook) return;
        lastStamp = stamp;
        lastBook = book;
        setOpen(book.open);
        setHeld(book.mine);
        setPassed(book.passed);
        setBought(book.bought);
        for (const row of book.mine) claimHeld(row);
        for (const deal of book.passed) handOff(deal.eightId, deal.buyer, deal.amount, deal.currency);
      })
      .catch(() => {
        setMarketReady(true);
        setError("Ринок не відкрився.");
      });
    void marketPulse({ data: {} }).then(setPulse).catch(() => undefined);
  }

  useEffect(() => {
    reload();
    return onLive(45_000, reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.name, currency]);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const who = norm(profile.name ?? "");
    const lefts = open
      .filter((item) => item.reservedBy && (norm(item.seller) === who || norm(item.reservedBy) === who))
      .map((item) => (item.reservedAt ? new Date(item.reservedAt).getTime() + RESERVE_MS - Date.now() : 0));
    if (lefts.length === 0) return;
    const soon = Math.min(...lefts);
    const tick = soon > 0 ? window.setInterval(() => setNow(Date.now()), 1000) : 0;
    const drop = window.setTimeout(() => reloadRef.current(), Math.max(0, soon) + 400);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(drop);
    };
  }, [open, profile.name]);

  async function run(id: string, job: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(id);
    try {
      const result = await job();
      setError(result.ok ? "" : result.error ?? "Не вийшло.");
      if (result.ok) reload();
      return result.ok;
    } catch {
      setError("Не вийшло. Спробуй ще.");
      return false;
    } finally {
      setBusy("");
    }
  }

  const mineName = norm(profile.name ?? "");
  const needsMe = open.filter((item) => item.reservedBy && norm(item.seller) === mineName);
  const waiting = open.filter((item) => item.reservedBy && norm(item.reservedBy) === mineName);
  const localHeld = eights.filter((entry) => norm(entry.holder) === mineName && derivedStatus(entry) === "verified" && !entry.anchor);
  const mineIds = new Set(held.map((row) => row.id));
  const market = open
    .filter((item) => item.currency === currency)
    .slice()
    .sort((a, b) => Number(Boolean(a.reservedBy)) - Number(Boolean(b.reservedBy)) || a.amount - b.amount);
  const mineRows = [
    ...held.map((entry) => ({ kind: "server" as const, entry })),
    ...localHeld.filter((entry) => !mineIds.has(entry.id)).map((entry) => ({ kind: "local" as const, entry })),
  ].sort((a, b) => Number(b.entry.id === sell) - Number(a.entry.id === sell));

  function draftAmount(id: string, listed?: number) {
    const raw = (prices[id] ?? "").replace(",", ".").trim();
    const typed = Number(raw);
    if (raw && Number.isFinite(typed) && typed > 0) return Math.round(typed * 100) / 100;
    return listed && listed > 0 ? listed : 0;
  }

  function listEight(entry: BoardEight | Eight, photo: string, listed?: MarketCard) {
    const problem = checkPrice(prices[entry.id] ?? (listed ? String(listed.amount) : ""));
    setPriceError((prev) => ({ ...prev, [entry.id]: problem }));
    if (problem) return;
    const amount = draftAmount(entry.id, listed?.amount);
    if (listed) {
      void run(listed.listingId, () => repriceSale({
        data: { listingId: listed.listingId, name: profile.name ?? "", currency, amount, personKey: profile.key },
      }));
      return;
    }
    void run(entry.id, () => placeSale({
      data: {
        eightId: entry.id,
        seller: profile.name ?? "",
        personKey: profile.key,
        currency,
        amount,
        city: entry.city,
        country: entry.country,
        lat: entry.lat,
        lng: entry.lng,
        creator: entry.creator,
        photo,
        story: entry.story,
      },
    })).then((ok) => {
      if (!ok) return;
      placeListing({ eightId: entry.id, currency, amount });
      setPrices((prev) => ({ ...prev, [entry.id]: "" }));
    });
  }

  function reserve(item: MarketCard) {
    void run(item.listingId, () => takeSale({ data: { listingId: item.listingId, name: profile.name ?? "", personKey: profile.key } })).then((ok) => {
      if (!ok) return;
      setFlash(`Бронь ${eightNo(item.eightId)} на дві години. Віддай ${money(item.amount)} ${item.currency} біля стіни.`);
    });
  }

  const issued = pulse?.issued ?? 0;
  const need = pulse?.need ?? NEXT_PHOTOS;
  if (sell && !boardOpen) {
    const row = mineRows.find((item) => item.entry.id === sell);
    if (!row) {
      return (
        <div className="sheet-page">
          <p className="sheet-title">Передати</p>
          <p className="sheet-note">{marketReady ? "Цієї 8 немає серед твоїх." : "Шукаю цю 8."}</p>
        </div>
      );
    }
    const { kind, entry } = row;
    const listed = open.find((item) => item.eightId === entry.id);
    const photo = kind === "server"
      ? entry.photo
      : (entry as Eight).media?.find((file) => file.preview?.startsWith("data:image/"))?.preview || (entry as Eight).shot || "";
    const locked = Boolean(listed?.reservedBy);
    const problem = priceError[entry.id] ?? "";
    return (
      <div className="sheet-page">
        <img src={photo || "/canon/street.jpg"} alt="" className="sheet-shot is-short" />
        <p className="sheet-title">{eightNo(entry.id)}</p>
        <p className="sheet-note">{entry.city}</p>
        <div className="flex flex-wrap gap-1.5">
          {CURRENCIES.map((code) => (
            <button key={code} type="button" className={code === currency ? "desk-tab desk-on" : "desk-tab desk-off"} onClick={() => setCurrency(code)}>{code}</button>
          ))}
        </div>
        <label className="sheet-field is-line">
          Ціна
          <input
            value={prices[entry.id] ?? (listed ? String(listed.amount) : "")}
            onChange={(event) => {
              setPrices((prev) => ({ ...prev, [entry.id]: event.target.value }));
              setPriceError((prev) => ({ ...prev, [entry.id]: "" }));
            }}
            inputMode="decimal"
            placeholder="Скільки"
          />
        </label>
        {problem ? <p className="sheet-note">{problem}</p> : null}
        {error ? <p className="sheet-note">{error}</p> : null}
        {locked ? <p className="sheet-note">Є бронь. Ціну не змінити.</p> : (
          <button type="button" className="chalk-pill" disabled={busy === entry.id || busy === listed?.listingId} onClick={() => listEight(entry, photo, listed)}>
            {busy === entry.id || busy === listed?.listingId ? "Записую…" : listed ? "Змінити ціну" : "Виставити"}
          </button>
        )}
        <p className="sheet-note">Заявка не списує гроші. Розрахунок поза додатком.</p>
        <button type="button" className="one-quiet" onClick={() => setBoardOpen(true)}>Дошка</button>
      </div>
    );
  }
  if (!sell && held.length === 0) {
    return (
      <div className="sheet-page">
        <p className="sheet-title">Продаж відкриється після підтвердження.</p>
        <p className="sheet-note">Спочатку хтось замикає твою вісімку. Тоді її можна передати.</p>
        <p className="one-count">підтверджено {new Intl.NumberFormat("uk-UA").format(issued)} з {new Intl.NumberFormat("uk-UA").format(need)}</p>
      </div>
    );
  }

  const focusDeal = needsMe.length > 0;
  return (
    <div className="sheet-page">
      <p className="sheet-title">Дошка</p>
      {sell ? null : <p className="sheet-note">Заявка не списує гроші. Розрахунок поза додатком.</p>}
      <div className="flex flex-wrap gap-1.5">
        {CURRENCIES.map((code) => (
          <button key={code} type="button" className={code === currency ? "desk-tab desk-on" : "desk-tab desk-off"} onClick={() => setCurrency(code)}>{code}</button>
        ))}
      </div>
      {error ? <p className="sheet-note">{error}</p> : null}
      {flash ? <p className="sheet-note">{flash}</p> : null}
      {needsMe.map((item) => (
        <div key={item.listingId} className="grid gap-2">
          {item.photo ? <img src={item.photo} alt="" className="sheet-shot is-short" /> : null}
          <p className="sheet-note">{eightNo(item.eightId)} · {item.city} · {money(item.amount)} {item.currency}</p>
          <p className="sheet-note">{item.reservedBy} чекає. Гроші вже мають бути в тебе.</p>
          {holdOpen(item.reservedAt, now) ? (
            <>
              <button
                type="button"
                className="chalk-pill"
                disabled={busy === item.listingId}
                onClick={() => void run(item.listingId, () => settleSale({ data: { listingId: item.listingId, name: profile.name ?? "", personKey: profile.key } })).then((ok) => {
                  if (!ok) return;
                  playCue("transfer");
                  setFlash(`${eightNo(item.eightId)} тепер у ${item.reservedBy}. Номер той самий.`);
                })}
              >
                {busy === item.listingId ? "Записую…" : "Гроші отримав"}
              </button>
              <button type="button" className="one-quiet" onClick={() => void run(`${item.listingId}-x`, () => cancelHold({ data: { listingId: item.listingId, name: profile.name ?? "", personKey: profile.key } }))}>Скасувати</button>
            </>
          ) : (
            <p className="sheet-note">Бронь зійшла. 8 знову на дошці.</p>
          )}
        </div>
      ))}
      {waiting.map((item) => (
        <div key={`w-${item.listingId}`} className="grid gap-2">
          <p className="sheet-note">{eightNo(item.eightId)} · {money(item.amount)} {item.currency}. Продає {item.seller}.</p>
          {holdOpen(item.reservedAt, now) ? (
            <button type="button" className="one-quiet" onClick={() => void run(item.listingId, () => cancelHold({ data: { listingId: item.listingId, name: profile.name ?? "", personKey: profile.key } }))}>Відпустити</button>
          ) : (
            <p className="sheet-note">Бронь зійшла.</p>
          )}
        </div>
      ))}
      {market.length === 0 && needsMe.length === 0 && waiting.length === 0 ? (
        <p className="sheet-note">Поки ніхто не виставив підтверджену 8.</p>
      ) : null}
      {market.map((item) => {
        const own = norm(item.seller) === mineName;
        return (
          <div key={item.listingId} className="grid gap-2">
            <img src={item.photo || "/canon/street.jpg"} alt="" className="sheet-shot is-short" />
            <p className="sheet-title">{money(item.amount)} {item.currency}</p>
            <p className="sheet-note">{eightNo(item.eightId)} · {item.city}{own ? " · твоя" : ""}</p>
            {item.reservedBy ? (
              <p className="sheet-note">{own ? "Заброньована" : item.reservedBy}</p>
            ) : own || focusDeal ? null : (
              <button type="button" className="chalk-pill" disabled={busy === item.listingId} onClick={() => reserve(item)}>
                {busy === item.listingId ? "Записую…" : "Забронювати"}
              </button>
            )}
          </div>
        );
      })}
      {sell ? <button type="button" className="one-quiet" onClick={() => setBoardOpen(false)}>Назад</button> : null}
    </div>
  );
}

function holdOpen(iso: string | null, now = Date.now()) {
  if (!iso) return false;
  return new Date(iso).getTime() + RESERVE_MS > now;
}

function money(amount: number) {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

