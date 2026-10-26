"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LoadFailure } from "@/components/navigation/load-failure";
import { openFreshDocument, SLOW_NAVIGATION_MS } from "@/lib/navigation/recovery";

export function LoadingGuard({ children }: { children: ReactNode }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_NAVIGATION_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return slow ? <LoadFailure retry={() => openFreshDocument(window.location.href)}/> : children;
}
