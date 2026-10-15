const DB_NAME = "vosma-vault";
const STORE = "secret";

type Packed = { iv: number[]; cipher: number[] };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

function idbSet(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function wrappingKey(db: IDBDatabase) {
  const existing = await idbGet<CryptoKey>(db, "wrap");
  if (existing) return existing;
  const created = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await idbSet(db, "wrap", created);
  return created;
}

export async function saveVault(key: string, recovery: string) {
  if (typeof indexedDB === "undefined" || !crypto.subtle) return;
  const db = await openDb();
  if (!key && !recovery) {
    await idbSet(db, "cred", null);
    return;
  }
  const wrap = await wrappingKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrap, new TextEncoder().encode(JSON.stringify({ key, recovery })));
  const packed: Packed = { iv: Array.from(iv), cipher: Array.from(new Uint8Array(cipher)) };
  await idbSet(db, "cred", packed);
}

export async function readVault(): Promise<{ key: string; recovery: string } | null> {
  if (typeof indexedDB === "undefined" || !crypto.subtle) return null;
  const db = await openDb();
  const packed = await idbGet<Packed>(db, "cred");
  const wrap = await idbGet<CryptoKey>(db, "wrap");
  if (!packed?.cipher || !wrap) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(packed.iv) }, wrap, new Uint8Array(packed.cipher));
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as { key?: string; recovery?: string };
    if (!parsed.key) return null;
    return { key: parsed.key, recovery: parsed.recovery ?? "" };
  } catch {
    return null;
  }
}
