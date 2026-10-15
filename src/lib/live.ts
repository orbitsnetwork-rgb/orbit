export function onLive(ms: number, tick: () => void) {
  let timer = 0;
  let away = false;
  const arm = () => {
    window.clearInterval(timer);
    if (document.hidden) return;
    timer = window.setInterval(() => {
      if (!document.hidden) tick();
    }, ms);
  };
  const onVis = () => {
    if (document.hidden) {
      away = true;
      window.clearInterval(timer);
      timer = 0;
      return;
    }
    if (!away) return;
    away = false;
    tick();
    arm();
  };
  arm();
  document.addEventListener("visibilitychange", onVis);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVis);
  };
}