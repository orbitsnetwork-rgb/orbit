import { Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Mesh } from "three";
import { EightMark } from "@/components/mark";
import { usePrefersReducedMotion } from "@/lib/motion-pref";

function ease(t: number) {
  return 1 - (1 - t) ** 3;
}

function Rings({ arrive }: { arrive: boolean }) {
  const top = useRef<Mesh>(null);
  const bottom = useRef<Mesh>(null);
  const clock = useRef(0);
  useFrame((_, delta) => {
    clock.current += delta;
    const formed = arrive ? ease(Math.min(1, clock.current / 2.2)) : 1;
    const drift = Math.sin(clock.current * 0.45) * 0.08;
    if (top.current) {
      top.current.position.set((1 - formed) * -1.8, 2.2 - (2.2 - 0.58) * formed, 0);
      top.current.rotation.set(Math.PI / 2, drift, (1 - formed) * 1.1);
    }
    if (bottom.current) {
      bottom.current.position.set((1 - formed) * 1.8, -2.2 + (2.2 - 0.58) * formed, 0);
      bottom.current.rotation.set(Math.PI / 2, -drift, (1 - formed) * -1.1);
    }
  });
  return (
    <group>
      <mesh ref={top}>
        <torusGeometry args={[0.72, 0.045, 32, 96]} />
        <meshStandardMaterial color="#f4f7fb" metalness={0.92} roughness={0.16} emissive="#7ad7f2" emissiveIntensity={0.28} />
      </mesh>
      <mesh ref={bottom}>
        <torusGeometry args={[0.72, 0.045, 32, 96]} />
        <meshStandardMaterial color="#e7eef6" metalness={0.9} roughness={0.2} emissive="#8b7cf6" emissiveIntensity={0.16} />
      </mesh>
    </group>
  );
}

function Rig({ arrive }: { arrive: boolean }) {
  const clock = useRef(0);
  useFrame((state, delta) => {
    if (!arrive) return;
    clock.current += delta;
    const z = 7.2 - (7.2 - 4.2) * ease(Math.min(1, clock.current / 2.4));
    state.camera.position.z = z;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export function SymbolStage({ className, arrive = false }: { className?: string; arrive?: boolean }) {
  const reduced = usePrefersReducedMotion();
  const [on, setOn] = useState(false);
  useEffect(() => setOn(true), []);
  if (!on || reduced) {
    return (
      <div className={className}>
        <EightMark mode={arrive ? "hero" : "static"} className="mx-auto h-full w-auto" />
      </div>
    );
  }
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, arrive ? 7.2 : 4.4], fov: 30 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={0.25} />
        <pointLight position={[2.4, 2.2, 3]} intensity={18} color="#f4f7fb" />
        <pointLight position={[-2.6, -1.4, 2.2]} intensity={8} color="#7ad7f2" />
        <Rig arrive={arrive} />
        <Rings arrive={arrive} />
        {arrive ? <Sparkles count={18} scale={[6, 4, 2]} size={1.2} color="#d5deea" speed={0.15} opacity={0.35} /> : null}
      </Canvas>
    </div>
  );
}
