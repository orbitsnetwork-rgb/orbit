export function deviceId() {
  const key = "vosma-device";
  try {
    const have = localStorage.getItem(key);
    if (have && /^[a-z0-9]{16,32}$/.test(have)) return have;
    const next = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    localStorage.setItem(key, next);
    return next;
  } catch {
    return "browser-without-store";
  }
}
