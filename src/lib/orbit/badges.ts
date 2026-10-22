/** Відзнаки — лише косметика: без іскор і без впливу на формули. Рахуються з даних світу й особистих подій. */
import type { World } from "@/lib/orbit/engine";
import { myCrews } from "@/lib/orbit/crew";
import type { Mine } from "@/lib/orbit/social";

export type BadgeId = "firstConfirm" | "firstOrbit" | "week" | "crew8" | "thanks10";
export type Badge = { id: BadgeId; title: string; hint: string; got: boolean; progress: [number, number] };

export function badgesOf(world: World, userId: string, mine: Mine | null, origins: Record<string, string> = {}): Badge[] {
  const events = mine?.events ?? [];
  const confirms = world.creations.reduce((sum, row) => sum + row.confirms.filter((c) => c.witnessId === userId).length, 0);
  const everOrbit = world.orbits.some((orbit) => orbit.ownerId === userId) || events.some((ev) => ev.t === "chargeOk" || ev.t === "buy");
  const days = mine?.days?.count ?? 0;
  const crews = myCrews(world, userId, origins).length;
  const thanks = mine?.thanksGot ?? 0;
  return [
    { id: "firstConfirm", title: "Перше підтвердження", hint: "Підтвердь чийсь запуск кодом", got: confirms >= 1, progress: [Math.min(confirms, 1), 1] },
    { id: "firstOrbit", title: "Перша орбіта", hint: "Запусти або купи орбіту", got: everOrbit, progress: [everOrbit ? 1 : 0, 1] },
    { id: "week", title: "7 днів на орбіті", hint: "Заходь і дій у 7 різних днів", got: days >= 7, progress: [Math.min(days, 7), 7] },
    { id: "crew8", title: "Свій екіпаж", hint: "Стань частиною успішного запуску", got: crews >= 1, progress: [Math.min(crews, 1), 1] },
    { id: "thanks10", title: "10 подяк", hint: "Отримай 10 «Дякую» від авторів", got: thanks >= 10, progress: [Math.min(thanks, 10), 10] },
  ];
}
