/**
 * A survey is a full 360 plus every later session of it (re-runs and pulses), identified by
 * the root assessment. Its short, human-friendly ID is derived from the root id.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function surveyCode(rootId: string): string {
  // FNV-1a, re-mixed per character: stable, isomorphic (works in the browser), not a secret.
  let h = 2166136261;
  for (let i = 0; i < rootId.length; i++) {
    h ^= rootId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 6; i++) {
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995) >>> 0;
    out += ALPHABET[h % ALPHABET.length];
  }
  return `MRR-${out}`;
}

export function sessionKind(type: "FULL_360" | "PULSE") {
  return type === "PULSE" ? "Pulse check" : "Full 360";
}

/** "Session 2 · Pulse check · Spring 2027" (label optional). */
export function sessionName(s: { sessionNumber: number; type: "FULL_360" | "PULSE"; sessionLabel?: string | null }) {
  return [`Session ${s.sessionNumber}`, sessionKind(s.type), s.sessionLabel?.trim() || null].filter(Boolean).join(" · ");
}

export const shortSession = (n: number) => `S${n}`;
