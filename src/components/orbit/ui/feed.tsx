import { plainEvent } from "@/lib/orbit/copy";
import { orbitNo } from "@/lib/orbit/traits";
/** Стрічка подій світу з аватарами. Лише публічний журнал; баланси інших сюди не потрапляють. */
import type { ReactNode } from "react";
import { Coins, Radio, Rocket, ShoppingCart, Sparkles, UserPlus } from "lucide-react";
import type { Account, World } from "@/lib/orbit/engine";
import { ago, notesOf, type Note } from "@/lib/orbit/inbox";
import { useOrbits } from "@/lib/orbit/store";
import { Avatar, Empty } from "@/components/orbit/ui/kit";

function iconOf(note: Note): ReactNode {
  if (note.topic === "fund") return <Coins size={10} strokeWidth={2.4} />;
  if (note.topic === "market") return <ShoppingCart size={10} strokeWidth={2.4} />;
  if (note.topic === "charge") return /Заряд пройшов/.test(note.text) ? <Sparkles size={10} strokeWidth={2.4} /> : <Rocket size={10} strokeWidth={2.4} />;
  if (/у системі/.test(note.text)) return <UserPlus size={10} strokeWidth={2.4} />;
  return <Radio size={10} strokeWidth={2.4} />;
}

/** Коротко й по-людськи: службові хвости журналу прибираємо (усе є в «Сповіщеннях»). */
export function humanize(text: string) {
  return plainEvent(text)
    .replace(/^(.+?) у системі\..*$/, "$1 — новий учасник Орбіт")
    .replace(/^(.+? купив #\d+ за [\d\s\u00a0]+✦)\..*$/, "$1")
    .replace(/^(.+?) купив (#\d+) за (.+)$/, "$1 · купівля $2 за $3")
    .replace(/^(.+?) підтвердив\. Тепер (\d+ з \d+)\.?$/, "$1 · підтвердження, тепер $2")
    .replace(/^(.+?) поставив (#\d+) у чергу\.?$/, "$1 виставляє $2 на продаж")
    .replace(/^(.+?) зняв (#\d+) з черги\.?$/, "$1 знімає $2 з продажу")
    .replace(/^Ціна на добу [\d-]+: (.+)$/, "Нова ціна дня: $1")
    .replace(/#(\d{1,7})(?!\d)/g, (_m, n: string) => orbitNo(Number(n)))
    .replace(/\.$/, "");
}

/** Хто зробив подію. Імена не унікальні, тож це лише аватарка: беремо найдовший збіг на початку тексту. */
function actor(world: World, text: string) {
  let best: Account | null = null;
  for (const row of world.accounts) {
    if (row.name.length < 2 || !text.startsWith(row.name)) continue;
    const next = text.charAt(row.name.length);
    if (next && !/[\s.,·]/.test(next)) continue;
    if (!best || row.name.length > best.name.length) best = row;
  }
  if (best) return best;
  // Старі записи журналу містять лише ім’я («Марта»), а показуємо «Марта Т.».
  const first = text.split(/[\s.,]/)[0];
  return world.accounts.find((row) => row.name.split(" ")[0] === first) ?? null;
}

/** Події без службового шуму («випустив код» повторюється — залишаємо лише важливе). */
export function feedOf(world: World, user: Account, filter?: (note: Note) => boolean) {
  return notesOf(world, user, useOrbits.getState().mine?.events ?? [], true).filter((note) => !/випустив код/.test(note.text) && (!filter || filter(note)));
}

export function Feed({ world, user, limit = 5, filter, empty = "Подій ще немає" }: { world: World; user: Account; limit?: number; filter?: (note: Note) => boolean; empty?: string }) {
  const rows = feedOf(world, user, filter).slice(0, limit);
  if (!rows.length) return <Empty icon={<Radio size={20} strokeWidth={1.6} />} title={empty} text="Щойно щось станеться у світі Орбіт, воно з’явиться тут." />;
  return (
    <ul className="k-feed">
      {rows.map((note) => {
        const who = actor(world, note.text);
        const text = humanize(note.text);
        const rest = who && text.startsWith(who.name) ? text.slice(who.name.length) : null;
        return (
          <li key={note.key} data-mine={note.mine ? "1" : "0"} data-topic={note.topic}>
            {who ? (
              <Avatar id={who.id} name={who.name} size={34} me={who.id === user.id} badge={iconOf(note)} />
            ) : (
              <span className="k-feed-sys" aria-hidden>{iconOf(note)}</span>
            )}
            <p>{rest !== null && who ? <><b>{who.name}</b>{rest}</> : text}</p>
            <time dateTime={new Date(note.at).toISOString()}>{ago(note.at, world.now)}</time>
          </li>
        );
      })}
    </ul>
  );
}
