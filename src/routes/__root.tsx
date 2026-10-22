import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { NotFound } from "@/components/orbit/not-found";
import appCss from "../styles.css?url";
// Шрифт — змінний Manrope (один файл на абетку). Preload, щоб текст не чекав, поки розбереться CSS.
import fontCyr from "@fontsource-variable/manrope/files/manrope-cyrillic-wght-normal.woff2?url";
import fontLat from "@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Орбіти" },
      { name: "description", content: "Вісім мільйонів рівних орбіт. Одна ціна. Внутрішня одиниця — іскра ✦. Запускаємо разом." },
      { name: "theme-color", content: "#05060f" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "ORBIT" }, { name: "application-name", content: "ORBIT" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "alternate icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { rel: "preload", as: "font", type: "font/woff2", href: fontCyr, crossOrigin: "anonymous" },
      { rel: "preload", as: "font", type: "font/woff2", href: fontLat, crossOrigin: "anonymous" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
    ],
  }),
  notFoundComponent: NotFound,
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
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <div className="min-h-dvh">
            <Outlet />
          </div>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
