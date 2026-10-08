import { Link, type LinkProps } from "react-router";
import { useDateRange } from "../hooks/useDateRange";
import { useProvider } from "../hooks/useProvider";
import { withRange } from "../lib/navigation";

/** A link that carries the current date range and provider into the target URL. */
export function RangeLink(props: LinkProps) {
  const { range } = useDateRange(),
    { provider } = useProvider();
  return (
    <Link
      {...props}
      to={typeof props.to === "string" ? withRange(props.to, range, provider) : props.to}
    />
  );
}
