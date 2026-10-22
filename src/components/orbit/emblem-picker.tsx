/** Емблема профілю: аватар-кнопка + аркуш вибору кольору й знака. Закриті знаки показані з умовою відкриття. */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Lock, X } from "lucide-react";
import { Avatar } from "@/components/orbit/ui/kit";
import { GLYPHS, HUES, unlockedGlyphs, type Emblem, type GlyphId } from "@/lib/orbit/emblem";
import { putEmblem, useEmblem } from "@/lib/orbit/emblem-store";
import { sessionCreds } from "@/lib/orbit/store";
import { buzz } from "@/lib/orbit/feel";
import type { Account, World } from "@/lib/orbit/engine";

export function EmblemFace({ world, user }: { world: World; user: Account }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="em-face" onClick={() => setOpen(true)} aria-label="Змінити емблему">
        <Avatar id={user.id} name={user.name} size={64} />
        <span className="em-face-edit" aria-hidden>✎</span>
      </button>
      {open ? <EmblemSheet world={world} user={user} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function EmblemSheet({ world, user, onClose }: { world: World; user: Account; onClose: () => void }) {
  const current = useEmblem(user.id);
  const [hue, setHue] = useState<number>(current?.hue ?? HUES[0]);
  const [glyph, setGlyph] = useState<GlyphId>(current?.glyph ?? "letter");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const open = useMemo(() => unlockedGlyphs(world, user.id), [world, user.id]);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const same = current?.hue === hue && current?.glyph === glyph;
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const { emblemSet } = await import("@/lib/orbit/emblem-server");
      const emblem: Emblem = { hue, glyph };
      const out = await emblemSet({ data: { ...sessionCreds(), emblem } });
      if (out.ok) {
        putEmblem(user.id, out.emblem);
        buzz(18);
        onClose();
      } else setErr(out.error);
    } catch {
      setErr("Немає зв'язку. Спробуй ще раз.");
    } finally {
      setBusy(false);
    }
  };
  const preview = glyph === "letter" ? user.name.slice(0, 1).toUpperCase() : GLYPHS.find((g) => g.id === glyph)?.ch;
  // Портал у body: position:fixed не залежить від transform/stacking-контексту картки профілю.
  return createPortal(
    <div className="em-scrim" onClick={onClose} data-testid="em-scrim">
      <div className="em-sheet" role="dialog" aria-modal="true" aria-labelledby="em-title" tabIndex={-1} ref={dialog} onClick={(e) => e.stopPropagation()}>
        <div className="em-grab" aria-hidden />
        <div className="em-head">
          <h2 id="em-title">Твоя емблема</h2>
          <button type="button" className="em-x" onClick={onClose} aria-label="Закрити"><X size={18} /></button>
        </div>
        <p className="orbit-note">Її бачать усі: у рейтингу, в сузір'ї, біля твого імені. Деякі знаки відкриваються діями.</p>
        <div className="em-preview" style={{ ["--h" as string]: hue }} aria-hidden>
          <span className="em-preview-ring" />
          <span className="em-preview-core">{preview}</span>
        </div>
        <fieldset className="em-hues">
          <legend>Колір</legend>
          {HUES.map((h) => (
            <button key={h} type="button" className="em-hue" data-testid={`em-hue-${h}`} style={{ ["--h" as string]: h }} aria-pressed={h === hue} aria-label={`Відтінок ${h}`} onClick={() => setHue(h)}>
              {h === hue ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
            </button>
          ))}
        </fieldset>
        <fieldset className="em-glyphs">
          <legend>Знак</legend>
          {GLYPHS.map((g) => {
            const locked = !open.has(g.id);
            return (
              <button key={g.id} type="button" className="em-glyph" data-testid={`em-glyph-${g.id}`} data-locked={locked ? "1" : undefined} aria-pressed={g.id === glyph} disabled={locked} onClick={() => setGlyph(g.id)} title={locked ? g.need : g.title}>
                <span className="em-glyph-ch" style={{ ["--h" as string]: hue }}>{g.ch || user.name.slice(0, 1).toUpperCase()}</span>
                <span className="em-glyph-t">{g.title}</span>
                {locked ? <span className="em-glyph-need"><Lock size={10} aria-hidden /> {g.need}</span> : null}
              </button>
            );
          })}
        </fieldset>
        {err ? <p className="em-err" role="alert">{err}</p> : null}
        <button type="button" className="orbit-go em-save" data-testid="em-save" onClick={() => void save()} disabled={busy || same}>
          {busy ? "Зберігаємо…" : same ? "Це твоя емблема" : "Зберегти емблему"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
