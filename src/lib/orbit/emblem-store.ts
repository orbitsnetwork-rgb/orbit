/** Клієнтський кеш емблем усіх людей: один легкий запит, оновлення раз на хвилину, підписка для React. */
import { useSyncExternalStore } from "react";
import type { Emblem } from "@/lib/orbit/emblem";

let map: Record<string, Emblem> = {};
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function refreshEmblems(force = false) {
  if (typeof window === "undefined") return Promise.resolve();
  if (!force && (inflight || Date.now() - loadedAt < 60_000)) return inflight ?? Promise.resolve();
  inflight = import("@/lib/orbit/emblem-server")
    .then((m) => m.emblemsAll())
    .then((next) => {
      map = next ?? {};
      loadedAt = Date.now();
      emit();
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function putEmblem(id: string, e: Emblem) {
  map = { ...map, [id]: e };
  emit();
}

function subscribe(f: () => void) {
  subs.add(f);
  void refreshEmblems();
  return () => subs.delete(f);
}

export function useEmblem(id: string): Emblem | undefined {
  return useSyncExternalStore(subscribe, () => map[id], () => undefined);
}
