"use client";

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { WatchlistProvider } from "@/features/watchlist/watchlist-provider";
import { Toaster } from "@/shared/ui/toast/toaster";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  const make = () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1 } } });
  if (typeof window === "undefined") return make();
  browserQueryClient ??= make();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <WatchlistProvider>
        <MotionConfig reducedMotion="user">
          {children}
          <Toaster />
        </MotionConfig>
      </WatchlistProvider>
    </QueryClientProvider>
  );
}
