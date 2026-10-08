/** Color key: a 9 px square, or an 8 px dot for models. */
export function Swatch({
  color,
  dot = false,
  rounded = "rounded-[2px]",
  className = "",
}: {
  color: string;
  dot?: boolean;
  /** Corner radius of the square key. */
  rounded?: string;
  className?: string;
}) {
  return (
    <i
      className={
        "inline-block flex-none " +
        (dot ? "size-2 rounded-full " : "size-[9px] " + rounded + " ") +
        className
      }
      style={{ background: color }}
    />
  );
}
