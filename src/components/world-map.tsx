import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { BackSide, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, NoToneMapping, SRGBColorSpace, Vector3, type Texture } from "three";
import type { Eight } from "@/lib/model";
import { usePrefersReducedMotion } from "@/lib/motion-pref";

const HOME = new Vector3(0, 0.2, 2.65);

function latLngToLocal(lat: number, lng: number, radius: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function localToWorld(local: Vector3) {
  return new Vector3(-local.x, local.y, -local.z);
}

function worldToLatLng(point: Vector3) {
  const local = new Vector3(-point.x, point.y, -point.z).normalize();
  const phi = Math.acos(Math.min(1, Math.max(-1, local.y)));
  const theta = Math.atan2(local.z, -local.x);
  return { lat: 90 - (phi * 180) / Math.PI, lng: (theta * 180) / Math.PI - 180 };
}

const badges = new Map<string, CanvasTexture>();

function badgeTexture(label: string, color: string, selected: boolean) {
  const key = `${label}:${color}:${selected ? 1 : 0}`;
  const cached = badges.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const pen = canvas.getContext("2d");
  if (!pen) return null;
  pen.clearRect(0, 0, 128, 128);
  if (selected) {
    pen.strokeStyle = color;
    pen.globalAlpha = 0.35;
    pen.lineWidth = 2;
    pen.beginPath();
    pen.arc(64, 64, 58, 0, Math.PI * 2);
    pen.stroke();
    pen.globalAlpha = 0.55;
    pen.beginPath();
    pen.arc(64, 64, 50, 0, Math.PI * 2);
    pen.stroke();
    pen.globalAlpha = 1;
  }
  pen.beginPath();
  pen.arc(64, 64, 40, 0, Math.PI * 2);
  pen.fillStyle = "rgba(5, 12, 22, 0.86)";
  pen.fill();
  pen.lineWidth = 3;
  pen.strokeStyle = color;
  pen.shadowColor = color;
  pen.shadowBlur = 14;
  pen.stroke();
  pen.shadowBlur = 0;
  pen.fillStyle = "#EAF7FF";
  pen.font = label.length > 1 ? "600 32px sans-serif" : "700 44px sans-serif";
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  pen.fillText(label, 64, 67);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  badges.set(key, texture);
  return texture;
}

async function buildEarthTexture() {
  const img = new Image();
  img.src = "/geo/earth-night.jpg";
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = frame.data;
  for (let i = 0; i < px.length; i += 4) {
    const light = px[i] * 0.3 + px[i + 1] * 0.5 + px[i + 2] * 0.2;
    if (light < 24) {
      px[i] = 7;
      px[i + 1] = 26;
      px[i + 2] = 45;
    } else if (light < 62) {
      px[i] = 11;
      px[i + 1] = 32;
      px[i + 2] = 51;
    } else if (light < 100) {
      px[i] = 18;
      px[i + 1] = 58;
      px[i + 2] = 85;
    } else {
      const warm = Math.min(1, (light - 100) / 110);
      px[i] = Math.round(48 + warm * 207);
      px[i + 1] = Math.round(54 + warm * 161);
      px[i + 2] = Math.round(28 + warm * 42);
    }
  }
  ctx.putImageData(frame, 0, 0);
  try {
    const topo = (await fetch("/geo/countries-110m.json").then((res) => res.json())) as { objects: { countries: unknown } };
    const countries = feature(topo, topo.objects.countries);
    const projection = geoEquirectangular().fitExtent(
      [
        [0, 0],
        [canvas.width, canvas.height],
      ],
      { type: "Sphere" },
    );
    const path = geoPath(projection, ctx);
    ctx.beginPath();
    path(countries);
    ctx.strokeStyle = "rgba(85, 217, 255, 0.22)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
  } catch {
    /* borders are optional */
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function arcBetween(a: Vector3, b: Vector3) {
  const points: [number, number, number][] = [];
  for (let step = 0; step <= 28; step += 1) {
    const t = step / 28;
    const point = new Vector3().lerpVectors(a, b, t);
    point.normalize().multiplyScalar(1.03 + Math.sin(Math.PI * t) * 0.16);
    points.push([point.x, point.y, point.z]);
  }
  return points;
}

function Earth({
  entries,
  selected,
  pick,
  onSelect,
  onPick,
}: {
  entries: Eight[];
  selected: string;
  pick: boolean;
  onSelect?: (id: string) => void;
  onPick?: (lat: number, lng: number) => void;
}) {
  const [texture, setTexture] = useState<Texture | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const { camera } = useThree();
  const [far, setFar] = useState(true);

  useEffect(() => {
    let alive = true;
    void buildEarthTexture().then((next) => {
      if (!alive || !next) return;
      setTexture(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => () => texture?.dispose(), [texture]);

  useFrame(() => {
    const next = camera.position.length() > 2.45;
    setFar((value) => (value === next ? value : next));
  });

  const bins = useMemo(() => {
    const groups = new Map<string, Eight[]>();
    for (const entry of entries) {
      const key = `${Math.round(entry.lat / 16)}:${Math.round(entry.lng / 16)}`;
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }
    return [...groups.values()];
  }, [entries]);

  const arcs = useMemo(() => {
    const pairs: [Eight, Eight][] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
      let near: Eight | null = null;
      let best = Infinity;
      for (const other of entries) {
        if (other.id === entry.id) continue;
        const dist = (entry.lat - other.lat) ** 2 + (entry.lng - other.lng) ** 2;
        if (dist < best) {
          best = dist;
          near = other;
        }
      }
      if (!near || best > 700) continue;
      const key = [entry.id, near.id].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([entry, near]);
    }
    return pairs.slice(0, 12);
  }, [entries]);

  return (
    <group rotation={[0, Math.PI, 0]}>
      <mesh
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = drag.current;
          drag.current = null;
          if (!pick || !start || !onPick) return;
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
          const geo = worldToLatLng(event.point);
          onPick(geo.lat, geo.lng);
        }}
      >
        <sphereGeometry args={[1, 96, 96]} />
        <meshBasicMaterial map={texture ?? undefined} color={texture ? "#f2f7fb" : "#071A2D"} />
      </mesh>
      {arcs.length > 0 ? <ArcLines pairs={arcs} /> : null}
      <Marks
        groups={far ? bins : entries.map((entry) => [entry])}
        selected={selected}
        onSelect={onSelect}
      />
      <mesh scale={1.035} renderOrder={2}>
        <sphereGeometry args={[1, 40, 32]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          side={BackSide}
          args={[
            {
              transparent: true,
              depthWrite: false,
              side: BackSide,
              uniforms: {},
              vertexShader: `
                precision mediump float;
                varying mediump float vRim;
                void main() {
                  vec3 n = normalize(normalMatrix * normal);
                  float edge = clamp(1.0 - dot(n, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
                  vRim = edge * edge * edge;
                  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
              `,
              fragmentShader: `
                precision mediump float;
                varying mediump float vRim;
                void main() {
                  gl_FragColor = vec4(0.33, 0.85, 1.0, vRim * 0.55);
                }
              `,
            },
          ]}
        />
      </mesh>
    </group>
  );
}

function ArcLines({ pairs }: { pairs: [Eight, Eight][] }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const cyan = new Color("#55D9FF");
    const violet = new Color("#7B4DFF");
    for (const [from, to] of pairs) {
      const points = arcBetween(latLngToLocal(from.lat, from.lng, 1), latLngToLocal(to.lat, to.lng, 1));
      const tint = from.anchor || to.anchor ? violet : cyan;
      for (let step = 0; step < points.length - 1; step += 1) {
        positions.push(...points[step], ...points[step + 1]);
        colors.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return geo;
  }, [pairs]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.55} />
    </lineSegments>
  );
}

function Marks({
  groups,
  selected,
  onSelect,
}: {
  groups: Eight[][];
  selected: string;
  onSelect?: (id: string) => void;
}) {
  const map = useMemo(() => badgeTexture("8", "#ffffff", false), []);
  const packed = useMemo(() => {
    const positions = new Float32Array(groups.length * 3);
    const colors = new Float32Array(groups.length * 3);
    const ids: string[] = [];
    groups.forEach((group, index) => {
      const head = group[0];
      if (!head) return;
      const shown = group.find((entry) => entry.id === selected) ?? head;
      const point = latLngToLocal(shown.lat, shown.lng, 1.03);
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
      const tint = new Color(shown.id === selected ? "#168BFF" : shown.anchor ? "#7B4DFF" : "#55D9FF");
      colors[index * 3] = tint.r;
      colors[index * 3 + 1] = tint.g;
      colors[index * 3 + 2] = tint.b;
      ids.push(shown.id);
    });
    return { positions, colors, ids };
  }, [groups, selected]);
  if (!map || groups.length === 0) return null;
  return (
    <points
      onClick={(event) => {
        event.stopPropagation();
        const id = packed.ids[event.index ?? 0];
        if (id) onSelect?.(id);
      }}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[packed.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[packed.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial map={map} vertexColors transparent depthWrite={false} size={0.16} sizeAttenuation toneMapped={false} />
    </points>
  );
}

function Stars() {
  const positions = useMemo(() => {
    const data = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i += 1) {
      const radius = 4 + Math.random() * 3;
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      data[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      data[i * 3 + 1] = radius * Math.cos(phi);
      data[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    return data;
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#d5deea" size={0.015} sizeAttenuation />
    </points>
  );
}

function Rig({
  fly,
  command,
  reduced,
}: {
  fly: Vector3 | null;
  command: React.MutableRefObject<"in" | "out" | "reset" | "">;
  reduced: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useRef<{ enabled: boolean; update: () => void; target: Vector3 }>(null);
  const dest = useRef(HOME.clone());
  const flying = useRef(false);

  useEffect(() => {
    if (!fly) return;
    dest.current.copy(fly);
    flying.current = true;
  }, [fly]);

  useFrame((_, delta) => {
    const next = command.current;
    if (next) {
      command.current = "";
      flying.current = false;
      if (next === "reset") camera.position.copy(HOME);
      else camera.position.multiplyScalar(next === "in" ? 0.82 : 1.18);
      const length = camera.position.length();
      if (length < 1.55) camera.position.setLength(1.55);
      if (length > 4.4) camera.position.setLength(4.4);
    }
    if (flying.current) {
      if (controls.current) controls.current.enabled = false;
      camera.position.lerp(dest.current, 1 - Math.pow(0.012, delta));
      if (camera.position.distanceTo(dest.current) < 0.03) flying.current = false;
    } else if (controls.current) {
      controls.current.enabled = true;
    }
    camera.lookAt(0, 0, 0);
    controls.current?.update();
  });

  return (
    <OrbitControls
      ref={controls as never}
      enablePan={false}
      enableDamping={!reduced}
      autoRotate={!reduced}
      autoRotateSpeed={0.35}
      minDistance={1.55}
      maxDistance={4.4}
    />
  );
}

export function WorldMap({
  entries,
  selected = "",
  onSelect,
  bornId = "",
  pick = false,
  onPick,
  focus,
  showControls = true,
  commandRef,
}: {
  entries: Eight[];
  selected?: string;
  onSelect?: (id: string) => void;
  bornId?: string;
  pick?: boolean;
  onPick?: (lat: number, lng: number) => void;
  focus?: { lat: number; lng: number; token: number } | null;
  showControls?: boolean;
  commandRef?: MutableRefObject<"in" | "out" | "reset" | "">;
}) {
  const reduced = usePrefersReducedMotion();
  const [on, setOn] = useState(false);
  const localCommand = useRef<"in" | "out" | "reset" | "">("");
  const command = commandRef ?? localCommand;
  useEffect(() => setOn(true), []);

  const fly = useMemo(() => {
    const entry = entries.find((item) => item.id === (bornId || selected));
    if (entry) return localToWorld(latLngToLocal(entry.lat, entry.lng, bornId ? 1.85 : 2.15));
    if (focus) return localToWorld(latLngToLocal(focus.lat, focus.lng, 2.15));
    return null;
  }, [entries, selected, bornId, focus]);

  return (
    <div className="absolute inset-0" style={{ background: "#02050A" }}>
      {on ? (
        <Canvas
          camera={{ position: [0, 0.2, 2.65], fov: 42 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: false, powerPreference: "default", toneMapping: NoToneMapping }}
          style={{ touchAction: "none" }}
        >
          <color attach="background" args={["#02050A"]} />
          <Stars />
          <Earth entries={entries} selected={selected} pick={pick} onSelect={onSelect} onPick={onPick} />
          <Rig fly={fly} command={command} reduced={reduced} />
        </Canvas>
      ) : (
        <div className="absolute inset-0" style={{ background: "#02050A" }} />
      )}
      {showControls ? (
      <div className="absolute top-20 left-3 z-10 flex flex-col gap-2">
        <button className="icon-btn glass-2 text-fg" aria-label="Наблизити" onClick={() => { command.current = "in"; }}>
          <Plus size={18} />
        </button>
        <button className="icon-btn glass-2 text-fg" aria-label="Віддалити" onClick={() => { command.current = "out"; }}>
          <Minus size={18} />
        </button>
        <button className="icon-btn glass-2 text-fg" aria-label="Уся Земля" onClick={() => { command.current = "reset"; }}>
          <RotateCcw size={16} />
        </button>
      </div>
      ) : null}
    </div>
  );
}
