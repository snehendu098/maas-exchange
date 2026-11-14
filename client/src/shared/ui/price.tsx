import { cn } from "@/shared/lib/cn";
import { formatNumber, formatPrice } from "@/shared/lib/format";

interface PriceProps {
  value: number;
  /** "" for a bare number */
  prefix?: string;
  /** fixed decimals; default picks by magnitude */
  decimals?: number;
  significant?: number;
  className?: string;
}

/** Leading zeros past the point, e.g. 0.00043 -> 3. */
function leadingZeros(value: number) {
  return value > 0 && value < 1 ? Math.max(0, -Math.floor(Math.log10(value)) - 1) : 0;
}

/** Tabular price; sub-cent values in subscript form: $0.0₃43. */
export function Price({ value, prefix = "$", decimals, significant = 4, className }: PriceProps) {
  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);
  const zeros = leadingZeros(magnitude);
  const classes = cn("tabular-nums", className);

  if (zeros < 3) {
    const text = decimals === undefined ? formatPrice(magnitude) : formatNumber(magnitude, decimals);
    return <span className={classes}>{`${sign}${prefix}${text}`}</span>;
  }

  const digits = Math.round(magnitude * 10 ** (zeros + significant)).toString();
  return (
    <span className={classes}>
      {sign}
      {prefix}0.0<sub className="text-[0.72em]">{zeros}</sub>
      {digits}
    </span>
  );
}
