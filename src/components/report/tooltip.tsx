"use client";

import { useState } from "react";

/** Minimal hover/focus tooltip for custom SVG/HTML charts. */
export function useTooltip<T>() {
  const [tip, setTip] = useState<{ x: number; y: number; data: T } | null>(null);
  const bind = (data: T) => ({
    onMouseMove: (e: React.MouseEvent) => {
      const host = (e.currentTarget as Element).closest("[data-tip-host]")?.getBoundingClientRect();
      if (host) setTip({ x: e.clientX - host.left, y: e.clientY - host.top, data });
    },
    onFocus: (e: React.FocusEvent) => {
      const host = (e.currentTarget as Element).closest("[data-tip-host]")?.getBoundingClientRect();
      const r = (e.currentTarget as Element).getBoundingClientRect();
      if (host) setTip({ x: r.left - host.left + r.width / 2, y: r.top - host.top, data });
    },
    onMouseLeave: () => setTip(null),
    onBlur: () => setTip(null),
  });
  return { tip, bind };
}

export function TooltipBox({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 max-w-64 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
      style={{ left: x, top: y }}
    >
      {children}
    </div>
  );
}
