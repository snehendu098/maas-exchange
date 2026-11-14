"use client";

import { useSyncExternalStore } from "react";
import { formatUtcTime } from "@/shared/lib/format";

function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, 1000);
  return () => window.clearInterval(id);
}

// string snapshot: same second, no rerender
const getSnapshot = () => formatUtcTime(new Date());
// placeholder on server, no clock in prerender
const getServerSnapshot = () => "--:--:-- UTC";

/** Live "HH:MM:SS UTC" string, ticking every second. */
export function useUtcClock() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
