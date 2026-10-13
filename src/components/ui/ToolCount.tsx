import { int } from "../../lib/format";
import { errorText } from "./styles";

/**
 * Tool calls with their errors. The error marker goes before the count, so counts stay
 * right-aligned in a numeric column whether a row has errors or not.
 */
export function ToolCount({ calls, errors }: { calls: number; errors: number }) {
  return (
    <span className="whitespace-nowrap">
      {errors > 0 && (
        <>
          <span className={errorText}>⊗ {int(errors)}</span>
          <span className="text-ink-3"> · </span>
        </>
      )}
      {int(calls)}
    </span>
  );
}
