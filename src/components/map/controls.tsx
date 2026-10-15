import { LocateFixed, Minus, Plus, RotateCcw } from "lucide-react";
import type { RefObject } from "react";
import type { MapApi } from "@/components/map/scene";

export function MapControls({
  api,
  onLocate,
}: {
  api: RefObject<MapApi | null>;
  onLocate: () => void;
}) {
  return (
    <div className="absolute top-40 right-3 z-floating flex flex-col gap-2 lg:top-24">
      <Ctl label="Наблизити" onClick={() => api.current?.zoomIn()}><Plus size={18} strokeWidth={1.5} /></Ctl>
      <Ctl label="Віддалити" onClick={() => api.current?.zoomOut()}><Minus size={18} strokeWidth={1.5} /></Ctl>
      <Ctl label="Уся Земля" onClick={() => api.current?.home()}><RotateCcw size={16} strokeWidth={1.5} /></Ctl>
      <Ctl label="Поруч" onClick={onLocate}><LocateFixed size={16} strokeWidth={1.5} /></Ctl>
    </div>
  );
}

function Ctl({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="grid h-11 w-11 place-items-center rounded-[18px] text-[#DDF7FF]"
      style={{ background: "rgba(5,12,22,0.85)", border: "1px solid rgba(100,190,255,0.25)", boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
