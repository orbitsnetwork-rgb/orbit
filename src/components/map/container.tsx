import { useRef, useState } from "react";
import { MapControls } from "@/components/map/controls";
import type { MapApi } from "@/components/map/scene";
import { StreetMap } from "@/components/map/street";
import { haversine, isPublic, type Eight } from "@/lib/model";
import { findPlace } from "@/lib/places";

export function LivingMap({
  entries,
  selected,
  bornId,
  onSelect,
  city,
}: {
  entries: Eight[];
  selected: string;
  bornId: string;
  onSelect: (id: string) => void;
  city: string;
}) {
  const api = useRef<MapApi | null>(null);
  const [note, setNote] = useState("");

  function locate() {
    setNote("");
    const pick = (lat: number, lng: number) => {
      api.current?.showMe(lng, lat);
      const nearest = entries.filter(isPublic).sort((a, b) => haversine({ lat, lng }, a) - haversine({ lat, lng }, b))[0];
      if (nearest) onSelect(nearest.id);
    };
    if (!navigator.geolocation) {
      const place = findPlace(city);
      if (!place) {
        setNote("Немає місця. Дозволь геолокацію або вкажи місто в профілі.");
        return;
      }
      pick(place.lat, place.lng);
      setNote("Показано місто з профілю, не точну позицію.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => pick(pos.coords.latitude, pos.coords.longitude),
      () => {
        const place = findPlace(city);
        if (!place) {
          setNote("Місце не відкрилось. Вкажи місто в профілі.");
          return;
        }
        pick(place.lat, place.lng);
        setNote("Геолокацію не дано. Показано місто з профілю.");
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <div className="map-root absolute inset-0 bg-[#d5e6ee]">
      <StreetMap entries={entries} selected={selected || bornId} onSelect={onSelect} api={api} />
      <MapControls api={api} onLocate={locate} />
      <p className="pointer-events-none absolute bottom-24 left-3 z-floating text-meta text-muted lg:bottom-3">Демо-атлас цього пристрою</p>
      {note ? <p className="absolute top-40 right-3 z-floating max-w-48 text-right text-meta text-muted">{note}</p> : null}
    </div>
  );
}
