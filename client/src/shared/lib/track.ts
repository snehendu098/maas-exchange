/** Track percent for a value, marks spread evenly. */
export function percentFor(value: number, marks: readonly number[]) {
  const gaps = marks.length - 1;
  if (gaps < 1) return 0;
  for (let i = 0; i < gaps; i++) {
    const [low, high] = [marks[i], marks[i + 1]];
    if (value <= high) return ((i + Math.max(0, value - low) / (high - low)) / gaps) * 100;
  }
  return 100;
}

/** Rounded value under a track percent; inverse of percentFor. */
export function valueAt(percent: number, marks: readonly number[]) {
  const gaps = marks.length - 1;
  if (gaps < 1) return marks[0] ?? 0;
  const along = (Math.min(100, Math.max(0, percent)) / 100) * gaps;
  const i = Math.min(Math.floor(along), gaps - 1);
  return Math.round(marks[i] + (along - i) * (marks[i + 1] - marks[i]));
}
