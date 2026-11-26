import type { CSSProperties } from "react";

/** A single continuous beam; neighbouring card colours blend at their edges without gaps or separate pieces. */
export default function ProgressBeam({ colors, progress = 1 }: { colors: string[]; progress?: number }) {
  const stops: string[] = [];
  for (let start = 0; start < colors.length;) {
    let end = start + 1;
    while (end < colors.length && colors[end] === colors[start]) end++;
    const left = start === 0 ? 0 : (start + 0.16) / colors.length * 100;
    const right = end === colors.length ? 100 : (end - 0.16) / colors.length * 100;
    stops.push(colors[start] + " " + left.toFixed(3) + "%", colors[start] + " " + right.toFixed(3) + "%");
    start = end;
  }
  const style: CSSProperties & { "--beam-colors": string } = {
    width: Math.max(0, Math.min(1, progress)) * 100 + "%",
    "--beam-colors": stops.length ? "linear-gradient(90deg, " + stops.join(", ") + ")" : "var(--known-ink)",
  };
  return <div className="meter progress-beam" aria-hidden="true"><i style={style} /></div>;
}
