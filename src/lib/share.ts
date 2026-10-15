const fresh = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function share<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  if (typeof window === "undefined") return load();
  const hit = fresh.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value as T);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const job = load()
    .then((value) => {
      fresh.set(key, { at: Date.now(), value });
      inflight.delete(key);
      return value;
    })
    .catch((error: unknown) => {
      inflight.delete(key);
      throw error;
    });
  inflight.set(key, job);
  return job;
}

export function dropShare(prefix: string) {
  for (const key of fresh.keys()) {
    if (key.startsWith(prefix)) fresh.delete(key);
  }
}
