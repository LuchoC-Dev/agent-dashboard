import type { Usage } from "../../bindings/Usage";
import type { TokenKind } from "../../lib/filters";
import { tok } from "../../lib/format";
import { tokenKinds } from "../../lib/usage";
import { Legend } from "./Legend";
import { ShareBar } from "./ShareBar";

/**
 * Token mix as a share bar plus a legend with each kind's volume. With `onKind` each kind is
 * a cross-filter (bar segment and legend button); the `active` one stays lit.
 */
export function TokenBar({
  usage,
  compact = false,
  active = null,
  onKind,
}: {
  usage: Usage;
  compact?: boolean;
  active?: TokenKind | null;
  onKind?: (k: TokenKind) => void;
}) {
  return (
    <>
      <ShareBar
        parts={tokenKinds.map(([k, label, color]) => ({
          key: k,
          label,
          color,
          value: usage[k],
          dim: !!active && active !== k,
        }))}
        onPart={onKind && ((k) => onKind(k as TokenKind))}
        format={tok}
        actionHint={active ? "Click: quitar o cambiar el tipo" : "Click: contar solo este tipo"}
      />
      <Legend
        compact={compact}
        onItem={onKind && ((k) => onKind(k as TokenKind))}
        items={tokenKinds.map(([k, l, c]) => ({
          key: k,
          color: c,
          pressed: active === k,
          title: onKind && "Contar solo " + l.toLowerCase(),
          // Separate text nodes, as before: shaping one string kerns differently.
          label: (
            <>
              {l} {tok(usage[k])}
            </>
          ),
        }))}
      />
    </>
  );
}
