/** «Дякую» підтверджувачам і «Екіпаж» запуску. Без іскор і без чату: лише люди, номер і спільна історія. */
import { useState } from "react";
import { Check, Heart } from "lucide-react";
import type { Creation, World } from "@/lib/orbit/engine";
import { useOrbits } from "@/lib/orbit/store";
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
