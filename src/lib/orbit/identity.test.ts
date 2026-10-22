import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } from "jose";
import { verifyProof, phoneDigits } from "./identity";
import { sendMail, mailReady, codeMail } from "./mail";

async function kit() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const set = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown>, iss: string, aud: string) =>
    new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime("5m").sign(privateKey);
  return { set, sign };
}

test("google proof: verified email accepted; wrong aud / unverified / no env rejected", async () => {
  const { set, sign } = await kit();
  process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com";
  try {
    const ok = await sign({ email: "A@x.com", email_verified: true }, "https://accounts.google.com", "cid.apps.googleusercontent.com");
    assert.deepEqual(await verifyProof("google", ok, { google: set }), { kind: "google", email: "a@x.com" });
    const aud = await sign({ email: "a@x.com", email_verified: true }, "https://accounts.google.com", "other");
    assert.equal(await verifyProof("google", aud, { google: set }), null);
    const unv = await sign({ email: "a@x.com", email_verified: false }, "https://accounts.google.com", "cid.apps.googleusercontent.com");
    assert.equal(await verifyProof("google", unv, { google: set }), null);
    assert.equal(await verifyProof("google", "garbage-token-garbage-token", { google: set }), null);
  } finally {
    delete process.env.GOOGLE_CLIENT_ID;
  }
  const { sign: s2, set: k2 } = await kit();
  const t = await s2({ email: "a@x.com", email_verified: true }, "https://accounts.google.com", "cid");
  assert.equal(await verifyProof("google", t, { google: k2 }), null, "no GOOGLE_CLIENT_ID → disabled");
});

test("firebase phone proof: issuer/audience = project", async () => {
  const { set, sign } = await kit();
  Object.assign(process.env, { FIREBASE_API_KEY: "k", FIREBASE_AUTH_DOMAIN: "p.firebaseapp.com", FIREBASE_PROJECT_ID: "p", FIREBASE_APP_ID: "a" });
  try {
    const ok = await sign({ phone_number: "+380501112233" }, "https://securetoken.google.com/p", "p");
    assert.deepEqual(await verifyProof("phone", ok, { firebase: set }), { kind: "phone", phone: "+380501112233" });
    const bad = await sign({ phone_number: "+380501112233" }, "https://securetoken.google.com/q", "q");
    assert.equal(await verifyProof("phone", bad, { firebase: set }), null);
  } finally {
    for (const k of ["FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN", "FIREBASE_PROJECT_ID", "FIREBASE_APP_ID"]) delete process.env[k];
  }
  assert.equal(phoneDigits("+38 (050) 111-22-33"), "380501112233");
});

test("mail: off without env; Resend call shape when on", async () => {
  assert.equal(mailReady(), false);
  assert.equal(await sendMail("a@x.com", "s", "t"), false);
  process.env.RESEND_API_KEY = "re_test";
  process.env.MAIL_FROM = "Орбіти <code@example.com>";
  try {
    let seen: { url: string; body: { to: string[]; from: string } } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(String(init.body)) };
      return { ok: true } as Response;
    }) as unknown as typeof fetch;
    assert.equal(mailReady(), true);
    assert.equal(await sendMail("a@x.com", "s", "t", f), true);
    assert.equal(seen!.url, "https://api.resend.com/emails");
    assert.deepEqual(seen!.body.to, ["a@x.com"]);
    assert.equal(await sendMail("not-an-email", "s", "t", f), false);
    assert.match(codeMail("123456", "confirm").subject, /123456/);
  } finally {
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_FROM;
  }
});
