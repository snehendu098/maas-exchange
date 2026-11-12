/** Per-character roll: a char re-animates only when it changes (keyed by value). */
export default function Roll({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`roll ${className}`} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span key={`${i}-${ch}`} className="roll-c" aria-hidden="true">
          {ch}
        </span>
      ))}
    </span>
  );
}
