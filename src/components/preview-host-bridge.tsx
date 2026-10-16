/**
 * Mount once in `__root.tsx` so the Grok preview chrome can drive navigation
 * (and later receive registered routes). Noops when the app is not embedded.
 *
 * 14: the bridge (and zod) is loaded as a separate chunk after hydration and
 * only when the page is framed — top-level visits never download it.
 */

import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

export function PreviewHostBridge() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    let off: (() => void) | undefined;
    let stop = false;
    void import("@/lib/preview-host-bridge").then(({ collectRoutePathsFromTree, installPreviewHostBridge }) => {
      if (stop) return;
      off = installPreviewHostBridge({
        navigate: (path) => {
          router.history.push(path);
        },
        getRoutePaths: () => collectRoutePathsFromTree(router.routeTree),
      });
    });
    return () => {
      stop = true;
      off?.();
    };
  }, [router]);

  return null;
}
