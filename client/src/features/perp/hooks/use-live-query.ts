"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { perpApi } from "../api/client";
import type { ChannelData, Subscription } from "../api/types";

interface LiveQueryOptions<T, S extends Subscription> {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  subscription: S | null;
  /** fold a stream event into cached snapshot */
  reduce: (prev: T, event: ChannelData[S["channel"]]) => T;
  enabled?: boolean;
  /** ms; for data with no stream event (funding rows are written by the indexer, not pushed) */
  refetchInterval?: number;
}

/** REST snapshot + WS deltas into one react-query cache entry; resubscribes on key change. */
export function useLiveQuery<T, S extends Subscription>({
  queryKey,
  queryFn,
  subscription,
  reduce,
  enabled = true,
  refetchInterval,
}: LiveQueryOptions<T, S>) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey, queryFn, enabled, staleTime: Infinity, refetchInterval });
  const subKey = JSON.stringify(subscription);
  const cacheKey = JSON.stringify(queryKey);

  // serialized deps so inline keys don't resubscribe; reduce must be module-level
  useEffect(() => {
    const sub = JSON.parse(subKey) as S | null;
    if (!enabled || !sub) return;
    const key = JSON.parse(cacheKey) as QueryKey;
    return perpApi.subscribe(sub, (event) => {
      qc.setQueryData<T>(key, (prev) => (prev === undefined ? prev : reduce(prev, event)));
    });
  }, [qc, subKey, cacheKey, enabled, reduce]);

  return query;
}
