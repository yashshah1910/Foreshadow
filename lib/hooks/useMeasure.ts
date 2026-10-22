"use client";

import { useEffect, useRef, useState } from "react";

/** Width of a container element, updated on resize. SSR renders with `fallback`. */
export function useMeasure<T extends HTMLElement>(fallback = 800) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || fallback);
    return () => ro.disconnect();
  }, [fallback]);
  return { ref, width };
}
