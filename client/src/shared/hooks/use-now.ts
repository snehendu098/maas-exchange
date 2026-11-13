"use client";

import { useSyncExternalStore } from "react";

function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, 1000);
  return () => window.clearInterval(id);
}

const getSnapshot = () => Math.floor(Date.now() / 1000);
const getServerSnapshot = () => 0;

/** Unix seconds, ticking; 0 during prerender. */
export function useNowSeconds() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
