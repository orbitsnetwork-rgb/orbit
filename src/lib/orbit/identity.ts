/**
 * Підтверджена особа від зовнішнього входу (без адмін-SDK, працює на Workers):
 *  - Google: ID-токен Google Identity Services, підпис за JWKS Google, aud = GOOGLE_CLIENT_ID;
 *  - Телефон: ID-токен Firebase Auth (вхід за SMS), JWKS securetoken, aud = FIREBASE_PROJECT_ID.
 * Кожен шлях активний лише з відповідними змінними середовища.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type Proof = { kind: "google"; email: string } | { kind: "phone"; phone: string };

let googleKeys: JWTVerifyGetKey | null = null;
let firebaseKeys: JWTVerifyGetKey | null = null;

export function googleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID?.trim() || null;
}
export type FirebaseWeb = { apiKey: string; authDomain: string; projectId: string; appId: string };
export function firebaseConfig(): FirebaseWeb | null {
  const apiKey = process.env.FIREBASE_API_KEY?.trim();
  const authDomain = process.env.FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const appId = process.env.FIREBASE_APP_ID?.trim();
  return apiKey && authDomain && projectId && appId ? { apiKey, authDomain, projectId, appId } : null;
}

export async function verifyProof(
  kind: unknown,
  token: unknown,
  keys?: { google?: JWTVerifyGetKey; firebase?: JWTVerifyGetKey },
): Promise<Proof | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) return null;
  try {
    if (kind === "google") {
      const aud = googleClientId();
      if (!aud) return null;
      const jwks = keys?.google ?? (googleKeys ??= createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs")));
      const { payload } = await jwtVerify(token, jwks, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience: aud });
      const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
      if (!email || payload.email_verified !== true) return null;
      return { kind: "google", email };
    }
    if (kind === "phone") {
      const project = firebaseConfig()?.projectId;
      if (!project) return null;
      const jwks = keys?.firebase ?? (firebaseKeys ??= createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")));
      const { payload } = await jwtVerify(token, jwks, { issuer: `https://securetoken.google.com/${project}`, audience: project });
      const phone = typeof payload.phone_number === "string" ? payload.phone_number : "";
      if (!/^\+\d{8,15}$/.test(phone)) return null;
      return { kind: "phone", phone };
    }
  } catch {
    return null;
  }
  return null;
}

/** Телефон у будь-якому записі → лише цифри (для порівняння з підтвердженим +E.164). */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}
