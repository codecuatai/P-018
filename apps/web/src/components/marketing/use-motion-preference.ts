"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

/** Keep motion preference identical during SSR and the first client render. */
export function usePrefersReducedMotion(): boolean {
  const preference = useReducedMotion();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return isHydrated && preference === true;
}
