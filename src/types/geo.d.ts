declare module "d3-geo" {
  interface Projection {
    fitExtent(extent: [[number, number], [number, number]], object: unknown): Projection;
    (point: [number, number]): [number, number] | null;
  }
  interface GeoPath {
    (object: unknown): string | null | undefined;
  }
  export function geoNaturalEarth1(): Projection;
  export function geoEquirectangular(): Projection;
  export function geoPath(projection: Projection, context?: CanvasRenderingContext2D | null): GeoPath;
  export function geoGraticule(): {
    step(step: [number, number]): () => unknown;
  };
}

declare module "topojson-client" {
  export function feature(topology: unknown, object: unknown): {
    type: string;
    features: Array<{ type: string; geometry: unknown }>;
  };
}
