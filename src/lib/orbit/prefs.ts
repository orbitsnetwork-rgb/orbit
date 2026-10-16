import { useEffect, useState } from "react";

const HIDE = "orbits-hide";
const EVENT = "orbit-hide";

/** Приховати баланс (як «око» в біржах). Лише на цьому телефоні. */
export function useHidden(): [boolean, () => void] {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setHidden(localStorage.getItem(HIDE) === "1");
      } catch {
        setHidden(false);
      }
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  const toggle = () => {
    try {
      localStorage.setItem(HIDE, hidden ? "0" : "1");
    } catch {
      /* приватний режим */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return [hidden, toggle];
}

export const MASK = "•••";
