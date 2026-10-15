import type { StyleSpecification } from "maplibre-gl";

export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0c3144" } }],
};

export function graticule() {
  const features = [];
  for (let lng = -150; lng <= 180; lng += 30) {
    const coordinates = [];
    for (let lat = -80; lat <= 80; lat += 4) coordinates.push([lng, lat]);
    features.push({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates } });
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const coordinates = [];
    for (let lng = -180; lng <= 180; lng += 4) coordinates.push([lng, lat]);
    features.push({ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates } });
  }
  return { type: "FeatureCollection" as const, features };
}
