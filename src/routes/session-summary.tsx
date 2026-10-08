import { SessionOverview } from "../features/sessions/components/detail/SessionOverview";
import { useSession } from "../features/sessions/session-context";

/** Sesión › Resumen (index tab). */
export function Component() {
  const { detail, colors, onFocus } = useSession();
  return <SessionOverview detail={detail} colors={colors} onFocus={onFocus} />;
}
