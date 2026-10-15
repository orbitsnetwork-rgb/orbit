import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const SceneContext = createContext({ globe: false });

export function SceneProvider({ children }: { children: ReactNode }) {
  const [globe, setGlobe] = useState(false);
  useEffect(() => {
    setGlobe(true);
  }, []);
  return <SceneContext.Provider value={{ globe }}>{children}</SceneContext.Provider>;
}

export function useScene() {
  return useContext(SceneContext);
}

