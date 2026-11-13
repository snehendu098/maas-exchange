"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { nextSort, type SortState } from "@/shared/ui/sort-header";
import { leaderboardApi } from "../api";
import type { LeaderboardRange } from "../api/types";
import { DEFAULT_SORT, rankTraders, searchTraders, sortTraders, summarize, type LeaderboardSortKey } from "../lib/ranking";

/** Ranked traders for a range + table sort/search state. */
export function useLeaderboard() {
  const [range, setRange] = useState<LeaderboardRange>("30d");
  const [sort, setSort] = useState<SortState<LeaderboardSortKey>>(DEFAULT_SORT);
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", range],
    queryFn: () => leaderboardApi.getTraders(range),
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });

  const ranked = useMemo(() => rankTraders(data ?? []), [data]);
  const rows = useMemo(() => sortTraders(searchTraders(ranked, query), sort), [ranked, query, sort]);
  const summary = useMemo(() => summarize(data ?? []), [data]);

  return {
    range,
    setRange,
    sort,
    onSort: (key: LeaderboardSortKey) => setSort((s) => nextSort(s, key)),
    query,
    setQuery,
    rows,
    summary,
    isLoading,
  };
}
