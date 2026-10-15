import { useState } from "react";
import { fitJpeg } from "@/lib/image";
import { putBlob } from "@/lib/media-db";
import type { ProofFile } from "@/lib/model";

function uid() {
  return `m-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function MediaUploader({ files, onChange }: { files: ProofFile[]; onChange: (files: ProofFile[]) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function take(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Потрібне фото стіни. Відео і посилання стіну не ставлять.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Фото завелике. Зніми ще раз.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const preview = await fitJpeg(file);
      const id = uid();
      const blob = await (await fetch(preview)).blob();
      await putBlob(id, blob);
      onChange([{ id, kind: "image", name: file.name, caption: "", at: new Date().toISOString(), preview }]);
    } catch {
      setError("Телефон не стиснув це фото. Зніми ще раз камерою.");
    } finally {
      setBusy(false);
    }
  }

  const shot = files.find((file) => file.kind === "image");
  return (
    <div className="grid gap-2">
      <label className="grid cursor-pointer gap-2">
        {shot ? (
          <img src={shot.preview} alt="Фото стіни" className="h-44 w-full rounded-control object-cover" />
        ) : (
          <span className="grid h-28 place-items-center rounded-control border border-line px-4 text-center text-sm">
            {busy ? "Стискаю фото…" : "Зняти стіну камерою"}
          </span>
        )}
        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/*" capture="environment" onChange={(event) => void take(event.target.files)} />
      </label>
      {shot ? <p className="text-meta text-muted">Натисни на фото, щоб зняти ще раз.</p> : null}
      {error ? <p className="text-sm text-muted">{error}</p> : null}
    </div>
  );
}
