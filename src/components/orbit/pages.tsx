import { History } from "@/components/orbit/history";
import { DocList, DocView, isDoc, MoreHub, type Route } from "@/components/orbit/more";
import type { DocId } from "@/lib/orbit/docs";
import type { Account, World } from "@/lib/orbit/engine";

export type Tab = "home" | "market" | "mine" | "flow" | "me";

/** Рендер верхньої сторінки стеку «Ще». */
export function Pages({
  stack,
  onPush,
  onPop,
  onReplace,
  onClose,
  world,
  user,
  onTab,
}: {
  stack: Route[];
  onPush: (route: Route) => void;
  onPop: () => void;
  onReplace: (route: Route) => void;
  onClose: () => void;
  world?: World;
  user?: Account | null;
  onTab?: (tab: Tab) => void;
}) {
  const top = stack[stack.length - 1];
  if (!top) return null;
  const closer = stack.length > 1 ? onClose : undefined;
  if (top === "more") return <MoreHub onOpen={onPush} onBack={onPop} signedIn={Boolean(user)} />;
  if (top === "docs") return <DocList onOpen={(id) => onPush(`doc:${id}`)} onBack={onPop} onClose={closer} />;
  if (top === "history" && world && user) {
    return (
      <History
        world={world}
        user={user}
        onBack={onPop}
        onClose={closer}
        onGo={(tab) => {
          onClose();
          onTab?.(tab);
        }}
      />
    );
  }
  if (isDoc(top)) {
    const id = top.slice(4) as DocId;
    return <DocView key={id} id={id} onBack={onPop} onClose={closer} onOpen={(next) => onReplace(`doc:${next}`)} />;
  }
  return null;
}
