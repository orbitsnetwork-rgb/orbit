import { Assets } from "@/components/orbit/assets";
import { Explorer } from "@/components/orbit/explorer";
import { Fees } from "@/components/orbit/fees";
import { Help } from "@/components/orbit/help";
import { History } from "@/components/orbit/history";
import { Leaders } from "@/components/orbit/leaders";
import { Security } from "@/components/orbit/security";
import { Status } from "@/components/orbit/status";
import { Inbox } from "@/components/orbit/inbox";
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
  unread,
}: {
  stack: Route[];
  onPush: (route: Route) => void;
  onPop: () => void;
  onReplace: (route: Route) => void;
  onClose: () => void;
  world?: World;
  user?: Account | null;
  onTab?: (tab: Tab) => void;
  unread?: number;
}) {
  const top = stack[stack.length - 1];
  if (!top) return null;
  const closer = stack.length > 1 ? onClose : undefined;
  if (top === "more") return <MoreHub onOpen={onPush} onBack={onPop} signedIn={Boolean(user)} unread={unread} />;
  if (top === "leaders" && world && user) return <Leaders world={world} user={user} onBack={onPop} onClose={closer} />;
  if (top === "status" && world) return <Status world={world} onBack={onPop} onClose={closer} />;
  if (top === "help") return <Help onBack={onPop} onClose={closer} onOpen={onPush} signedIn={Boolean(world && user)} />;
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
  if (top === "explorer" && world && user) {
    return (
      <Explorer
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
  if (top === "security" && world && user) return <Security world={world} user={user} onBack={onPop} onClose={closer} />;
  if (top === "fees" && world && user) return <Fees world={world} user={user} onBack={onPop} onClose={closer} />;
  if (top === "inbox" && world && user) return <Inbox world={world} user={user} onBack={onPop} onClose={closer} />;
  if (top === "assets" && world && user) {
    return (
      <Assets
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
