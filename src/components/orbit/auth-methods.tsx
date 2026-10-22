/**
 * Інші способи входу: Google, телефон (SMS), код з пошти. Показуємо лише налаштовані на сервері —
 * ненастроєні просто не з’являються (без мертвих кнопок). Успіх = вхід з новим ключем (відновлення на новому пристрої).
 * Якщо акаунта ще немає — підставляємо підтверджену пошту/телефон у форму реєстрації.
 */
import { useEffect, useRef, useState } from "react";
import { authConfig, authRecover, smsErrorText, smsGate } from "@/lib/orbit/recover";
import { setPendingProof, useOrbits } from "@/lib/orbit/store";
import { turnstileToken } from "@/lib/orbit/turnstile-client";
import type { FirebaseWeb } from "@/lib/orbit/identity";

type Config = { google: string | null; firebase: FirebaseWeb | null; mail: boolean };
type Prefill = { email?: string; phone?: string };

declare global {
  interface Window {
    google?: { accounts: { id: { initialize: (o: Record<string, unknown>) => void; renderButton: (el: HTMLElement, o: Record<string, unknown>) => void } } };
  }
}

let configOnce: Promise<Config> | null = null;
function useAuthConfig() {
  const [cfg, setCfg] = useState<Config | null>(null);
  useEffect(() => {
    let alive = true;
    configOnce ??= authConfig().catch(() => {
      configOnce = null;
      return { google: null, firebase: null, mail: false };
    });
    void configOnce.then((c) => alive && setCfg(c));
    return () => {
      alive = false;
    };
  }, []);
  return cfg;
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script"));
    document.head.appendChild(s);
  });
}

export function AuthMethods({ onPrefill }: { onPrefill: (p: Prefill) => void }) {
  const cfg = useAuthConfig();
  const [mode, setMode] = useState<"none" | "phone" | "mail">("none");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  if (!cfg || (!cfg.google && !cfg.firebase && !cfg.mail)) return null;

  const finish = async (kind: "google" | "phone" | "mail", input: { token?: string; email?: string; code?: string }) => {
    setBusy(true);
    setMsg(null);
    try {
      const ts = kind === "mail" && input.code ? null : await turnstileToken();
      const r = await authRecover({ data: { kind, ...input, ts } });
      if (r.ok && "key" in r) {
        await useOrbits.getState().adoptRecovered(r.id, r.key);
        return true;
      }
      if (r.ok && "sent" in r) {
        setMsg({ text: "Якщо акаунт з цією поштою є — код уже в листі (перевір і «Спам»).", bad: false });
        return true;
      }
      if (!r.ok && r.notFound) {
        if (kind !== "mail" && input.token) setPendingProof({ kind, token: input.token });
        onPrefill(r.notFound);
        setMsg({ text: "Акаунта ще немає — заповни решту полів нижче, і він з’явиться.", bad: false });
        return false;
      }
      setMsg({ text: r.ok ? "" : r.error, bad: true });
      return false;
    } catch {
      setMsg({ text: "Немає зв’язку. Спробуй ще раз.", bad: true });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="orbit-block gt-methods" aria-label="Швидкий вхід">
      <p className="orbit-kicker">Швидкий вхід або відновлення</p>
      {cfg.google ? <GoogleButton clientId={cfg.google} onToken={(token) => void finish("google", { token })} /> : null}
      {cfg.firebase ? (
        mode === "phone" ? (
          <PhoneFlow cfg={cfg.firebase} busy={busy} onToken={(token) => finish("phone", { token })} onError={(text) => setMsg({ text, bad: true })} />
        ) : (
          <button type="button" className="orbit-quiet gt-method" onClick={() => setMode("phone")}>📱 Номер телефону (SMS)</button>
        )
      ) : null}
      {cfg.mail ? (
        mode === "mail" ? (
          <MailFlow busy={busy} onSend={(email) => finish("mail", { email })} onCode={(email, code) => finish("mail", { email, code })} />
        ) : (
          <button type="button" className="orbit-quiet gt-method" onClick={() => setMode("mail")}>✉️ Код на пошту</button>
        )
      ) : null}
      {msg?.text ? <p className={msg.bad ? "orbit-flash" : "orbit-ok"} role="status">{msg.text}</p> : null}
    </section>
  );
}

function GoogleButton({ clientId, onToken }: { clientId: string; onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadScript("https://accounts.google.com/gsi/client")
      .then(() => {
        if (!alive || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: (r: { credential?: string }) => r.credential && cb.current(r.credential), ux_mode: "popup", use_fedcm_for_prompt: true });
        window.google.accounts.id.renderButton(ref.current, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", locale: "uk", width: Math.min(360, ref.current.clientWidth || 320) });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [clientId]);
  if (failed) return <p className="orbit-note">Google зараз недоступний. Спробуй інший спосіб.</p>;
  return <div ref={ref} className="gt-google" style={{ minHeight: 44 }} />;
}

function MailFlow({ busy, onSend, onCode }: { busy: boolean; onSend: (email: string) => Promise<boolean>; onCode: (email: string, code: string) => Promise<boolean> }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const digits = code.replace(/\D/g, "").slice(0, 6);
  return (
    <div className="grid gap-2">
      <label className="grid gap-1.5">
        <span className="orbit-kicker">Пошта акаунта</span>
        <input className="orbit-field" type="email" autoComplete="email" inputMode="email" value={email} disabled={sent} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {sent ? (
        <>
          <label className="grid gap-1.5">
            <span className="orbit-kicker">6 цифр з листа</span>
            <input className="orbit-field" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={digits} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button type="button" className="orbit-go" disabled={busy || digits.length < 6} onClick={() => void onCode(email.trim().toLowerCase(), digits)}>{busy ? "Перевіряю…" : "Увійти"}</button>
          <button type="button" className="orbit-quiet" disabled={busy} onClick={() => { setSent(false); setCode(""); }}>Інша пошта / надіслати ще раз</button>
        </>
      ) : (
        <button type="button" className="orbit-go" disabled={busy || !ok} onClick={() => void onSend(email.trim().toLowerCase()).then((s) => s && setSent(true))}>{busy ? "Надсилаю…" : "Надіслати код"}</button>
      )}
    </div>
  );
}

function PhoneFlow({ cfg, busy, onToken, onError }: { cfg: FirebaseWeb; busy: boolean; onToken: (t: string) => Promise<boolean>; onError: (t: string) => void }) {
  const [phone, setPhone] = useState("+380");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [working, setWorking] = useState(false);
  const confirm = useRef<{ confirm: (c: string) => Promise<{ user: { getIdToken: () => Promise<string> } }> } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const e164 = "+" + phone.replace(/\D/g, "");
  const okPhone = /^\+\d{10,15}$/.test(e164);
  const digits = code.replace(/\D/g, "").slice(0, 6);
  const send = async () => {
    if (working) return;
    setWorking(true);
    try {
      const gate = await smsGate({ data: { phone: e164, ts: await turnstileToken() } });
      if (!gate.ok) {
        onError(gate.error);
        return;
      }
      const { initializeApp, getApps } = await import("firebase/app");
      const { getAuth, RecaptchaVerifier, signInWithPhoneNumber } = await import("firebase/auth");
      const app = getApps()[0] ?? initializeApp(cfg);
      const auth = getAuth(app);
      auth.languageCode = "uk";
      const verifier = new RecaptchaVerifier(auth, box.current!, { size: "invisible" });
      confirm.current = await signInWithPhoneNumber(auth, e164, verifier);
      setStep("code");
    } catch (e) {
      onError(smsErrorText(String((e as { code?: string })?.code ?? "")));
    } finally {
      setWorking(false);
    }
  };
  const check = async () => {
    setWorking(true);
    try {
      const cred = await confirm.current!.confirm(digits);
      await onToken(await cred.user.getIdToken());
    } catch (e) {
      onError(smsErrorText(String((e as { code?: string })?.code ?? "auth/invalid-verification-code")));
    } finally {
      setWorking(false);
    }
  };
  const wait = busy || working;
  return (
    <div className="grid gap-2">
      <div ref={box} />
      {step === "phone" ? (
        <>
          <label className="grid gap-1.5">
            <span className="orbit-kicker">Номер телефону</span>
            <input className="orbit-field" type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <button type="button" className="orbit-go" disabled={wait || !okPhone} onClick={() => void send()}>{wait ? "Надсилаю…" : "Надіслати SMS"}</button>
        </>
      ) : (
        <>
          <label className="grid gap-1.5">
            <span className="orbit-kicker">Код з SMS на {e164}</span>
            <input className="orbit-field" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={digits} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button type="button" className="orbit-go" disabled={wait || digits.length < 6} onClick={() => void check()}>{wait ? "Перевіряю…" : "Підтвердити"}</button>
          <button type="button" className="orbit-quiet" disabled={wait} onClick={() => { setStep("phone"); setCode(""); }}>Інший номер</button>
        </>
      )}
    </div>
  );
}
