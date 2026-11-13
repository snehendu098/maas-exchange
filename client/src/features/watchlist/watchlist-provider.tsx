"use client";

import {
  createContext,
  use,
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const STORAGE_KEY = "pv:watchlist";
const EMPTY: readonly string[] = [];

// localStorage-backed external store, synced across tabs
const watchlistStore = {
  listeners: new Set<() => void>(),
  cache: null as readonly string[] | null,

  read(): readonly string[] {
    if (this.cache) return this.cache;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      this.cache = raw ? (JSON.parse(raw) as string[]) : EMPTY;
    } catch {
      this.cache = EMPTY;
    }
    return this.cache;
  },

  write(next: readonly string[]) {
    this.cache = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage blocked (private mode): keep in-memory value
    }
    this.listeners.forEach((l) => l());
  },

  subscribe(listener: () => void) {
    watchlistStore.listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      watchlistStore.cache = null;
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      watchlistStore.listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
};

interface WatchlistContextValue {
  symbols: readonly string[];
  isWatched: (symbol: string) => boolean;
  toggle: (symbol: string) => void;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const symbols = useSyncExternalStore(
    watchlistStore.subscribe,
    () => watchlistStore.read(),
    () => EMPTY,
  );

  const isWatched = useCallback((symbol: string) => symbols.includes(symbol), [symbols]);

  const toggle = useCallback((symbol: string) => {
    const current = watchlistStore.read();
    watchlistStore.write(
      current.includes(symbol) ? current.filter((s) => s !== symbol) : [...current, symbol],
    );
  }, []);

  const value = useMemo(() => ({ symbols, isWatched, toggle }), [symbols, isWatched, toggle]);
  return <WatchlistContext value={value}>{children}</WatchlistContext>;
}

export function useWatchlist() {
  const context = use(WatchlistContext);
  if (!context) throw new Error("useWatchlist must be used within <WatchlistProvider>");
  return context;
}
