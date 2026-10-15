let enabled = false;
let ctx: AudioContext | null = null;

export function setSoundOn(value: boolean) {
  enabled = value;
}

function context() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext;
    ctx = new AC();
  }
  return ctx;
}

const TONES: Record<string, number[]> = {
  create: [392, 523],
  success: [392, 523],
  verify: [494, 659],
  transfer: [330, 392],
  notify: [880],
};

export function playCue(kind: keyof typeof TONES) {
  if (!enabled) return;
  const audio = context();
  if (!audio) return;
  void audio.resume();
  const now = audio.currentTime;
  const notes = TONES[kind] ?? [440];
  notes.forEach((freq, index) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + index * 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.028, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(start);
    osc.stop(start + 0.2);
  });
}
