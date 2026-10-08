import { useOutletContext } from "react-router";
import type { SessionDetail } from "../../bindings/SessionDetail";
import type { Palette } from "../../lib/colors";
import type { Focus } from "./focus";

/** What the `/sesion/:id` layout route hands to its tab routes. */
export type SessionContext = {
  detail: SessionDetail;
  colors: Palette;
  /** Open the conversation tab on a message, call or subagent. */
  onFocus: (f: Focus) => void;
};
export const useSession = () => useOutletContext<SessionContext>();
