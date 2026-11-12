import { cn } from "@/shared/lib/cn";
import { PIXEL_GRID, pixelAvatar } from "@/shared/lib/pixel-avatar";

/** Pixel pfp seeded by the address. */
export function AddressAvatar({ address, className }: { address: string; className?: string }) {
  const { cells, fg, bg } = pixelAvatar(address);
  return (
    <svg
      viewBox={`-0.5 -0.5 ${PIXEL_GRID + 1} ${PIXEL_GRID + 1}`}
      aria-hidden
      shapeRendering="crispEdges"
      className={cn("size-9 shrink-0 rounded-lg", className)}
      style={{ background: bg }}
    >
      {cells.map((on, i) =>
        on ? <rect key={i} x={i % PIXEL_GRID} y={Math.floor(i / PIXEL_GRID)} width={1} height={1} fill={fg} /> : null,
      )}
    </svg>
  );
}
