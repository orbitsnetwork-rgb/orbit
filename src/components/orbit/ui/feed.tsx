/** Стрічка подій світу з аватарами. Лише публічний журнал; баланси інших сюди не потрапляють. */
import type { ReactNode } from "react";
import { Coins, Radio, Rocket, ShoppingCart, Sparkles, UserPlus } from "lucide-react";
import type { Account, World } from "@/lib/orbit/engine";
import { ago, notesOf, type Note } from "@/lib/orbit/inbox";
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
  return text
    .replace(/^(.+?) у системі\..*$/, "$1 — новий учасник Орбіт")
    .replace(/^(.+? купив #\d+ за [\d\s\u00a0]+✦)\..*$/, "$1")
    .replace(/^(.+?) поставив (#\d+) у чергу\.?$/, "$1 виставляє $2 на продаж")
    .replace(/^(.+?) зняв (#\d+) з черги\.?$/, "$1 знімає $2 з продажу")
    .replace(/^Ціна на добу [\d-]+: (.+)$/, "Нова ціна дня: $1")
    .replace(/\.$/, "");
}

function actor(world: World, text: string) {
  const first = text.split(/[\s.,]/)[0];
  return world.accounts.find((row) => row.name === first) ?? null;
}

/** Події без службового шуму («випустив код» повторюється — залишаємо лише важливе). */
export function feedOf(world: World, user: Account, filter?: (note: Note) => boolean) {
  return notesOf(world, user).filter((note) => !/випустив код/.test(note.text) && (!filter || filter(note)));
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
