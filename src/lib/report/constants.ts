/** Gap at or above this (on the rating scale) counts as a meaningful self/others difference. */
export const GAP_THRESHOLD = 0.3;

export const QUADRANTS = {
  open_strength: { label: "Open strengths", hint: "You and others both see these as strengths." },
  hidden_strength: { label: "Hidden strengths", hint: "Others rate these higher than you do." },
  blind_spot: { label: "Blind spots", hint: "You rate these higher than others do." },
  development_area: { label: "Development areas", hint: "You and others agree these are less strong." },
} as const;
