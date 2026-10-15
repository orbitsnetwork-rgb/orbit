import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { findPlace } from "@/lib/places";
import { makeSeed } from "@/lib/seed";
import { clearBlobs, deleteBlob } from "@/lib/media-db";
import { playCue } from "@/lib/sound";
import { saveVault } from "@/lib/vault";
import { MONEY_ERROR, moneyIn } from "@/lib/rules";
import type { BoardEight } from "@/lib/board";
import {
  derivedStatus,
  confirmDistanceError,
  confirmEvents,
  mergeServerEight,
  disputeReporters,
  haversine,
  independentObservers,
  nextId,
  norm,
  readPass,
  type ActionKind,
  type Commitment,
  type Currency,
  type Eight,
  type JournalEntry,
  type Listing,
  type Profile,
  type ProofFile,
  type TransferKind,
} from "@/lib/model";

export interface DraftInput {
  id?: string;
  kind: ActionKind;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  story: string;
  proof: string;
  when: string;
  legal: boolean;
  submit: boolean;
  media?: ProofFile[];
}

interface AtlasState {
  eights: Eight[];
  offers: [];
  listings: Listing[];
  profile: Profile;
  journal: JournalEntry[];
  seenAt: string;
  showCoords: boolean;
  sound: boolean;
  toast: string;
  hydrated: boolean;
  setHydrated: (value: boolean) => void;
  dismissToast: () => void;
  setProfile: (patch: Partial<Profile>) => void;
  setShowCoords: (value: boolean) => void;
  setSound: (value: boolean) => void;
  markSeen: () => void;
  saveRecord: (input: DraftInput) => { ok: true; id: string } | { ok: false; error: string };
  observe: (id: string, text: string) => { ok: true } | { ok: false; error: string };
  revokeWitness: (id: string) => { ok: true } | { ok: false; error: string };
  transfer: (id: string, to: string, kind: TransferKind, note: string) => { ok: true } | { ok: false; error: string };
  commit: (id: string, what: string) => { ok: true } | { ok: false; error: string };
  placeListing: (input: { eightId: string; currency: Currency; amount: number }) => { ok: true } | { ok: false; error: string };
  buyListing: (id: string) => { ok: true } | { ok: false; error: string };
  pullListing: (id: string) => { ok: true } | { ok: false; error: string };
  confirmNear: (id: string, lat: number, lng: number) => { ok: true; rewardId: string } | { ok: false; error: string };
  report: (id: string, reason: string) => { ok: true } | { ok: false; error: string };
  share: (id: string) => void;
  removeDraft: (id: string) => { ok: true } | { ok: false; error: string };
  resetLocal: () => void;
  importAtlas: (raw: unknown) => { ok: true; added: number } | { ok: false; error: string };
  acceptPass: (raw: string) => { ok: true; id: string } | { ok: false; error: string };
  say: (id: string, text: string) => { ok: true } | { ok: false; error: string };
  creditBoard: (row: BoardEight, rewardId?: string) => { ok: true; rewardId: string } | { ok: false; error: string };
  adoptBoard: (row: BoardEight) => void;
  receiveBought: (row: BoardEight, deal: { from: string; amount: number; currency: string }) => void;
  claimHeld: (row: BoardEight) => void;
  handOff: (eightId: string, buyer: string, amount: number, currency: string) => void;
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function pushJournal(journal: JournalEntry[], entry: Omit<JournalEntry, "id" | "at"> & { at?: string }) {
  const next: JournalEntry = {
    id: uid("j"),
    at: entry.at ?? new Date().toISOString(),
    kind: entry.kind,
    text: entry.text,
    eightId: entry.eightId,
  };
  return [next, ...journal].slice(0, 200);
}

function resolvePlace(input: DraftInput): { city: string; country: string; lat: number; lng: number } | string {
  if (input.lat != null && input.lng != null && input.city.trim() && input.country.trim()) {
    if (input.lat < -90 || input.lat > 90 || input.lng < -180 || input.lng > 180) return "Координати поза межами карти.";
    const known = findPlace(input.city);
    return {
      city: known?.city ?? input.city.trim(),
      country: known?.country ?? input.country.trim(),
      lat: input.lat,
      lng: input.lng,
    };
  }
  const known = findPlace(input.city);
  if (known) return known;
  return "Обери місто зі списку або вкажи країну і координати.";
}

function demoListings(): Listing[] {
  return [
    { id: "l-demo-lviv", eightId: "007389", side: "sell", currency: "UAH", amount: 90, by: "Олена Р.", at: "2026-02-01T10:00:00.000Z" },
    { id: "l-demo-kyiv", eightId: "007421", side: "sell", currency: "UAH", amount: 150, by: "Марія С.", at: "2026-02-02T10:00:00.000Z" },
    { id: "l-demo-tokyo", eightId: "006102", side: "sell", currency: "USD", amount: 12, by: "Юкі С.", at: "2026-02-03T10:00:00.000Z" },
  ];
}

export const useAtlas = create<AtlasState>()(
  persist(
    (set, get) => ({
      eights: makeSeed(),
      offers: [],
      listings: demoListings(),
      profile: { name: "", city: "" },
      journal: [],
      seenAt: "2020-01-01T00:00:00.000Z",
      showCoords: false,
      sound: false,
      toast: "",
      hydrated: false,
      setHydrated: (value) => set({ hydrated: value }),
      dismissToast: () => set({ toast: "" }),
      setProfile: (patch) => {
        set((state) => {
          const name = patch.name !== undefined ? patch.name.trim().slice(0, 40) : (state.profile.name ?? "");
          const previous = (state.profile.name ?? "").trim();
          const renamed = patch.name !== undefined && norm(name) !== norm(previous) && previous.length >= 2 && name.length >= 2;
          return {
            profile: {
              name,
              city: patch.city !== undefined ? patch.city.trim().slice(0, 40) : state.profile.city,
              avatar: patch.avatar !== undefined ? patch.avatar.slice(0, 180_000) : state.profile.avatar,
              joinedAt: state.profile.joinedAt ?? (name.trim().length >= 2 ? new Date().toISOString() : undefined),
              key: patch.key !== undefined ? patch.key : state.profile.key,
              recovery: patch.recovery !== undefined ? patch.recovery : state.profile.recovery,
            },
            listings: renamed
              ? (state.listings ?? []).map((item) => (norm(item.by) === norm(previous) ? { ...item, by: name } : item))
              : state.listings,
            toast: renamed ? "Ім'я змінене. Уже поставлені 8 лишились під старим підписом." : state.toast,
          };
        });
        if (patch.key !== undefined || patch.recovery !== undefined) {
          const profile = get().profile;
          void saveVault(profile.key ?? "", profile.recovery ?? "");
        }
      },
      setShowCoords: (value) => set({ showCoords: value }),
      setSound: (value) => set({ sound: value }),
      markSeen: () => set({ seenAt: new Date().toISOString() }),
      saveRecord: (input) => {
        const name = (get().profile.name ?? "").trim();
        if (name.length < 2) return { ok: false, error: "Спочатку вкажи ім'я в протоколі. Це локальне ім'я, не акаунт." };
        const place = resolvePlace(input);
        if (typeof place === "string") return { ok: false, error: place };
        if (!input.when) return { ok: false, error: "Вкажи дату дії." };
        const when = new Date(input.when);
        if (Number.isNaN(when.getTime())) return { ok: false, error: "Дата не читається." };
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        if (when.getTime() > end.getTime()) return { ok: false, error: "Дата дії не може бути в майбутньому." };
        if (input.submit) {
          if (!input.legal) return { ok: false, error: "Без підтвердження законності місця запис не надсилається." };
          if (input.story.trim().length < 8) return { ok: false, error: "Напиши, де шукати цю стіну." };
          if (input.proof.trim().length < 40) return { ok: false, error: "Опиши доказ: що саме видно, а не лише факт зйомки." };
        } else if (input.story.trim().length < 8) {
          return { ok: false, error: "Навіть для чернетки напиши, що це за дія." };
        }
        if (moneyIn(input.story) || moneyIn(input.proof)) return { ok: false, error: MONEY_ERROR };
        const stateNow = get();
        const mineToday = stateNow.eights.filter((entry) => norm(entry.creator) === norm(name) && !entry.example && Date.now() - new Date(entry.createdAt).getTime() < 24 * 60 * 60 * 1000);
        const editing = input.id ? stateNow.eights.find((entry) => entry.id === input.id) : undefined;
        if (input.submit) {
          const hasPhoto = (input.media ?? editing?.media ?? []).some((file) => file.kind === "image") || Boolean(editing?.proofMedia);
          if (!hasPhoto) return { ok: false, error: "Без фото можна лише залишити в тіні." };
        }
        if (editing && (editing.example || editing.state !== "created" || norm(editing.creator) !== norm(name))) {
          return { ok: false, error: "Цей запис уже не можна редагувати." };
        }
        if (!editing && mineToday.length >= 8) return { ok: false, error: "За останні 24 години вже 8 нових знаків." };
        const story = input.story.trim();
        const duplicate = stateNow.eights.some((entry) => {
          if (editing && entry.id === editing.id) return false;
          if (norm(entry.city) !== norm(place.city)) return false;
          const other = norm(entry.story);
          const mine = norm(story);
          return mine.length > 20 && (other === mine || other.includes(mine) || mine.includes(other));
        });
        if (duplicate) return { ok: false, error: "Схожий запис у цьому місті вже є." };
        const now = new Date().toISOString();
        const id = editing?.id ?? nextId(stateNow.eights);
        const next: Eight = {
          id,
          city: place.city,
          country: place.country,
          lat: place.lat,
          lng: place.lng,
          creator: name,
          holder: name,
          createdAt: editing?.createdAt ?? now,
          state: input.submit ? "submitted" : "created",
          kind: input.kind,
          story,
          proof: input.proof.trim(),
          media: input.media ?? editing?.media ?? [],
          observations: editing?.observations ?? [],
          transfers: editing?.transfers ?? [],
          commitments: editing?.commitments ?? [],
          reports: editing?.reports ?? [],
          attention: editing?.attention ?? 0,
          history: [
            ...(editing?.history ?? [
              {
                id: uid("e"),
                at: now,
                kind: "created" as const,
                by: name,
                status: "DRAFT" as const,
                text: "Чернетка.",
              },
            ]),
            ...(input.submit
              ? [
                  {
                    id: uid("e"),
                    at: now,
                    kind: "placed" as const,
                    by: name,
                    status: "PLACED" as const,
                    lat: place.lat,
                    lng: place.lng,
                    photo: (input.media ?? editing?.media ?? []).find((file) => file.kind === "image")?.preview,
                    text: "8 поставлена на стіну.",
                  },
                ]
              : []),
          ],
        };
        set({
          eights: editing ? stateNow.eights.map((entry) => (entry.id === id ? next : entry)) : [next, ...stateNow.eights],
          journal: pushJournal(stateNow.journal, {
            kind: input.submit ? "submitted" : "created",
            text: input.submit ? `Поставлено 8 ${id}` : `Чернетка 8 ${id}`,
            eightId: id,
          }),
          toast: input.submit ? `8 ${id} чекає підтвердження на місці.` : `Чернетку 8 ${id} збережено.`,
        });
        if (input.submit) playCue("create");
        return { ok: true, id };
      },
      observe: (id, text) => {
        const name = (get().profile.name ?? "").trim();
        if (name.length < 2) return { ok: false, error: "Щоб спостерігати, вкажи ім'я в профілі." };
        const body = text.trim();
        if (body.length < 80) return { ok: false, error: "Спостереження має описувати побачене, щонайменше 80 знаків." };
        const entry = get().eights.find((item) => item.id === id);
        if (!entry || entry.state === "created") return { ok: false, error: "Цього запису немає." };
        if (entry.anchor) return { ok: false, error: "Якір не підтверджують спостереженням." };
        if (norm(name) === norm(entry.creator) || norm(name) === norm(entry.holder)) {
          return { ok: false, error: "Автор і володар не підтверджують власний запис." };
        }
        if (entry.observations.some((item) => norm(item.by) === norm(name) && !item.revokedAt)) {
          return { ok: false, error: "Це ім'я вже лишило спостереження." };
        }
        const observation = { id: uid("o"), by: name, at: new Date().toISOString(), text: body };
        set({
          eights: get().eights.map((item) =>
            item.id === id
              ? {
                  ...entry,
                  observations: [...entry.observations, observation],
                  history: [...entry.history, { id: uid("h"), at: observation.at, kind: "observation" as const, text: `${name} лишив нотатку. 8 від цього не зараховується.` }],
                }
              : item,
          ),
          journal: pushJournal(get().journal, { kind: "observation", text: `Нотатка до 8 ${id}`, eightId: id }),
          toast: "Нотатку записано. Зараховує лише підтвердження на місці.",
        });
        playCue("notify");
        return { ok: true };
      },
      revokeWitness: (id) => {
        const name = (get().profile.name ?? "").trim();
        const entry = get().eights.find((item) => item.id === id);
        if (!entry) return { ok: false, error: "Запис не знайдено." };
        const mine = entry.observations.find((item) => norm(item.by) === norm(name) && !item.revokedAt);
        if (!mine) return { ok: false, error: "Тут немає твого чинного свідчення." };
        const at = new Date().toISOString();
        const observations = entry.observations.map((item) => (item.id === mine.id ? { ...item, revokedAt: at } : item));
        const draft = { ...entry, observations };
        const lost = independentObservers(entry).length >= 2 && independentObservers(draft).length < 2;
        set({
          eights: get().eights.map((item) =>
            item.id === id
              ? { ...draft, history: [...entry.history, { id: uid("h"), at, kind: "observation" as const, text: lost ? `${name} забрав свідчення. Верифікації більше немає.` : `${name} забрав свідчення.` }] }
              : item,
          ),
          journal: pushJournal(get().journal, { kind: "observation", text: `Свідчення до 8 ${id} відкликано`, eightId: id }),
          toast: lost ? "Свідчення забрано. Запис знову чекає." : "Свідчення забрано.",
        });
        return { ok: true };
      },
      transfer: (id, to, kind, note) => {
        const name = (get().profile.name ?? "").trim();
        const target = to.trim();
        const entry = get().eights.find((item) => item.id === id);
        if (!entry) return { ok: false, error: "Запис не знайдено." };
        if (entry.anchor) return { ok: false, error: "Якір не передається." };
        if (derivedStatus(entry) !== "verified") return { ok: false, error: "Передавати можна лише підтверджену 8." };
        if (norm(name) !== norm(entry.holder)) return { ok: false, error: "Передає лише поточний володар." };
        if (target.length < 2) return { ok: false, error: "Вкажи, кому переходить 8." };
        if (norm(target) === norm(entry.holder)) return { ok: false, error: "Не можна передати запис самому собі." };
        if (note.trim().length < 8) return { ok: false, error: "Коротко напиши, що це за передача." };
        if (moneyIn(note)) return { ok: false, error: MONEY_ERROR };
        const at = new Date().toISOString();
        set({
          eights: get().eights.map((item) =>
            item.id === id
              ? {
                  ...item,
                  holder: target,
                  transfers: [...item.transfers, { id: uid("t"), from: entry.holder, to: target, at, kind, note: note.trim() }],
                  history: [...item.history, { id: uid("h"), at, kind: "transfer" as const, text: `${entry.holder} → ${target}.` }],
                }
              : item,
          ),
          listings: (get().listings ?? []).filter((item) => !(item.eightId === id && item.side === "sell")),
          journal: pushJournal(get().journal, { kind: "transfer", text: `8 ${id} передано до ${target}`, eightId: id }),
          toast: `8 ${id} тепер у ${target}. Продаж знято.`,
        });
        playCue("transfer");
        return { ok: true };
      },
      commit: (id, what) => {
        const name = (get().profile.name ?? "").trim();
        const entry = get().eights.find((item) => item.id === id);
        if (!entry) return { ok: false, error: "Запис не знайдено." };
        if (entry.anchor) return { ok: false, error: "До якоря не чіпляють обіцянки." };
        if (derivedStatus(entry) !== "verified") return { ok: false, error: "Обіцянка можлива лише після підтвердження." };
        if (norm(name) !== norm(entry.holder)) return { ok: false, error: "Обіцяє лише поточний володар." };
        const body = what.trim();
        if (body.length < 12) return { ok: false, error: "Назви конкретну річ або дію." };
        if (moneyIn(body)) return { ok: false, error: MONEY_ERROR };
        const at = new Date().toISOString();
        const commitment: Commitment = { id: uid("c"), by: name, at, what: body };
        set({
          eights: get().eights.map((item) =>
            item.id === id
              ? { ...item, commitments: [...item.commitments, commitment], history: [...item.history, { id: uid("h"), at, kind: "commitment" as const, text: `${name} прив'язав обіцянку речі.` }] }
              : item,
          ),
          journal: pushJournal(get().journal, { kind: "commitment", text: `Обіцянка до 8 ${id}`, eightId: id }),
          toast: "Обіцянку записано.",
        });
        return { ok: true };
      },
      placeListing: (input) => {
        const name = (get().profile.name ?? "").trim();
        if (name.length < 2) return { ok: false, error: "Спочатку вкажи ім'я в профілі." };
        const entry = get().eights.find((item) => item.id === input.eightId);
        if (!entry || entry.state === "created") return { ok: false, error: "Цієї 8 немає." };
        if (entry.anchor) return { ok: false, error: "Якір не виставляється." };
        if (derivedStatus(entry) === "disputed") return { ok: false, error: "Оскаржену 8 не виставляють." };
        if (derivedStatus(entry) !== "verified") return { ok: false, error: "Спочатку хтось має підтвердити 8 на місці." };
        if (norm(name) !== norm(entry.holder)) return { ok: false, error: "Продає лише той, кому 8 зарахована." };
        if (!["UAH", "USD", "EUR"].includes(input.currency)) return { ok: false, error: "Обери валюту." };
        if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: "Вкажи ціну більшу за нуль." };
        if ((get().listings ?? []).some((item) => item.eightId === entry.id && item.side === "sell")) return { ok: false, error: "Ця 8 вже стоїть на продажі." };
        const listing: Listing = {
          id: uid("l"),
          eightId: entry.id,
          side: "sell",
          currency: input.currency,
          amount: Math.round(input.amount * 100) / 100,
          by: name,
          at: new Date().toISOString(),
        };
        set({
          listings: [listing, ...(get().listings ?? [])].slice(0, 80),
          toast: `8 ${entry.id} виставлено за ${listing.amount} ${listing.currency}.`,
        });
        return { ok: true };
      },
      buyListing: (id) => {
        const name = (get().profile.name ?? "").trim();
        if (name.length < 2) return { ok: false, error: "Спочатку вкажи ім'я в профілі." };
        const listing = (get().listings ?? []).find((item) => item.id === id && item.side === "sell" && item.amount);
        if (!listing) return { ok: false, error: "Цієї 8 вже немає на продажі." };
        if (norm(name) === norm(listing.by)) return { ok: false, error: "Свою 8 не купують. Її можна зняти." };
        const entry = get().eights.find((item) => item.id === listing.eightId);
        if (!entry) return { ok: false, error: "Запис не знайдено." };
        const at = new Date().toISOString();
        set({
          eights: get().eights.map((item) =>
            item.id === entry.id
              ? {
                  ...item,
                  holder: name,
                  transfers: [...item.transfers, { id: uid("t"), from: entry.holder, to: name, at, kind: "eight" as const, note: `Купівля за ${listing.amount} ${listing.currency}` }],
                  history: [...item.history, { id: uid("h"), at, kind: "transfer" as const, text: `${entry.holder} → ${name} за ${listing.amount} ${listing.currency}.` }],
                }
              : item,
          ),
          listings: (get().listings ?? []).filter((item) => item.id !== listing.id),
          journal: pushJournal(get().journal, { kind: "transfer", text: `Куплено 8 ${entry.id} за ${listing.amount} ${listing.currency}`, eightId: entry.id }),
          toast: `8 ${entry.id} тепер твоя. Ціна ${listing.amount} ${listing.currency}.`,
        });
        return { ok: true };
      },
      pullListing: (id) => {
        const name = (get().profile.name ?? "").trim();
        const listing = (get().listings ?? []).find((item) => item.id === id);
        if (!listing) return { ok: false, error: "Цієї виставки немає." };
        if (norm(name) !== norm(listing.by)) return { ok: false, error: "Зняти може лише той, хто виставив." };
        set({ listings: (get().listings ?? []).filter((item) => item.id !== id), toast: "Виставку знято." });
        return { ok: true };
      },
      confirmNear: (id, lat, lng) => {
        const name = (get().profile.name ?? "").trim();
        if (name.length < 2) return { ok: false, error: "Спочатку вкажи ім'я в профілі." };
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: "Немає твоєї геолокації." };
        const entry = get().eights.find((item) => item.id === id);
        if (!entry || entry.state === "created") return { ok: false, error: "Цієї 8 немає на місці." };
        if (entry.anchor || entry.rewardOf || entry.confirmedBy) return { ok: false, error: "Цю 8 вже не треба підтверджувати." };
        if (derivedStatus(entry) === "verified" || derivedStatus(entry) === "disputed") return { ok: false, error: "Цю 8 вже не треба підтверджувати." };
        if (norm(name) === norm(entry.creator) || norm(name) === norm(entry.holder)) return { ok: false, error: "Свою 8 підтверджує інша людина." };
        const away = confirmDistanceError(haversine({ lat, lng }, entry) * 1000);
        if (away) return { ok: false, error: away };
        const at = new Date().toISOString();
        const rewardId = nextId(get().eights);
        const reward: Eight = {
          id: rewardId,
          city: entry.city,
          country: entry.country,
          lat: entry.lat,
          lng: entry.lng,
          creator: name,
          holder: name,
          createdAt: at,
          state: "submitted",
          kind: "photo",
          story: `Підтвердження 8 ${entry.id} на місці. Одна 8 зарахована за спільну дію.`,
          proof: "Людина була поруч і підтвердила, що знак на місці є.",
          media: entry.media,
          proofMedia: entry.proofMedia,
          observations: [],
          transfers: [],
          commitments: [],
          reports: [],
          history: [{ id: uid("h"), at, kind: "verified", text: `Зараховано за підтвердження 8 ${entry.id}.` }],
          attention: 0,
          confirmedBy: name,
          confirmedAt: at,
          rewardOf: entry.id,
        };
        set({
          eights: [
            reward,
            ...get().eights.map((item) =>
              item.id === id
                ? { ...item, confirmedBy: name, confirmedAt: at, history: [...item.history, { id: uid("h"), at, kind: "verified" as const, text: `${name} підтвердив на місці. 8 зарахована обом.` }] }
                : item,
            ),
          ],
          journal: pushJournal(get().journal, { kind: "verified", text: `8 ${id} підтверджена. ${name} отримав ${rewardId}.`, eightId: id }),
          toast: `Підтверджено. ${entry.creator} і ${name} отримали по одній 8.`,
        });
        playCue("verify");
        return { ok: true, rewardId };
      },
      report: (id, reason) => {
        const name = (get().profile.name ?? "").trim();
        if (name.length < 2) return { ok: false, error: "Щоб лишити скаргу, вкажи ім'я в профілі." };
        const entry = get().eights.find((item) => item.id === id);
        if (!entry || entry.anchor) return { ok: false, error: "Цей запис не приймає скаргу тут." };
        if (norm(name) === norm(entry.creator)) return { ok: false, error: "Свою 8 не оскаржують." };
        if (entry.reports.some((item) => norm(item.by) === norm(name))) return { ok: false, error: "Ти вже лишав скаргу на цей запис." };
        const body = reason.trim();
        if (body.length < 12) return { ok: false, error: "Напиши, що саме не так." };
        if (moneyIn(body)) return { ok: false, error: MONEY_ERROR };
        const at = new Date().toISOString();
        const reports = [...entry.reports, { id: uid("r"), by: name, at, reason: body }];
        const draft = { ...entry, reports };
        const opened = disputeReporters(entry).length < 3 && disputeReporters(draft).length >= 3;
        set({
          eights: get().eights.map((item) =>
            item.id === id
              ? {
                  ...draft,
                  history: [
                    ...item.history,
                    { id: uid("h"), at, kind: "report" as const, text: "Зафіксовано скаргу." },
                    ...(opened ? [{ id: uid("h"), at, kind: "report" as const, text: "Три різні скарги. Запис оскаржено і лишається видимим." }] : []),
                  ],
                }
              : item,
          ),
          journal: pushJournal(get().journal, { kind: "report", text: opened ? `8 ${id} оскаржено` : `Скарга на 8 ${id}`, eightId: id }),
          toast: opened ? "Три різні скарги. 8 оскаржена." : "Скаргу записано.",
        });
        return { ok: true };
      },
      share: (id) => {
        set({
          eights: get().eights.map((item) => (item.id === id ? { ...item, attention: item.attention + 1 } : item)),
          toast: "Посилання готове. Довіра від цього не змінюється.",
        });
      },
      removeDraft: (id) => {
        const name = (get().profile.name ?? "").trim();
        const entry = get().eights.find((item) => item.id === id);
        if (!entry || entry.state !== "created" || norm(entry.creator) !== norm(name)) return { ok: false, error: "Прибрати можна лише власну чернетку." };
        for (const file of entry.media ?? []) {
          if (file.kind === "video" || file.kind === "image") void deleteBlob(file.id);
        }
        set({ eights: get().eights.filter((item) => item.id !== id), toast: "Чернетку прибрано." });
        return { ok: true };
      },
      resetLocal: () => {
        void clearBlobs();
        set({
          eights: makeSeed(),
          offers: [],
          listings: demoListings(),
          profile: { name: "", city: "" },
          journal: [],
          seenAt: new Date().toISOString(),
          showCoords: false,
          sound: false,
          toast: "Локальний реєстр повернуто до початкового атласу.",
        });
      },
      importAtlas: (raw) => {
        if (!raw || typeof raw !== "object" || !Array.isArray((raw as { eights?: unknown }).eights)) return { ok: false, error: "Це не файл атласу." };
        const incoming = (raw as { eights: unknown[] }).eights;
        const have = new Set(get().eights.map((entry) => entry.id));
        const next: Eight[] = [];
        for (const item of incoming) {
          if (!item || typeof item !== "object") continue;
          const row = item as Eight;
          if (typeof row.id !== "string" || typeof row.city !== "string" || typeof row.creator !== "string") continue;
          if (row.example || have.has(row.id)) continue;
          next.push({ ...row, example: false, media: row.media ?? [] });
        }
        if (next.length === 0) return { ok: false, error: "Нових записів немає. Чужі підписи не переписуються." };
        set({ eights: [...next, ...get().eights], toast: `Додано ${next.length}.` });
        return { ok: true, added: next.length };
      },
      acceptPass: (raw) => {
        const data = readPass(raw);
        if (!data) return { ok: false, error: "Код не читається. Скопіюй його повністю." };
        const existing = get().eights.find((item) => item.id === data.id);
        if (existing) {
          if (norm(existing.creator) !== norm(data.creator)) return { ok: false, error: "Такий номер уже є, але це інша 8." };
          return { ok: true, id: existing.id };
        }
        const entry: Eight = {
          id: data.id,
          city: data.city,
          country: data.country,
          lat: data.lat,
          lng: data.lng,
          creator: data.creator,
          holder: data.creator,
          createdAt: data.at,
          state: "submitted",
          kind: data.kind,
          story: data.story,
          proof: data.proof,
          shot: data.shot,
          observations: [],
          transfers: [],
          commitments: [],
          reports: [],
          history: [{ id: uid("h"), at: data.at, kind: "submitted", text: "Прийнято з іншого телефона. Чекає підтвердження на місці." }],
          attention: 0,
          thread: data.note
            ? [{ id: uid("n"), by: data.creator, at: data.at, text: data.note }]
            : [],
        };
        set({ eights: [entry, ...get().eights], toast: `8 ${data.id} прийнято. Підтвердити можна на місці.` });
        return { ok: true, id: data.id };
      },
      say: (id, text) => {
        const name = (get().profile.name ?? "").trim();
        const body = text.trim();
        if (name.length < 2) return { ok: false, error: "Спочатку вкажи ім'я в профілі." };
        if (body.length < 2) return { ok: false, error: "Напиши хоча б пару слів." };
        if (body.length > 240) return { ok: false, error: "Записка коротша за 240 знаків." };
        if (moneyIn(body)) return { ok: false, error: MONEY_ERROR };
        const entry = get().eights.find((item) => item.id === id);
        if (!entry) return { ok: false, error: "Цієї 8 немає." };
        const note = { id: uid("n"), by: name, at: new Date().toISOString(), text: body };
        set({
          eights: get().eights.map((item) => (item.id === id ? { ...item, thread: [...(item.thread ?? []), note] } : item)),
        });
        return { ok: true };
      },
      adoptBoard: (row) => {
        const existing = get().eights.find((item) => item.id === row.id);
        const next = mergeServerEight(existing, row);
        set({
          eights: existing ? get().eights.map((item) => (item.id === row.id ? next : item)) : [next, ...get().eights],
        });
      },
      creditBoard: (row, givenId) => {
        if (row.status !== "confirmed" || !row.confirmedBy) return { ok: false, error: "Ще не підтверджено." };
        const name = (get().profile.name ?? "").trim();
        const at = new Date().toISOString();
        let eights = get().eights.slice();
        const existing = eights.find((item) => item.id === row.id);
        const wasConfirmed = Boolean(existing?.confirmedBy);
        const base: Eight = existing ?? {
          id: row.id,
          city: row.city,
          country: row.country,
          lat: row.lat,
          lng: row.lng,
          creator: row.creator,
          holder: row.creator,
          createdAt: row.createdAt,
          state: "submitted",
          kind: "draw",
          story: row.story || "Намальована 8 на стіні.",
          proof: "Фото знака на стіні.",
          media: row.photo.startsWith("data:image/")
            ? [{ id: `p-${row.id}`, kind: "image" as const, name: "стіна", caption: "", at: row.createdAt, preview: row.photo }]
            : [],
          shot: row.photo.startsWith("/") ? row.photo : undefined,
          observations: [],
          transfers: [],
          commitments: [],
          reports: [],
          history: [{ id: uid("h"), at: row.createdAt, kind: "submitted", text: `${row.creator} поставив 8 на стіну.` }],
          attention: 0,
        };
        const shot = row.confirmPhoto?.startsWith("data:image/") ? row.confirmPhoto : "";
        const media = shot && !base.media?.some((file) => file.name === "підтвердження")
          ? [...(base.media ?? []), { id: `c-${base.id}`, kind: "image" as const, name: "підтвердження", caption: row.confirmedBy, at, preview: shot }]
          : base.media;
        const stamped: Eight = {
          ...base,
          media,
          confirmedBy: row.confirmedBy,
          confirmedAt: base.confirmedAt ?? at,
          history: wasConfirmed ? base.history : confirmEvents(base.history, base.id, row.confirmedBy ?? "", at, { lat: row.lat, lng: row.lng }),
        };
        eights = existing ? eights.map((item) => (item.id === row.id ? stamped : item)) : [stamped, ...eights];
        const mine = norm(name) === norm(row.confirmedBy);
        let rewardId = eights.find((item) => item.rewardOf === row.id)?.id ?? "";
        if (mine && !rewardId) {
          rewardId = givenId && !eights.some((item) => item.id === givenId) ? givenId : nextId(eights);
          const reward: Eight = {
            id: rewardId,
            city: row.city,
            country: row.country,
            lat: row.lat,
            lng: row.lng,
            creator: name,
            holder: name,
            createdAt: at,
            state: "submitted",
            kind: "photo",
            story: `Підтвердження 8 ${row.id} на місці. Одна 8 зарахована за спільну дію.`,
            proof: "Людина була поруч і сфотографувала той самий знак.",
            media: stamped.media,
            observations: [],
            transfers: [],
            commitments: [],
            reports: [],
            history: [
              { id: uid("e"), at, kind: "created" as const, by: name, status: "DRAFT" as const, text: `Народжена підтвердженням 8 ${row.id}.` },
              { id: uid("e"), at, kind: "verified" as const, by: name, status: "VERIFIED" as const, text: `Зараховано за підтвердження 8 ${row.id}.` },
              { id: uid("e"), at, kind: "activated" as const, by: name, status: "ACTIVE" as const, text: "8 активна." },
            ],
            attention: 0,
            confirmedBy: name,
            confirmedAt: at,
            rewardOf: row.id,
          };
          eights = [reward, ...eights];
        }
        const gained = mine && rewardId && !get().eights.some((item) => item.id === rewardId);
        const note = gained
          ? `Підтверджено. ${row.creator} і ${name} отримали по одній 8.`
          : !wasConfirmed && norm(name) === norm(row.creator)
            ? `8 ${row.id} підтвердили. Тобі теж зараховано.`
            : "";
        const journal = note ? pushJournal(get().journal, { kind: "verified", text: note, eightId: row.id }) : get().journal;
        set(note ? { eights, toast: note, journal } : { eights });
        return { ok: true, rewardId: rewardId || row.id };
      },
      receiveBought: (row, deal) => {
        const name = (get().profile.name ?? "").trim();
        const at = new Date().toISOString();
        const note = `Купівля за ${deal.amount} ${deal.currency}`;
        const existing = get().eights.find((item) => item.id === row.id);
        const next: Eight = existing
          ? {
              ...existing,
              holder: name,
              transfers: [...existing.transfers, { id: uid("t"), from: deal.from, to: name, at, kind: "eight", note }],
              history: [...existing.history, { id: uid("h"), at, kind: "transfer", text: `${deal.from} → ${name} за ${deal.amount} ${deal.currency}.` }],
            }
          : {
              id: row.id,
              city: row.city,
              country: row.country,
              lat: row.lat,
              lng: row.lng,
              creator: row.creator,
              holder: name,
              createdAt: row.createdAt,
              state: "submitted",
              kind: "photo",
              story: row.story || "Куплена 8.",
              proof: "Купівля в додатку. Гроші передані поза записом.",
              media: row.photo.startsWith("data:image/")
                ? [{ id: `p-${row.id}`, kind: "image", name: "стіна", caption: "", at, preview: row.photo }]
                : [],
              shot: row.photo.startsWith("/") ? row.photo : undefined,
              observations: [],
              transfers: [{ id: uid("t"), from: deal.from, to: name, at, kind: "eight", note }],
              commitments: [],
              reports: [],
              history: [{ id: uid("h"), at, kind: "transfer", text: `${deal.from} → ${name} за ${deal.amount} ${deal.currency}.` }],
              attention: 0,
              confirmedBy: row.confirmedBy ?? row.creator,
              confirmedAt: at,
            };
        set({
          eights: existing ? get().eights.map((item) => (item.id === row.id ? next : item)) : [next, ...get().eights],
          listings: (get().listings ?? []).filter((item) => item.eightId !== row.id),
          toast: `8 ${row.id} тепер твоя. Гроші ${deal.amount} ${deal.currency} передаєш ${deal.from} сам.`,
        });
      },
      claimHeld: (row) => {
        const name = (get().profile.name ?? "").trim();
        if (norm(row.holder) !== norm(name)) return;
        const existing = get().eights.find((item) => item.id === row.id);
        if (existing && norm(existing.holder) === norm(name)) return;
        const at = new Date().toISOString();
        const next: Eight = existing
          ? { ...existing, holder: name, history: [...existing.history, { id: uid("h"), at, kind: "transfer", text: `8 перейшла до ${name}.` }] }
          : {
              id: row.id,
              city: row.city,
              country: row.country,
              lat: row.lat,
              lng: row.lng,
              creator: row.creator,
              holder: name,
              createdAt: row.createdAt,
              state: "submitted",
              kind: "photo",
              story: row.story || "8 після підтвердження продавця.",
              proof: "Продавець підтвердив, що гроші отримано.",
              media: row.photo.startsWith("data:image/")
                ? [{ id: `p-${row.id}`, kind: "image", name: "стіна", caption: "", at, preview: row.photo }]
                : [],
              shot: row.photo.startsWith("/") ? row.photo : undefined,
              observations: [],
              transfers: [],
              commitments: [],
              reports: [],
              history: [{ id: uid("h"), at, kind: "transfer", text: `8 перейшла до ${name}.` }],
              attention: 0,
              confirmedBy: row.confirmedBy ?? row.creator,
              confirmedAt: at,
            };
        set({
          eights: existing ? get().eights.map((item) => (item.id === row.id ? next : item)) : [next, ...get().eights],
          listings: (get().listings ?? []).filter((item) => item.eightId !== row.id),
          toast: `8 ${row.id} тепер твоя.`,
        });
      },
      handOff: (eightId, buyer, amount, currency) => {
        const entry = get().eights.find((item) => item.id === eightId);
        if (!entry || norm(entry.holder) === norm(buyer)) return;
        const at = new Date().toISOString();
        set({
          eights: get().eights.map((item) =>
            item.id === eightId
              ? {
                  ...item,
                  holder: buyer,
                  transfers: [...item.transfers, { id: uid("t"), from: entry.holder, to: buyer, at, kind: "eight" as const, note: `Продаж за ${amount} ${currency}` }],
                  history: [...item.history, { id: uid("h"), at, kind: "transfer" as const, text: `${entry.holder} → ${buyer} за ${amount} ${currency}.` }],
                }
              : item,
          ),
          listings: (get().listings ?? []).filter((item) => item.eightId !== eightId),
          toast: `8 ${eightId} перейшла до ${buyer}.`,
        });
      },
    }),
    {
      name: "vosma-registry-v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        eights: state.eights,
        listings: state.listings ?? [],
        profile: {
          name: state.profile.name,
          city: state.profile.city,
          avatar: state.profile.avatar,
          joinedAt: state.profile.joinedAt,
        },
        journal: state.journal,
        seenAt: state.seenAt,
        showCoords: state.showCoords,
        sound: state.sound,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AtlasState>;
        const savedEights = Array.isArray(saved.eights) ? saved.eights : [];
        const byId = new Map(savedEights.map((entry) => [entry.id, entry]));
        for (const entry of makeSeed()) {
          if (!byId.has(entry.id)) byId.set(entry.id, entry);
        }
        const savedListings = Array.isArray(saved.listings) ? saved.listings : [];
        return {
          ...current,
          ...saved,
          eights: [...byId.values()],
          listings: savedListings.some((item) => item.amount && item.amount > 0) ? savedListings : demoListings(),
          offers: [],
          profile: saved.profile
            ? { name: saved.profile.name ?? "", city: saved.profile.city ?? "", avatar: saved.profile.avatar, joinedAt: saved.profile.joinedAt }
            : current.profile,
          journal: saved.journal ?? [],
          toast: "",
          hydrated: false,
        };
      },
    },
  ),
);
