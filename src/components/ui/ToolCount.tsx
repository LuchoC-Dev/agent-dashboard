import { int } from "../../lib/format";
import { errorText } from "./styles";

export function ToolCount({ calls, errors }: { calls: number; errors: number }) {
  return (
    <span className="whitespace-nowrap">
      {int(calls)}
      {errors > 0 && <span className={errorText}> · ⊗ {int(errors)}</span>}
    </span>
  );
}
