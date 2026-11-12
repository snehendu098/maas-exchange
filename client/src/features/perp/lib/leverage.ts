const STOPS = [1, 2, 5, 10, 20, 50];

/** Even stops below the market cap, then the cap. */
export function leverageMarks(max: number) {
  return [...STOPS.filter((m) => m < max), max];
}
