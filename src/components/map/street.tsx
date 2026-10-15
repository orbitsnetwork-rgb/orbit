import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { MapApi } from "@/components/map/scene";
import type { Eight } from "@/lib/model";
import "leaflet/dist/leaflet.css";

export function StreetMap({
  entries,
  selected,
  onSelect,
  api,
}: {
  entries: Eight[];
  selected: string;
  onSelect: (id: string) => void;
  api: MutableRefObject<MapApi | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markers = useRef(new Map<string, import("leaflet").Marker>());
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let map: import("leaflet").Map | null = null;
    let dead = false;
    void import("leaflet").then((mod) => {
      if (dead) return;
      const L = mod.default;
      map = L.map(node, { zoomControl: false, minZoom: 2, maxZoom: 19, worldCopyJump: true }).setView([22, 18], 2);
      const token = typeof import.meta.env.VITE_MAPBOX_TOKEN === "string" ? import.meta.env.VITE_MAPBOX_TOKEN : "";
      const mapbox = token.startsWith("pk.");
      L.tileLayer(
        mapbox
          ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${token}`
          : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        mapbox
          ? { maxZoom: 20, attribution: "© Mapbox © OpenStreetMap" }
          : { subdomains: "abcd", maxZoom: 20, attribution: "© OpenStreetMap © CARTO" },
      ).addTo(map);
      mapRef.current = map;
      api.current = {
        zoomIn: () => map?.zoomIn(1),
        zoomOut: () => map?.zoomOut(1),
        home: () => map?.flyTo([22, 18], 2, { duration: 0.7 }),
        fly: (lng, lat, zoom = 16) => map?.flyTo([lat, lng], zoom, { duration: 0.9 }),
        showMe: (lng, lat) => map?.flyTo([lat, lng], 14, { duration: 0.9 }),
      };
      map.whenReady(() => map?.invalidateSize());
      setReady(true);
    });
    const fit = () => mapRef.current?.invalidateSize();
    window.addEventListener("resize", fit);
    return () => {
      dead = true;
      window.removeEventListener("resize", fit);
      markers.current.forEach((marker) => marker.remove());
      markers.current.clear();
      map?.remove();
      mapRef.current = null;
      api.current = null;
      setReady(false);
    };
  }, [api]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    void import("leaflet").then((mod) => {
      const L = mod.default;
      const seen = new Set<string>();
      for (const entry of entries) {
        seen.add(entry.id);
        let marker = markers.current.get(entry.id);
        if (!marker) {
          const icon = L.divIcon({
            className: "eight-pin-wrap",
            html: `<button type="button" class="eight-pin">8</button>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });
          marker = L.marker([entry.lat, entry.lng], { icon, keyboard: true, title: entry.city })
            .on("click", () => onSelectRef.current(entry.id))
            .addTo(map);
          markers.current.set(entry.id, marker);
        }
        const button = marker.getElement()?.querySelector(".eight-pin");
        button?.classList.toggle("is-on", entry.id === selected);
        button?.classList.toggle("is-anchor", Boolean(entry.anchor));
      }
      for (const [id, marker] of markers.current) {
        if (seen.has(id)) continue;
        marker.remove();
        markers.current.delete(id);
      }
    });
  }, [entries, selected, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const entry = entries.find((item) => item.id === selected);
    if (!map || !entry || !ready) return;
    map.flyTo([entry.lat, entry.lng], Math.max(map.getZoom(), 14), { duration: 0.9 });
  }, [entries, selected, ready]);

  return <div ref={host} className="absolute inset-0" />;
}
