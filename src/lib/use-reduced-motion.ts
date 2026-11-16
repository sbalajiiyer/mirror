"use client";
import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";

/** True when the user has asked the OS to reduce motion. */
export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
