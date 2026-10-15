import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function keepShot(id: string, photo: string) {
  if (photo.startsWith("/") && photo.length < 180 && !photo.includes("..")) return photo;
  const comma = photo.indexOf(",");
  const head = comma > 0 ? photo.slice(0, comma) : "";
  const kind = /^data:image\/(jpeg|jpg|png|webp);base64$/i.exec(head);
  if (!kind) return "";
  const safe = id.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 16);
  if (!/^[0-9]{6}(-c)?$/.test(safe)) return "";
  const ext = kind[1].toLowerCase() === "png" ? "png" : kind[1].toLowerCase() === "webp" ? "webp" : "jpg";
  const name = `${safe}.${ext}`;
  const dir = join(process.cwd(), "public", "shots");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), Buffer.from(photo.slice(comma + 1).replace(/\s/g, ""), "base64"));
  return `/shots/${name}`;
}
