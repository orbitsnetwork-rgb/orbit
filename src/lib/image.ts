export async function fitJpeg(file: Blob, maxEdge = 960, budget = 420_000) {
  const bitmap = await createImageBitmap(file);
  let edge = maxEdge;
  let quality = 0.72;
  try {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= budget) return url;
      quality -= 0.1;
      if (quality < 0.42) {
        quality = 0.62;
        edge = Math.round(edge * 0.72);
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error("photo");
}