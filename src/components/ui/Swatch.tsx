/**
 * Color key of a data series: a 9 px square for every dimension (provider, project, model,
 * token kind), matching the chart bars it keys. Data colors, never the app accent.
 */
export function Swatch({ color, className = "" }: { color: string; className?: string }) {
  return (
    <i
      className={"inline-block size-[9px] flex-none rounded-[2px] " + className}
      style={{ background: color }}
    />
  );
}
