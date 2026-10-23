/**
 * Пошук людей для «Розмов» (чиста логіка, без бази): ім'я або прізвище, від 2 символів, без регістру й апострофів.
 * Повертає лише id та показне «Ім’я П.» — повне прізвище, пошта, телефон назовні не йдуть.
 * Себе та людей у блоці (в будь-який бік) не показує. Префікс слова важливіший за входження.
 */
export const SEARCH_MIN = 2;
export const SEARCH_MAX = 12;
export const SEARCH_PER_MIN = 30;

const norm = (s: string) => s.toLowerCase().normalize("NFKC").replace(/[’'ʼ`.\-]/g, "").replace(/\s+/g, " ").trim();

export type SearchPerson = { id: string; name: string };
export function searchPeople(
  q: string,
  accounts: { id: string; name: string }[],
  people: { userId: string; given?: string; family?: string }[],
  meId: string,
  blocked: Set<string>,
  short: (name: string) => string,
): SearchPerson[] {
  const needle = norm(q);
  if (needle.length < SEARCH_MIN) return [];
  const byId = new Map(people.map((p) => [p.userId, p]));
  const scored: { p: SearchPerson; s: number }[] = [];
  for (const a of accounts) {
    if (a.id === meId || blocked.has(a.id)) continue;
    const id = byId.get(a.id);
    const words = [a.name, id?.given ?? "", id?.family ?? ""].join(" ").split(/\s+/).map(norm).filter(Boolean);
    const full = norm(`${id?.given ?? a.name} ${id?.family ?? ""}`);
    let s = 0;
    if (full.startsWith(needle)) s = 3;
    else if (words.some((w) => w.startsWith(needle))) s = 2;
    else if (needle.length >= 3 && full.includes(needle)) s = 1;
    if (s) scored.push({ p: { id: a.id, name: short(a.name) }, s });
  }
  return scored.sort((x, y) => y.s - x.s || x.p.name.localeCompare(y.p.name, "uk")).slice(0, SEARCH_MAX).map((x) => x.p);
}
