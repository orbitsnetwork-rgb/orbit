/** Заглушки, поки світ вантажиться: та сама сітка, що й справжній екран, щоб нічого не стрибало. */
import { Skeleton } from "@/components/orbit/ui/kit";

function Card({ children, tall = false }: { children: React.ReactNode; tall?: boolean }) {
  return <div className="orbit-block sk-card" data-tall={tall ? "1" : "0"}>{children}</div>;
}

/** Головна: гаманець, ціна, банер, ринок. */
export function HomeSkeleton() {
  return (
    <div className="orbit-stack" aria-hidden>
      <Card>
        <Skeleton h={14} w={90} />
        <Skeleton h={40} w={150} r={12} />
        <Skeleton h={12} w={210} />
        <div className="sk-actions">
          {[0, 1, 2, 3].map((i) => (
            <span key={i}><Skeleton h={52} w={52} r={18} /><Skeleton h={10} w={48} /></span>
          ))}
        </div>
      </Card>
      <Card tall>
        <div className="sk-center"><Skeleton h={12} w={120} /><Skeleton h={64} w={150} r={16} /><Skeleton h={12} w={140} /></div>
        <div className="sk-row4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={34} r={10} />)}</div>
        <Skeleton h={52} r={16} />
      </Card>
      <Skeleton h={138} r={20} />
      <Card>
        {[0, 1, 2].map((i) => (
          <div key={i} className="sk-line"><Skeleton h={36} w={36} r={12} /><span><Skeleton h={12} w="60%" /><Skeleton h={10} w="40%" /></span><Skeleton h={22} w={64} r={8} /></div>
        ))}
      </Card>
    </div>
  );
}

/** Весь застосунок під час першого завантаження: шапка, вміст і навігація. */
export function AppSkeleton() {
  return (
    <div className="orbit-shell sk-app" role="status" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">Завантажуємо Орбіти…</span>
      <header className="orbit-top" aria-hidden>
        <div className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" width={32} height={32} />
          <span className="sk-col"><Skeleton h={10} w={54} /><Skeleton h={14} w={80} /></span>
        </div>
        <div className="mo-top-right"><Skeleton h={18} w={56} /><Skeleton h={40} w={40} r={12} /><Skeleton h={40} w={40} r={12} /></div>
      </header>
      <HomeSkeleton />
      <div className="orbit-nav sk-nav" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => <span key={i}><Skeleton h={20} w={20} r={6} /><Skeleton h={8} w={30} /></span>)}
      </div>
    </div>
  );
}
