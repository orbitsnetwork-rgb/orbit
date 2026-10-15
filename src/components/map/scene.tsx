import {
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import { useEffect, useRef, type MutableRefObject } from "react";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { derivedStatus, type Eight } from "@/lib/model";
import { feature } from "topojson-client";
import { MAP_STYLE, graticule } from "@/components/map/style";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);

export type MapApi = {
  zoomIn: () => void;
  zoomOut: () => void;
  home: () => void;
  fly: (lng: number, lat: number, zoom?: number) => void;
  showMe: (lng: number, lat: number) => void;
};

function points(entries: Eight[]) {
  return {
    type: "FeatureCollection" as const,
    features: entries.map((entry) => ({
      type: "Feature" as const,
      id: entry.id,
      properties: {
        id: entry.id,
        anchor: entry.anchor ? 1 : 0,
        verified: derivedStatus(entry) === "verified" ? 1 : 0,
      },
      geometry: { type: "Point" as const, coordinates: [entry.lng, entry.lat] },
    })),
  };
}

function arcs(entries: Eight[]) {
  const line = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-6);
  const features = [];
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1];
    const b = line[i];
    if (!a || !b) continue;
    features.push({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
    });
  }
  return { type: "FeatureCollection" as const, features };
}

function eightIcon() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 96;
  const pen = canvas.getContext("2d");
  if (!pen) return canvas;
  pen.strokeStyle = "#f4f7fb";
  pen.lineWidth = 5;
  pen.beginPath();
  pen.arc(32, 28, 16, 0, Math.PI * 2);
  pen.stroke();
  pen.beginPath();
  pen.arc(32, 66, 16, 0, Math.PI * 2);
  pen.stroke();
  return canvas;
}

export function MapScene({
  entries,
  selected,
  bornId,
  reduced,
  onSelect,
  onReady,
  onFail,
  api,
}: {
  entries: Eight[];
  selected: string;
  bornId: string;
  reduced: boolean;
  onSelect: (id: string) => void;
  onReady: () => void;
  onFail: () => void;
  api: MutableRefObject<MapApi | null>;
}) {
  const node = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const spin = useRef(true);
  const me = useRef<Marker | null>(null);

  useEffect(() => {
    const host = node.current;
    if (!host) return;
    const map = new MapLibreMap({
      container: host,
      style: MAP_STYLE,
      center: [22, 18],
      zoom: 1.7,
      attributionControl: false,
      fadeDuration: reducedRef.current ? 0 : 300,
    });
    mapRef.current = map;
    const duration = () => (reducedRef.current ? 0 : 1400);
    api.current = {
      zoomIn: () => map.zoomIn({ duration: reducedRef.current ? 0 : 250 }),
      zoomOut: () => map.zoomOut({ duration: reducedRef.current ? 0 : 250 }),
      home: () => {
        spin.current = false;
        map.flyTo({ center: [22, 18], zoom: 1.7, pitch: 0, bearing: 0, duration: duration() });
      },
      fly: (lng, lat, zoom = 3.4) => {
        spin.current = false;
        const narrow = window.innerWidth < 1024;
        map.flyTo({
          center: [lng, lat],
          zoom: Math.max(map.getZoom(), zoom),
          pitch: reducedRef.current ? 0 : 18,
          padding: narrow
            ? { top: 150, bottom: 230, left: 16, right: 68 }
            : { top: 70, bottom: 40, left: 24, right: 340 },
          duration: duration(),
          essential: true,
        });
      },
      showMe: (lng, lat) => {
        spin.current = false;
        me.current?.remove();
        const element = document.createElement("div");
        element.className = "me-dot";
        me.current = new Marker({ element }).setLngLat([lng, lat]).addTo(map);
        map.flyTo({ center: [lng, lat], zoom: 4, duration: duration(), essential: true });
      },
    };
    map.on("load", () => {
      void (async () => {
      map.setProjection({ type: "globe" });
      map.setSky({
        "sky-color": "#061820",
        "horizon-color": "#8fd4ea",
        "fog-color": "#0c3144",
        "sky-horizon-blend": 0.35,
        "horizon-fog-blend": 0.35,
        "fog-ground-blend": 0.05,
        "atmosphere-blend": 0.7,
      });
      try {
        const topology = (await fetch("/geo/countries-110m.json").then((res) => res.json())) as { objects: { land: unknown } };
        const land = feature(topology, topology.objects.land);
        map.addSource("land", { type: "geojson", data: land as never });
        map.addSource("grid", { type: "geojson", data: graticule() });
        map.addLayer({ id: "land", type: "fill", source: "land", paint: { "fill-color": "#8eabbd", "fill-opacity": 1 } });
        map.addLayer({ id: "land-edge", type: "line", source: "land", paint: { "line-color": "#f4f7fb", "line-width": 0.7, "line-opacity": 0.4 } });
        map.addLayer({ id: "grid", type: "line", source: "grid", paint: { "line-color": "#1a6280", "line-width": 0.7, "line-opacity": 0.85 } });
      } catch {
        onFail();
        return;
      }
      const icon = eightIcon();
      const pixels = icon.getContext("2d")?.getImageData(0, 0, icon.width, icon.height);
      if (pixels && !map.hasImage("eight")) map.addImage("eight", pixels, { pixelRatio: 2 });
      map.addSource("eights", {
        type: "geojson",
        data: points(entriesRef.current),
        cluster: true,
        clusterRadius: 42,
        clusterMaxZoom: 3,
        promoteId: "id",
      });
      map.addSource("arcs", { type: "geojson", data: arcs(entriesRef.current) });
      map.addLayer({
        id: "arcs",
        type: "line",
        source: "arcs",
        paint: { "line-color": "#7ad7f2", "line-opacity": 0.18, "line-width": 1 },
      });
      map.addLayer({
        id: "glow",
        type: "circle",
        source: "eights",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 16,
          "circle-blur": 0.8,
          "circle-opacity": 0.4,
          "circle-color": ["case", ["==", ["get", "anchor"], 1], "#8b7cf6", ["==", ["get", "verified"], 1], "#7ad7f2", "#d5deea"],
        },
      });
      map.addLayer({
        id: "ring",
        type: "circle",
        source: "eights",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 8,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 1,
          "circle-stroke-color": ["case", ["==", ["get", "anchor"], 1], "#8b7cf6", "#7ad7f2"],
          "circle-stroke-opacity": 0.7,
        },
      });
      map.addLayer({
        id: "cores",
        type: "circle",
        source: "eights",
        filter: ["!", ["has", "point_count"]],
        paint: { "circle-radius": 2.2, "circle-color": "#f4f7fb" },
      });
      map.addLayer({
        id: "mark",
        type: "symbol",
        source: "eights",
        filter: ["!", ["has", "point_count"]],
        layout: { "icon-image": "eight", "icon-size": 0.28, "icon-allow-overlap": true },
      });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "eights",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#14384a",
          "circle-stroke-color": "#9be7f8",
          "circle-stroke-width": 2,
          "circle-radius": ["step", ["get", "point_count"], 16, 6, 20, 12, 24],
          "circle-opacity": 0.92,
        },
      });
      onReady();
      const current = entriesRef.current.find((item) => item.id === selectedRef.current);
      if (current) api.current?.fly(current.lng, current.lat, 3.4);
      if (!reducedRef.current) {
        const step = () => {
          if (!spin.current || reducedRef.current || map.getZoom() > 2.2) return;
          const center = map.getCenter();
          map.easeTo({ center: [center.lng - 8, center.lat], duration: 4000, easing: (t: number) => t, essential: true });
        };
        map.on("moveend", step);
        step();
        const breathe = window.setInterval(() => {
          if (reducedRef.current || !map.getLayer("glow") || document.visibilityState === "hidden") return;
          const radius = 15 + Math.sin(performance.now() / 1100) * 1.6;
          map.setPaintProperty("glow", "circle-radius", radius);
        }, 220);
        map.once("remove", () => window.clearInterval(breathe));
      }
      })();
    });
    map.on("error", (event) => {
      if (/style|sprite/i.test(String(event.error?.message ?? ""))) onFail();
    });
    map.on("dragstart", () => {
      spin.current = false;
    });
    map.on("click", "cores", (event: MapLayerMouseEvent) => {
      spin.current = false;
      const id = String(event.features?.[0]?.properties?.id ?? "");
      if (!id) return;
      onSelectRef.current(id);
    });
    map.on("click", "mark", (event: MapLayerMouseEvent) => {
      const id = String(event.features?.[0]?.properties?.id ?? "");
      if (id) onSelectRef.current(id);
    });
    map.on("click", "clusters", (event: MapLayerMouseEvent) => {
      spin.current = false;
      const feature = event.features?.[0];
      const source = map.getSource("eights") as GeoJSONSource | undefined;
      const clusterId = Number(feature?.properties?.cluster_id);
      if (!source || !Number.isFinite(clusterId) || feature?.geometry.type !== "Point") return;
      const coords = feature.geometry.coordinates as [number, number];
      void source.getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({ center: coords, zoom, duration: reducedRef.current ? 0 : 800 });
      });
    });
    const paintLabels = () => {
      const box = labels.current;
      if (!box || !map.getLayer("clusters")) return;
      const features = map.queryRenderedFeatures(undefined, { layers: ["clusters"] });
      const seen = new Set<number>();
      let html = "";
      for (const feature of features) {
        const id = feature.properties?.cluster_id as number | undefined;
        if (id == null || seen.has(id) || feature.geometry.type !== "Point") continue;
        seen.add(id);
        const point = map.project(feature.geometry.coordinates as [number, number]);
        html += `<span class="cluster-label" style="transform:translate(${point.x}px,${point.y}px)">${feature.properties?.point_count ?? ""}</span>`;
      }
      box.innerHTML = html;
    };
    map.on("move", paintLabels);
    map.on("idle", paintLabels);
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(host);
    return () => {
      resize.disconnect();
      me.current?.remove();
      api.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [api, onFail, onReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("eights")) return;
    (map.getSource("eights") as GeoJSONSource).setData(points(entries));
    (map.getSource("arcs") as GeoJSONSource).setData(arcs(entries));
  }, [entries]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("eights")) return;
    for (const entry of entries) {
      map.setFeatureState({ source: "eights", id: entry.id }, { selected: entry.id === selected });
    }
    if (map.getLayer("glow")) {
      map.setPaintProperty("glow", "circle-opacity", [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0.85,
        selected ? 0.2 : 0.45,
      ]);
    }
  }, [entries, selected]);

  useEffect(() => {
    if (!selected) return;
    const entry = entriesRef.current.find((item) => item.id === selected);
    if (entry) api.current?.fly(entry.lng, entry.lat, 3.4);
  }, [selected, api]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bornId) return;
    const entry = entries.find((item) => item.id === bornId);
    if (!entry) return;
    spin.current = false;
    map.flyTo({
      center: [entry.lng, entry.lat],
      zoom: 4.8,
      pitch: reduced ? 0 : 32,
      duration: reduced ? 0 : 1900,
      essential: true,
    });
    const element = document.createElement("div");
    element.className = "born-marker";
    element.innerHTML = '<span class="born-core"></span><span class="born-ring"></span>';
    const marker = new Marker({ element }).setLngLat([entry.lng, entry.lat]).addTo(map);
    const timer = window.setTimeout(() => marker.remove(), 4200);
    return () => {
      window.clearTimeout(timer);
      marker.remove();
    };
  }, [bornId, entries, reduced]);

  return (
    <>
      <div ref={node} className="absolute inset-0" />
      <div ref={labels} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </>
  );
}
