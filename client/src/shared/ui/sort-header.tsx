import { cn } from "@/shared/lib/cn";

export interface SortState<K extends string> {
  key: K;
  direction: "asc" | "desc";
}

/** Next sort on header click: new key desc, same key flips. */
export const nextSort = <K extends string>(sort: SortState<K>, key: K): SortState<K> => ({
  key,
  direction: sort.key === key && sort.direction === "desc" ? "asc" : "desc",
});

interface SortHeaderProps<K extends string> {
  column: { key: K; label: string };
  sort: SortState<K>;
  onSort: (key: K) => void;
}

/** Right-aligned sortable column header for div grids. */
export function SortHeader<K extends string>({ column, sort, onSort }: SortHeaderProps<K>) {
  const active = sort.key === column.key;
  return (
    <div role="columnheader" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"} className="flex justify-end">
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={cn("label-mono flex items-center gap-1.5 transition-colors hover:text-fg", active ? "text-fg" : "text-fg-muted")}
      >
        {column.label}
        <span aria-hidden>{active ? (sort.direction === "desc" ? "↓" : "↑") : "⇅"}</span>
      </button>
    </div>
  );
}
