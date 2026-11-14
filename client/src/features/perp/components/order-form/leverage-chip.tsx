import { useDisclosure } from "@/shared/hooks/use-disclosure";
import { cn } from "@/shared/lib/cn";
import { LeverageModal } from "./leverage-modal";

interface LeverageChipProps {
  symbol: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  className?: string;
}

/** Whole-cell leverage button, big centered "10X"; opens the leverage modal. */
export function LeverageChip({ symbol, value, max, onChange, className }: LeverageChipProps) {
  const { isOpen, open, close } = useDisclosure();
  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-label={`Leverage ${value}x`}
        aria-haspopup="dialog"
        onClick={open}
        className="focus-ring flex h-full w-full items-center justify-center text-3xl font-semibold tracking-tight text-fg tabular-nums transition-colors hover:bg-surface-raised/60"
      >
        {value}X
      </button>
      <LeverageModal open={isOpen} symbol={symbol} value={value} max={max} onConfirm={onChange} onClose={close} />
    </div>
  );
}
