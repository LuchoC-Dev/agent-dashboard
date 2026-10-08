import { Link } from "react-router";
import { MessageState } from "../components/ui/states";

export function Component() {
  return (
    <MessageState title="No encontramos esta página">
      <Link to="/resumen">Volver al resumen</Link>
    </MessageState>
  );
}
