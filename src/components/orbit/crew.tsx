import { orbitNo } from "@/lib/orbit/traits";
/** «Дякую» підтверджувачам і «Екіпаж» запуску. Без іскор і без чату: лише люди, номер і спільна історія. */
import { useState } from "react";
import { Check, Heart, Users } from "lucide-react";
import type { Creation, World } from "@/lib/orbit/engine";
import { useOrbits } from "@/lib/orbit/store";
import { crewHistory, crewOfOrbit, myCrews, type Crew } from "@/lib/orbit/crew";
import { Avatar } from "@/components/orbit/ui/kit";

const nameOf = (world: World, id: string) => world.accounts.find((account) => account.id === id)?.name ?? "Учасник";

/** Список підтверджувачів успішного запуску з кнопкою «Дякую» біля кожного. */
export function ThankList({ world, creation, compact = false }: { world: World; creation: Creation; compact?: boolean }) {
  const thanked = useOrbits((state) => state.mine?.thanked[creation.id]) ?? [];
  const [busy, setBusy] = useState("");
  if (creation.status !== "done") return null;
  const left = creation.confirms.filter((row) => !thanked.includes(row.witnessId)).length;
  return (
    <div className="th-list" data-compact={compact ? "1" : "0"}>
      <p className="th-head">
        <Heart size={16} strokeWidth={2} aria-hidden /> {left ? `Подякуй екіпажу · ${creation.confirms.length - left} з ${creation.confirms.length}` : "Усім подякувано"}
      </p>
      <ul>
        {creation.confirms.map((row) => {
          const done = thanked.includes(row.witnessId);
          const who = nameOf(world, row.witnessId);
          return (
            <li key={row.witnessId}>
              <Avatar id={row.witnessId} name={who} size={30} />
              <span>{who}</span>
              <button
                type="button"
                className="th-btn"
                data-done={done ? "1" : "0"}
                disabled={done || busy === row.witnessId}
                aria-label={done ? `${who}: подяку надіслано` : `Подякувати ${who}`}
                onClick={async () => {
                  setBusy(row.witnessId);
                  try {
                    await useOrbits.getState().thank(creation.id, row.witnessId);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {done ? <><Check size={15} strokeWidth={2.4} aria-hidden /> Подякувано</> : "Дякую"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const statusWord: Record<Creation["status"], string> = { collecting: "збирає підтвердження", charging: "заряд іде", done: "пройшов", failed: "зірвався" };
const dateOf = (ms: number) => new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", timeZone: "UTC" }).format(ms);
const no7 = (n: number) => orbitNo(n);

/** Картка екіпажу: номер, 9 людей (автор + 8), орбіта, спільна історія. */
export function CrewCard({ world, crew, me, showOrbit = true }: { world: World; crew: Crew; me?: string; showOrbit?: boolean }) {
  const history = crewHistory(world, crew).slice(0, 4);
  const people = [crew.author, ...crew.members];
  return (
    <article className="cw-card" aria-label={`Екіпаж №${crew.no}`}>
      <header className="cw-head">
        <span className="cw-badge" aria-hidden><Users size={18} strokeWidth={1.8} /></span>
        <div>
          <h3>Екіпаж №{crew.no}</h3>
          <small>{showOrbit && crew.orbitId ? `Орбіта ${no7(crew.orbitId)} · ` : ""}запуск {dateOf(crew.at)}</small>
        </div>
        {me ? <span className="cw-role">{crew.author === me ? "автор" : "у екіпажі"}</span> : null}
      </header>
      <ul className="cw-ring" aria-label="Учасники екіпажу">
        {people.map((id, i) => (
          <li key={id} title={nameOf(world, id)} data-author={i === 0 ? "1" : "0"}>
            <Avatar id={id} name={nameOf(world, id)} size={i === 0 ? 40 : 32} me={id === me} />
            <span>{id === me ? "ти" : nameOf(world, id)}</span>
          </li>
        ))}
      </ul>
      {history.length ? (
        <ol className="cw-hist" aria-label="Спільна історія екіпажу">
          {history.map((row) => (
            <li key={row.id} data-status={row.status}>
              <b>{row.author === me ? "Твій запуск" : `Запуск ${nameOf(world, row.author)}`}</b>
              <small>{statusWord[row.status]} · з екіпажу підтвердили {row.together}</small>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}

/** Профіль: мої екіпажі. */
export function MyCrews({ world, userId }: { world: World; userId: string }) {
  const origins = useOrbits((state) => state.origins);
  const list = myCrews(world, userId, origins).reverse();
  if (!list.length) return null;
  return (
    <section className="orbit-block cw-mine" aria-labelledby="cw-mine-title">
      <h2 id="cw-mine-title" className="ex-h">Мої екіпажі · {list.length}</h2>
      {list.slice(0, 3).map((crew) => <CrewCard key={crew.creation.id} world={world} crew={crew} me={userId} />)}
      {list.length > 3 ? <p className="orbit-note">І ще {list.length - 3}. Екіпаж — це люди, з якими ви разом довели запуск до орбіти.</p> : null}
    </section>
  );
}

/** Картка орбіти: екіпаж, який її запустив. */
export function OrbitCrew({ world, orbitId, me }: { world: World; orbitId: number; me?: string }) {
  const origins = useOrbits((state) => state.origins);
  const crew = crewOfOrbit(world, orbitId, origins);
  if (!crew) return null;
  return (
    <section className="mo-group" aria-label="Екіпаж орбіти">
      <p className="mo-group-title">Екіпаж</p>
      <CrewCard world={world} crew={crew} me={me} showOrbit={false} />
    </section>
  );
}
