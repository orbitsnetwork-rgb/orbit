import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { getBlob } from "@/lib/media-db";
import type { Eight } from "@/lib/model";

const PROOF = {
  wall: "/canon/passport.jpg",
  coin: "/canon/paint.jpg",
  city: "/canon/street.jpg",
} as const;

const GALLERY = ["/canon/chalk.jpg", "/canon/confirm.jpg", "/canon/passport.jpg", "/canon/arrive.jpg", "/canon/cash.jpg"];

function galleryFor(id: string) {
  let n = 0;
  for (const char of id) n += char.charCodeAt(0);
  return GALLERY[n % GALLERY.length];
}

export function photoSrc(entry: Eight) {
  const shot = entry.media?.find((file) => (file.kind === "image" || file.kind === "video") && file.preview);
  if (shot?.preview) return shot.preview;
  if (entry.shot) return entry.shot;
  if (entry.proofMedia && entry.proofMedia in PROOF) return PROOF[entry.proofMedia];
  if (!entry.anchor) return galleryFor(entry.id);
  return "";
}

export function EightPhoto({ entry, className }: { entry: Eight; className?: string }) {
  const immediate = photoSrc(entry);
  const fileId = entry.media?.find((file) => file.kind === "image" || file.kind === "video")?.id ?? "";
  const [blobUrl, setBlobUrl] = useState("");

  useEffect(() => {
    if (immediate || !fileId) return;
    let dead = false;
    let url = "";
    void getBlob(fileId).then((blob) => {
      if (!blob || dead || !blob.type.startsWith("image/")) return;
      url = URL.createObjectURL(blob);
      setBlobUrl(url);
    });
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [immediate, fileId]);

  const src = immediate || blobUrl;
  if (!src) {
    return <div className={cn("grid aspect-[5/3] place-items-center bg-bg text-muted", className)}>8</div>;
  }
  return <img src={src} alt="" className={cn("aspect-[5/3] w-full object-cover", className)} />;
}
