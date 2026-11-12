"use client";

import { useEffect, useRef } from "react";
import { Search } from "./Icons";

/** Search input; ⌘/Ctrl + / focuses it. */
export default function SearchBox() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <label className="search">
      <Search className="ico" />
      <input ref={ref} type="text" placeholder="Search markets, txs..." />
      <kbd>⌘ + /</kbd>
    </label>
  );
}
