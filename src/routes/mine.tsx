import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { personBoard, type PersonEight } from "@/lib/board";
import { derivedStatus, eightNo, norm } from "@/lib/model";
import { useAtlas } from "@/lib/store";

export const Route = createFileRoute("/mine")({
  component: MinePage,
});

type MineBook = { drew: number; confirmed: number; holds: number; rows: PersonEight[] };

let remembered: { key: string; book: MineBook } | null = null;

function MinePage() {
  const profile = useAtlas((state) => state.profile);
  const hydrated = useAtlas((state) => state.hydrated);
  const eights = useAtlas((state) => state.eights);
  const listings = useAtlas((state) => state.listings) ?? [];
  const removeDraft = useAtlas((state) => state.removeDraft);
  const [book, setBook] = useState<MineBook | null>(() => (remembered?.key === (profile.key ?? "") ? remembered.book : null));
  const name = norm(profile.name);

  useEffect(() => {
    if (!name) return;
    const key = profile.key ?? "";
    void personBoard({ data: { name: profile.name, personKey: profile.key } }).then((next) => {
      const value = next ?? { drew: 0, confirmed: 0, holds: 0, rows: [] };
      remembered = { key, book: value };
      setBook(value);
    }).catch(() => setBook(remembered?.book ?? { drew: 0, confirmed: 0, holds: 0, rows: [] }));
  }, [name, profile.name, profile.key]);

  const server = book?.rows ?? null;
  const drafts = eights.filter((entry) => name && norm(entry.creator) === name && derivedStatus(entry) === "created" && !entry.anchor && !entry.example);
  const known = new Set((server ?? []).map((row) => row.id));
  const listedIds = new Set(listings.filter((item) => item.side === "sell" && item.amount).map((item) => item.eightId));
  const rows = [
    ...drafts.filter((entry) => !known.has(entry.id)).map((entry) => ({ id: entry.id, city: entry.city, photo: "", word: "Чернетка", sale: false, ask: null as number | null, currency: null as string | null, reserved: false, draft: true })),
    ...(server ?? [])
      .filter((row) => !row.id.startsWith("90010"))
      .map((row) => ({
        id: row.id,
        city: row.city,
        photo: row.photo,
        word: row.status === "gone" ? "Прибрана" : row.status === "waiting" ? "Чекає" : row.held ? "У мене" : row.role === "confirmed" ? "Підтвердив" : "Намалював",
        sale: row.ask != null || listedIds.has(row.id),
        ask: row.ask,
        currency: row.currency,
        reserved: row.reserved,
        draft: false,
      })),
  ].sort((a, b) => Number(a.word === "Прибрана") - Number(b.word === "Прибрана") || Number(b.draft) - Number(a.draft));

  return (
    <div className="sheet-page">
      <h1 className="sheet-title">Мої 8</h1>
      {hydrated && !name ? <p className="sheet-note">Ім’я порожнє. Спочатку підпиши вісімку.</p> : null}
      {!hydrated || (server === null && name) ? <p className="sheet-note">Збираю твої стіни…</p> : null}
      <ul className="grid gap-2">
        {rows.map((row) => {
          const listed = listings.find((item) => item.eightId === row.id && item.side === "sell" && item.amount);
          const price = row.ask != null ? `${row.ask} ${row.currency ?? listed?.currency ?? ""}`.trim() : listed ? `${listed.amount} ${listed.currency}` : "";
          const onSale = Boolean(price);
          const sellable = row.word === "У мене";
          const line = onSale
            ? `На продажу · ${price}${row.reserved ? " · бронь" : ""}`
            : sellable
              ? "У мене · поставити ціну"
              : row.word;
          return (
            <li key={row.id}>
              {sellable ? (
                <Link to="/exchange" search={{ sell: row.id }} className="grid grid-cols-[4.5rem_1fr] gap-2 rounded-control border border-line p-2">
                  <MineFace photo={row.photo} />
                  <MineText id={row.id} city={row.city} line={line} />
                </Link>
              ) : (
                <Link to="/open/$id" params={{ id: row.id }} className="grid grid-cols-[4.5rem_1fr] gap-2 rounded-control border border-line p-2">
                  <MineFace photo={row.photo} />
                  <MineText id={row.id} city={row.city} line={line} />
                </Link>
              )}
              {row.draft ? (
                <button className="mt-1 text-meta text-muted" onClick={() => removeDraft(row.id)}>Прибрати чернетку</button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {name && server && rows.length === 0 ? (
        <>
          <p className="sheet-note">Ще немає твоєї 8.</p>
          <Link to="/create" className="chalk-pill">Намалювати</Link>
        </>
      ) : null}
    </div>
  );
}

function MineFace({ photo }: { photo: string }) {
  if (photo) return <img src={photo} alt="" className="aspect-square w-full rounded-control object-cover" />;
  return <span className="grid aspect-square place-items-center rounded-control bg-surface text-muted">8</span>;
}

function MineText({ id, city, line }: { id: string; city: string; line: string }) {
  return (
    <span className="grid content-center gap-0.5 text-sm">
      <span>{eightNo(id)} · {city}</span>
      <span className="text-meta text-muted">{line}</span>
    </span>
  );
}