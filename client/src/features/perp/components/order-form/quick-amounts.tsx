import { cn } from "@/shared/lib/cn";
import { Slider } from "@/shared/ui/slider";

const MARKS = [0, 25, 50, 75, 100];

/** % of available margin at current leverage: slider + typed %. */
export function QuickAmounts({ value, onSelect, disabled, className }: { value: number; onSelect: (f: number) => void; disabled?: boolean; className?: string }) {
  return (
    <fieldset disabled={disabled} className={cn("flex items-start gap-3 disabled:opacity-40", className)}>
      <Slider
        bare
        label="Margin used"
        value={value}
        min={0}
        max={100}
        marks={MARKS}
        onChange={(v) => onSelect(v / 100)}
        tone="brand"
        formatValue={(v) => `${v}%`}
        className="flex-1"
      />
      <label className="flex h-8 w-16 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface px-2 text-xs text-fg focus-within:border-border-strong">
        <input
          aria-label="Margin used %"
          inputMode="numeric"
          autoComplete="off"
          placeholder="0"
          value={value || ""}
          onChange={(e) => onSelect(Math.min(100, Number(e.target.value.replace(/\D/g, ""))) / 100)}
          className="w-full min-w-0 bg-transparent text-right tabular-nums outline-none placeholder:text-fg-subtle"
        />
        <span className="text-fg-muted">%</span>
      </label>
    </fieldset>
  );
}
