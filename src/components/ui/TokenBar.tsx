import type { CostBreakdown } from "../../bindings/CostBreakdown";
import type { Usage } from "../../bindings/Usage";
import type { TokenKind } from "../../lib/filters";
import { tok, usd } from "../../lib/format";
import { costOf, costSplit, tokenKinds } from "../../lib/usage";
import { Legend } from "./Legend";
import { ShareBar } from "./ShareBar";

/**
 * One value per token kind as a share bar plus a legend with each kind's amount, in the
 * kinds' order and colors. With `onKind` each kind is a cross-filter (bar segment and legend
 * button); the `active` one stays lit.
 */
function KindBar({
  value,
  format,
  compact,
  active,
  onKind,
}: {
  value: (k: TokenKind, costKey: keyof CostBreakdown) => number;
  format: (n: number) => string;
  compact: boolean;
  active: TokenKind | null;
  onKind?: (k: TokenKind) => void;
}) {
  return (
    <>
      <ShareBar
        parts={tokenKinds.map(([k, label, color, ck]) => ({
          key: k,
          label,
          color,
          value: value(k, ck),
          dim: !!active && active !== k,
        }))}
        onPart={onKind && ((k) => onKind(k as TokenKind))}
        format={format}
        actionHint={active ? "Click: quitar o cambiar el tipo" : "Click: contar solo este tipo"}
      />
      <Legend
        compact={compact}
        onItem={onKind && ((k) => onKind(k as TokenKind))}
        items={tokenKinds.map(([k, l, c, ck]) => ({
          key: k,
          color: c,
          pressed: active === k,
          title: onKind && "Contar solo " + l.toLowerCase(),
          // Separate text nodes, as before: shaping one string kerns differently.
          label: (
            <>
              {l} {format(value(k, ck))}
            </>
          ),
        }))}
      />
    </>
  );
}

type KindProps = {
  compact?: boolean;
  active?: TokenKind | null;
  onKind?: (k: TokenKind) => void;
};

/** Token mix: each kind's volume. */
export function TokenBar({ usage, compact = false, active = null, onKind }: KindProps & { usage: Usage }) {
  return (
    <KindBar value={(k) => usage[k]} format={tok} compact={compact} active={active} onKind={onKind} />
  );
}

/**
 * Cost by token kind, built like `TokenBar`. Amounts are rounded to cents so they add up to
 * `total` as shown (by default the breakdown's own sum).
 */
export function CostBar({
  cost,
  total = costOf(cost),
  compact = false,
  active = null,
  onKind,
}: KindProps & { cost: CostBreakdown; total?: number }) {
  const split = costSplit(cost, total);
  return (
    <KindBar value={(_, ck) => split[ck]} format={usd} compact={compact} active={active} onKind={onKind} />
  );
}
