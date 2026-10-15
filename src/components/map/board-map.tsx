import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

const TOKEN = typeof import.meta.env.VITE_MAPBOX_TOKEN === "string" ? import.meta.env.VITE_MAPBOX_TOKEN : "";

export function hasMapbox() {
  return TOKEN.startsWith("pk.");
}

function tiles() {
  if (hasMapbox()) {
    return {
      url: `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${TOKEN}`,
      attribution: "© Mapbox © OpenStreetMap",
    };
  }
  return {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap",
  };
}

export function BoardMap({
  points,
  here,
  onOpen,
}: {
  points: { id: string; lat: number; lng: number }[];
  here: { lat: number; lng: number } | null;
  onOpen: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const onOpenRef = useRef(onOpen);
  const pointsRef = useRef(points);
  onOpenRef.current = onOpen;
  pointsRef.current = points;
  const pointsKey = points.map((point) => `${point.id}:${point.lat}:${point.lng}`).join(",");

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let map: import("leaflet").Map | null = null;
    let dead = false;
    void import("leaflet").then((mod) => {
      if (dead || !host.current) return;
      const L = mod.default;
      const layer = tiles();
      const spots = pointsRef.current.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
      const focus = here ?? spots[0];
      if (!focus) return;
      map = L.map(host.current, { zoomControl: false, attributionControl: false }).setView([focus.lat, focus.lng], here ? 15 : 13);
      map.getContainer().style.background = "url(/canon/street.jpg) center / cover no-repeat";
      L.tileLayer(layer.url, { maxZoom: 20, attribution: layer.attribution }).addTo(map);
      const marks = spots.map((point) =>
        L.marker([point.lat, point.lng], {
          icon: L.divIcon({ className: "", html: `<span class="grid h-7 w-7 place-items-center rounded-full bg-accent text-xs text-bg">8</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
          title: point.id,
        }).on("click", () => onOpenRef.current(point.id)),
      );
      for (const mark of marks) mark.addTo(map);
      if (here) {
        L.circleMarker([here.lat, here.lng], { radius: 6, color: "#f4f7fb", weight: 2, fillOpacity: 0.9 }).addTo(map);
      }
      const bounds = marks.map((mark) => mark.getLatLng());
      if (here) bounds.push(L.latLng(here.lat, here.lng));
      if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { padding: [28, 28], maxZoom: 15 });
      else if (bounds[0]) map.setView(bounds[0], 14);
      map.invalidateSize();
    });
    return () => {
      dead = true;
      map?.remove();
    };
  }, [pointsKey, here?.lat, here?.lng]);

  return <div ref={host} className="z-0 h-52 w-full overflow-hidden rounded-control bg-cover bg-center" style={{ backgroundImage: "url(/canon/street.jpg)" }} />;
}
