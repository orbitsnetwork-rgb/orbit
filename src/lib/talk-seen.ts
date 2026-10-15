const KEY = "vosma-talk-seen";

function map() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function talkSeen(id: string) {
  return map()[id] ?? "";
}

export function markTalk(id: string, at: string) {
  if (!id || !at) return;
  const next = map();
  if ((next[id] ?? "") >= at) return;
  next[id] = at;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("vosma-talk"));
  } catch {
    /* сховище може бути закрите */
  }
}

export function talkFresh(id: string, at: string) {
  if (!at) return false;
  return at > talkSeen(id);
}