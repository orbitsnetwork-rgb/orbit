/**
 * Xsolla Pay Station (merchant of record). Лише серверний код. Ключі — тільки зі змінних середовища, ніколи в git.
 * Режим ТЕСТОВИЙ (sandbox) за замовчуванням; бойовий — лише явним ORBIT_SHOP_LIVE=1 (зараз не задано).
 * Дані картки бачить тільки Xsolla; до нас приходить підписаний вебхук «замовлення оплачене».
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { CheckoutProvider, Order } from "./checkout";

export type XsollaConf = { merchantId: string; projectId: string; apiKey: string; secret: string; sandbox: boolean };

export function xsollaConf(env: Record<string, string | undefined> = process.env): XsollaConf | null {
  const merchantId = env.XSOLLA_MERCHANT_ID?.trim() ?? "";
  const projectId = env.XSOLLA_PROJECT_ID?.trim() ?? "";
  const apiKey = env.XSOLLA_API_KEY?.trim() ?? "";
  const secret = env.XSOLLA_WEBHOOK_SECRET?.trim() ?? "";
  if (!/^\d+$/.test(merchantId) || !/^\d+$/.test(projectId) || !apiKey || !secret) return null;
  return { merchantId, projectId, apiKey, secret, sandbox: env.ORBIT_SHOP_LIVE?.trim() !== "1" };
}

/** Тіло запиту токена Pay Station. Сума фіксована сервером, клієнт її не задає. */
export function tokenBody(conf: XsollaConf, order: Order, returnUrl: string) {
  return {
    user: { id: { value: order.userId } },
    settings: { project_id: Number(conf.projectId), external_id: order.id, currency: "USD", language: "uk", return_url: returnUrl, ...(conf.sandbox ? { mode: "sandbox" } : {}) },
    purchase: { checkout: { amount: order.usdCents / 100, currency: "USD" }, description: { value: `ORBIT ${order.product}: ${order.spark + order.bonus} ✦` } },
    custom_parameters: { orbit_order: order.id, orbit_product: order.product },
  };
}

export function payUrl(token: string, sandbox: boolean) {
  return `https://${sandbox ? "sandbox-" : ""}secure.xsolla.com/paystation4/?token=${encodeURIComponent(token)}`;
}

/** Підпис вебхука Xsolla: Authorization: Signature sha1(rawBody + secret). */
export function xsollaSigned(raw: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const got = header.replace(/^Signature\s+/i, "").trim();
  const want = createHash("sha1").update(raw + secret).digest("hex");
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type XsollaEvent =
  | { kind: "user"; userId: string }
  | { kind: "paid"; orderId: string; userId: string; usdCents: number; currency: string; dryRun: boolean; txId: string }
  | { kind: "other" };

export function parseXsolla(body: unknown): XsollaEvent {
  const b = (body ?? {}) as Record<string, any>;
  const type = String(b.notification_type ?? "");
  if (type === "user_validation") return { kind: "user", userId: String(b.user?.id ?? "") };
  if (type === "payment" || type === "order_paid") {
    const t = b.transaction ?? {};
    const pay = b.purchase?.checkout ?? b.payment_details?.payment ?? {};
    return {
      kind: "paid",
      orderId: String(t.external_id ?? b.custom_parameters?.orbit_order ?? ""),
      userId: String(b.user?.id ?? ""),
      usdCents: Math.round(Number(pay.amount ?? 0) * 100),
      currency: String(pay.currency ?? ""),
      dryRun: Number(t.dry_run ?? 0) === 1,
      txId: String(t.id ?? ""),
    };
  }
  return { kind: "other" };
}

export function xsollaProvider(conf: XsollaConf, fetcher: typeof fetch = fetch): CheckoutProvider {
  return {
    id: "xsolla",
    async createSession(order, returnUrl) {
      const auth = Buffer.from(`${conf.merchantId}:${conf.apiKey}`).toString("base64");
      const res = await fetcher(`https://api.xsolla.com/merchant/v2/merchants/${conf.merchantId}/token`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
        body: JSON.stringify(tokenBody(conf, order, returnUrl)),
      });
      if (!res.ok) throw new Error(`xsolla token ${res.status}`);
      const out = (await res.json()) as { token?: string };
      if (!out.token) throw new Error("xsolla token missing");
      return { url: payUrl(out.token, conf.sandbox), providerRef: order.id };
    },
    async verifyWebhook(raw, headers) {
      if (!xsollaSigned(raw, headers.authorization ?? null, conf.secret)) return null;
      const ev = parseXsolla(JSON.parse(raw));
      return ev.kind === "paid" ? { providerRef: ev.orderId, paid: true } : null;
    },
  };
}
