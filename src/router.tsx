import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

/** Per-request CSP nonce set by server/middleware/security-headers.ts (undefined in the browser). */
function requestNonce(): string | undefined {
  const store = (globalThis as { __orbitNonce__?: { getStore(): { nonce: string } | undefined } }).__orbitNonce__;
  return typeof window === "undefined" ? store?.getStore()?.nonce : undefined;
}

export function getRouter() {
  const nonce = requestNonce();
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultPreload: "intent",
    defaultPreloadDelay: 0,
    ...(nonce ? { ssr: { nonce } } : {}),
  });
}
