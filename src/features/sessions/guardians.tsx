import { useSearchParams } from "react-router";
import type { SessionDetail } from "../../bindings/SessionDetail";
import { button } from "../../components/ui/styles";
import { isGuardian } from "./timeline";

/**
 * Codex guardian reviews are sub-agents of their session, cost included (D1). `?revisiones=ocultas`
 * hides them in both tabs; totals and KPIs keep counting them.
 */
export function useGuardians(detail: SessionDetail) {
  const [params, setParams] = useSearchParams();
  const count = detail.subagents.filter(isGuardian).length,
    hidden = count > 0 && params.get("revisiones") === "ocultas";
  const setHidden = (hide: boolean) => {
    const p = new URLSearchParams(params);
    if (hide) p.set("revisiones", "ocultas");
    else p.delete("revisiones");
    setParams(p);
  };
  return {
    count,
    hidden,
    setHidden,
    subagents: hidden
      ? detail.subagents.filter((a) => !isGuardian(a))
      : detail.subagents,
  };
}

/** Header button for the guardian toggle; nothing when the session has no reviews. */
export function GuardianToggle({
  guardians,
}: {
  guardians: ReturnType<typeof useGuardians>;
}) {
  if (!guardians.count) return null;
  return (
    <button
      className={button({ size: "sm", ghost: true })}
      aria-pressed={guardians.hidden}
      title="Revisiones automáticas de seguridad (guardian). Siguen contando en los totales."
      onClick={() => guardians.setHidden(!guardians.hidden)}
    >
      {guardians.hidden ? "Mostrar" : "Ocultar"} revisiones ({guardians.count})
    </button>
  );
}
