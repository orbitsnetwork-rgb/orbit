/**
 * Облік випуску ✦ (аудит а7): на кожен запис світу — рядок «що змінилось у масі й чим це пояснюється».
 * Маса = Σ(баланс + відкладені стартові) + фонд + резерв. spark-economy: маса росте лише від сплачених поповнень
 * (з кошика продажу); стартові й нагороди свідкам — перекази з фонду, масу не змінюють (поля лишаються для довідки). Нічого не повертається (вивід — «Скоро»),
 * тож returned поки завжди 0. unexplained має бути 0 — інакше звірка показує розбіжність.
 * Чиста функція; формули рушія не змінює і не дублює — лише рахує суми зі стану.
 */
import type { World } from "@/lib/orbit/engine";
import { supplyOf } from "@/lib/orbit/supply";
import type { Topup } from "@/lib/orbit/access";
import type { Ev } from "@/lib/orbit/social";

export type Emission = { at: number; mass: number; fund: number; starter: number; witness: number; topup: number; returned: number; delta: number; unexplained: number };

export function massOf(world: World) {
  return world.accounts.reduce((sum, account) => sum + account.balance + (account.starterPending ?? 0), 0) + world.fund + world.reserve;
}

export function emissionOf(prev: World, next: World, prevTopups: Topup[], nextTopups: Topup[], events: [string, Ev][]): Emission {
  const known = new Set(prev.accounts.map((account) => account.id));
  const starter = next.accounts.filter((account) => !known.has(account.id)).reduce((sum, account) => sum + account.balance + (account.starterPending ?? 0), 0);
  const witness = events.filter(([, ev]) => ev.t === "witnessOk").reduce((sum, [, ev]) => sum + (ev.amt ?? 0), 0);
  const was = new Set(prevTopups.filter((row) => row.status === "paid").map((row) => row.id));
  const topup = nextTopups.filter((row) => row.status === "paid" && !was.has(row.id)).reduce((sum, row) => sum + row.amount, 0);
  const delta = massOf(next) - massOf(prev);
  // starter/witness тепер перекази з фонду (не випуск) — у звірку не входять, тому пишемо 0; довідково лишаються в подіях.
  // У обіг ✦ потрапляють лише з кошика продажу скарбниці: випуск = на скільки зменшився кошик (≈ сплачені поповнення).
  void starter; void witness; void topup;
  const minted = supplyOf(prev).sale - supplyOf(next).sale;
  return { at: next.now, mass: massOf(next), fund: next.fund, starter: 0, witness: 0, topup: minted, returned: 0, delta, unexplained: delta - minted };
}

export type DaySnap = { day: string; mass: number; fund: number; minted: number; returned: number; starter: number; witness: number; topup: number; unexplained: number };
export type Transparency = { now: number; mass: number; fund: number; reserve: number; accounts: number; days: DaySnap[]; months: (Omit<DaySnap, "day" | "mass" | "fund"> & { month: string })[]; reconciliation: number; checkedAt: number };

export function toCsv(days: DaySnap[]) {
  const head = "day,total_sparks,fund,minted,starter,witness,topup,returned,unexplained";
  return [head, ...days.map((d) => [d.day, d.mass, d.fund, d.minted, d.starter, d.witness, d.topup, d.returned, d.unexplained].join(","))].join("\n") + "\n";
}
