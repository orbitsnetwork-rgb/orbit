/** «Слово поручителя»: кілька слів від того, хто за тебе поручився. Одне на пару, назавжди. */
import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Quote } from "lucide-react";
import { Avatar } from "@/components/orbit/ui/kit";
import { shortName } from "@/lib/orbit/live-rules";
import { sessionCreds } from "@/lib/orbit/store";
import { WORD_MAX, WORD_MIN } from "@/lib/orbit/vouch-word";
import type { WordOut } from "@/lib/orbit/vouch-word-server";
import type { World } from "@/lib/orbit/engine";

export function useWords(who: string | null) {
  const [state, setState] = useState<{ got: WordOut[]; given: string[]; ready: boolean }>({ got: [], given: [], ready: false });
  const load = useCallback(async () => {
    if (!who) return;
    try {
      const { wordsFor } = await import("@/lib/orbit/vouch-word-server");
      const out = await wordsFor({ data: { ...sessionCreds(), who } });
      setState({ ...out, ready: true });
    } catch {
      setState((s) => ({ ...s, ready: true }));
    }
  }, [who]);
  useEffect(() => {
    setState({ got: [], given: [], ready: false });
    void load();
  }, [load]);
  return { ...state, reload: load };
}

const nameOf = (world: World, id: string) => shortName(world.accounts.find((a) => a.id === id)?.name ?? "Учасник");

function WordItem({ world, w, onToggle }: { world: World; w: WordOut; onToggle?: () => void }) {
  return (
    <li className="vw-item" data-hidden={w.hidden ? "1" : undefined}>
      <Avatar id={w.from} name={nameOf(world, w.from)} size={30} />
      <div>
        <p className="vw-text">«{w.text}»</p>
        <p className="vw-from">{nameOf(world, w.from)} · {new Date(w.at).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}</p>
      </div>
      {onToggle ? (
        <button type="button" className="em-x" onClick={onToggle} aria-label={w.hidden ? "Показати всім" : "Сховати з профілю"} title={w.hidden ? "Показати всім" : "Сховати з профілю"}>
          {w.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      ) : null}
    </li>
  );
}

export function WordsReceived({ world, words }: { world: World; words: ReturnType<typeof useWords> }) {
  if (!words.got.length) return null;
  const toggle = async (w: WordOut) => {
    const { wordHide } = await import("@/lib/orbit/vouch-word-server");
    await wordHide({ data: { ...sessionCreds(), from: w.from, hidden: !w.hidden } });
    await words.reload();
  };
  return (
    <section className="orbit-block vw" aria-labelledby="vw-title">
      <p className="orbit-kicker" id="vw-title"><Quote size={14} aria-hidden /> Слова поручителів</p>
      <p className="orbit-note">Їх бачать ті, хто шукає шлях довіри до тебе. Сховані бачиш лише ти.</p>
      <ul className="vw-list">{words.got.map((w) => <WordItem key={w.from} world={world} w={w} onToggle={() => void toggle(w)} />)}</ul>
    </section>
  );
}

export function WordsOf({ world, who }: { world: World; who: string }) {
  const words = useWords(who);
  if (!words.ready) return <p className="orbit-note" role="status">Шукаємо слова поручителів…</p>;
  if (!words.got.length) return <p className="orbit-note">Поручителі ще нічого не написали про цю людину.</p>;
  return (
    <div className="vw-of">
      <p className="orbit-kicker"><Quote size={14} aria-hidden /> Що кажуть поручителі</p>
      <ul className="vw-list">{words.got.map((w) => <WordItem key={w.from} world={world} w={w} />)}</ul>
    </div>
  );
}

export function WordComposer({ to, name, onDone }: { to: string; name: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const len = Array.from(text.trim()).length;
  if (!open) return <button type="button" className="vw-open" onClick={() => setOpen(true)}>Лишити слово</button>;
  const send = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const { wordSay } = await import("@/lib/orbit/vouch-word-server");
      const out = await wordSay({ data: { ...sessionCreds(), to, text } });
      if (out.ok) { setOpen(false); onDone(); } else setErr(out.error);
    } catch {
      setErr("Немає зв'язку. Спробуй ще раз.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="vw-compose">
      <label>
        <span className="visually-hidden">Слово для {name}</span>
        <textarea className="orbit-field" rows={2} maxLength={WORD_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Чому ти поручився за ${name}?`} autoFocus />
      </label>
      <div className="vw-row">
        <span className="vw-count" aria-live="polite">{len}/{WORD_MAX} · назавжди, без редагування</span>
        <button type="button" className="k-ghost" onClick={() => setOpen(false)}>Скасувати</button>
        <button type="button" className="orbit-go vw-send" disabled={busy || len < WORD_MIN} onClick={() => void send()}>{busy ? "…" : "Залишити"}</button>
      </div>
      {err ? <p className="em-err" role="alert">{err}</p> : null}
    </div>
  );
}
