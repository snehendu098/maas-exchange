"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { buildSearchItems, filterSearchItems, wrapIndex, type SearchItem } from "@/shared/lib/search-items";

const ITEMS = buildSearchItems();

/** ⌘K palette state: open, query, highlighted row, keyboard nav. */
export function useCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => filterSearchItems(ITEMS, query), [query]);

  // ⌘K / ctrl+K toggles from anywhere
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  const select = (item: SearchItem | undefined) => {
    if (!item) return;
    router.push(item.href);
    close();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => wrapIndex(i, e.key === "ArrowDown" ? 1 : -1, results.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(results[active]);
    } else if (e.key === "Escape") {
      close();
    }
  };

  return {
    open,
    show: () => setOpen(true),
    close,
    query,
    setQuery: (q: string) => {
      setQuery(q);
      setActive(0);
    },
    results,
    active,
    setActive,
    select,
    onKeyDown,
  };
}
