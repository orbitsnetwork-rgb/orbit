import { ModeratorPage } from "@/components/orbit/moderator";
import { SeekPage } from "@/components/orbit/seek";
import { Assets } from "@/components/orbit/assets";
import { Explorer } from "@/components/orbit/explorer";
import { Fees } from "@/components/orbit/fees";
import { Help } from "@/components/orbit/help";
import { History } from "@/components/orbit/history";
import { Leaders } from "@/components/orbit/leaders";
import { ConstellationPage } from "@/components/orbit/constellation";
import { Learn } from "@/components/orbit/learn";
import { Security } from "@/components/orbit/security";
import { Status } from "@/components/orbit/status";
import { Inbox } from "@/components/orbit/inbox";
import { Transparency } from "@/components/orbit/transparency";
import { LiveHub, openRoomNext, startDm } from "@/components/orbit/live";
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
  if (top === "more") return <MoreHub onOpen={onPush} onBack={onPop} signedIn={Boolean(user)} unread={unread} profile={user && world ? { id: user.id, name: user.name, line: `Стабільність ${user.stability} · орбіт ${world.orbits.filter((orbit) => orbit.ownerId === user.id).length}` } : undefined} />;
  if (top === "constellation" && world && user) return <ConstellationPage world={world} user={user} onBack={onPop} onClose={closer} />;
  if (top === "leaders" && world && user) return <Leaders world={world} user={user} onBack={onPop} onClose={closer} />;
  if (top === "status" && world) return <Status world={world} onBack={onPop} onClose={closer} />;
  if (top === "transparency") return <Transparency onBack={onPop} onClose={closer} />;
  if (top === "live" && world && user) return <LiveHub world={world} user={user} onBack={onPop} onClose={closer} />;
  if (top === "seek" && world && user) return <SeekPage onBack={onPop} onClose={closer} onRoom={() => onReplace("live")} world={world} user={user} />;
  if (top === "moderator" && world && user) return <ModeratorPage onBack={onPop} onClose={closer} />;
  if (top === "learn") return <Learn onBack={onPop} onClose={closer} />;
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
        onDm={(uid) => { void startDm(uid).then((out) => { if (typeof out !== "string") onReplace("live"); }); }}
        onGo={(tab) => {
          onClose();
          onTab?.(tab);
        }}
      />
    );
  }
  if (top === "security" && world && user) return <Security world={world} user={user} onBack={onPop} onClose={closer} />;
  if (top === "fees" && world && user) return <Fees world={world} user={user} onBack={onPop} onClose={closer} />;
  if (top === "inbox" && world && user) return <Inbox world={world} user={user} onBack={onPop} onClose={closer} onRoom={(room) => { openRoomNext(room); onReplace("live"); }} />;
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
