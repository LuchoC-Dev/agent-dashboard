import { useSearchParams } from "react-router";
import { SessionConversation } from "../features/sessions/components/detail/SessionConversation";
import { focusFrom } from "../features/sessions/focus";
import { useSession } from "../features/sessions/session-context";

/** Sesión › Conversación (`?msg=`, `?call=` or `?sub=` focus a target). */
export function Component() {
  const { detail, colors, onFocus } = useSession(),
    [params] = useSearchParams();
  return (
    <SessionConversation
      detail={detail}
      colors={colors}
      focus={focusFrom(params)}
      onFocus={onFocus}
    />
  );
}
