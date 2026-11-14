import { cn } from "@/shared/lib/cn";
import { Checkbox } from "@/shared/ui/checkbox";
import { SelectMenu } from "@/shared/ui/select-menu";
import type { TimeInForce } from "../../api/types";

const TIFS = [
  { value: "TIME_IN_FORCE_GTC", label: "GTC" },
  { value: "TIME_IN_FORCE_IOC", label: "IOC" },
  { value: "TIME_IN_FORCE_POST_ONLY", label: "Post only" },
] as const satisfies ReadonlyArray<{ value: TimeInForce; label: string }>;

interface OrderOptionsProps {
  reduceOnly: boolean;
  onReduceOnly: (v: boolean) => void;
  /** limit only; omitted = TIF hidden */
  tif?: TimeInForce;
  onTif: (v: TimeInForce) => void;
  className?: string;
}

export function OrderOptions({ reduceOnly, onReduceOnly, tif, onTif, className }: OrderOptionsProps) {
  return (
    <div className={cn("flex h-8 items-center justify-between gap-4", className)}>
      <Checkbox label="Reduce only" checked={reduceOnly} onChange={onReduceOnly} />
      {tif && (
        <div className="flex items-center gap-2 text-[13px] text-fg-muted">
          <span aria-hidden>TIF</span>
          <SelectMenu label="TIF" size="sm" align="right" options={TIFS} value={tif} onChange={onTif} />
        </div>
      )}
    </div>
  );
}
