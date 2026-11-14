const GRID = 5;
const HALF = Math.ceil(GRID / 2);

export interface PixelAvatar {
  /** row-major cells, mirrored left/right */
  cells: boolean[];
  fg: string;
  bg: string;
}

// fnv-1a over the lowercased address, so checksum casing doesn't change the art
function hash(input: string) {
  let h = 0x811c9dc5;
  for (const ch of input.toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}

/** Deterministic 5x5 symmetric pixel avatar for an address. */
export function pixelAvatar(address: string): PixelAvatar {
  let h = hash(address);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = (h ^ (h >>> 12)) >>> 0;
    return h;
  };
  const hue = next() % 360;
  const half = Array.from({ length: GRID * HALF }, () => next() % 100 < 50);
  const cells = Array.from({ length: GRID * GRID }, (_, i) => {
    const row = Math.floor(i / GRID);
    const col = i % GRID;
    return half[row * HALF + Math.min(col, GRID - 1 - col)];
  });
  return { cells, fg: `hsl(${hue} 75% 62%)`, bg: `hsl(${hue} 35% 16%)` };
}

export const PIXEL_GRID = GRID;
