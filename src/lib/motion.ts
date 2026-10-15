export const motionEase = [0.2, 0.8, 0.2, 1] as const;

export const motionSpring = {
  type: "spring" as const,
  stiffness: 520,
  damping: 34,
  mass: 0.7,
};

export const motionDuration = {
  fast: 0.15,
  press: 0.15,
  normal: 0.22,
  page: 0.22,
  enter: 0.22,
  slow: 0.45,
  cinematic: 1.2,
} as const;
