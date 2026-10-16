import { createRootRoute, HeadContent, Outlet, Scripts, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { SceneProvider } from "@/lib/scene";
import appCss from "../styles.css?url";

// 14: старий «Восьма»-шелл — окремим чанком; Орбіти («/», «/l/…») його не завантажують.
const Shell = lazy(() => import("@/components/shell").then((m) => ({ default: m.Shell })));
const isOrbitPath = (path: string) => path === "/" || path.startsWith("/l/");

function ShellGate({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  if (isOrbitPath(path)) return <div className="min-h-dvh">{children}</div>;
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Орбіти" },
      { name: "description", content: "Вісім мільйонів рівних орбіт. Одна ціна. Внутрішня одиниця — іскра ✦. Запускаємо разом." },
      { name: "theme-color", content: "#05060a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Орбіти" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
    ],
  }),
  component: () => (
    <html lang="uk" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var h=document.head;if(h){for(var n=h.firstChild;n;){var x=n.nextSibling;if(n.nodeType===8||(n.nodeType===3&&!n.textContent.trim()))h.removeChild(n);n=x}}}catch(e){}",
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(sessionStorage.getItem('vosma-gap')==='1')document.documentElement.dataset.open='app'}catch(e){}",
          }}
        />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <SceneProvider>
            <ShellGate>
              <Outlet />
            </ShellGate>
          </SceneProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
