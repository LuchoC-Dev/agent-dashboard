import { useLocation, useNavigate, useSearchParams } from "react-router";
import type { Provider } from "../bindings/Provider";
import { isProvider } from "../lib/providers";

/** `?proveedor=claude|codex` scopes every screen to one provider; absent = all of them. */
export const providerOf = (params: URLSearchParams): Provider | null => {
  const v = params.get("proveedor");
  return isProvider(v) ? v : null;
};

export function useProvider() {
  const [params] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate();
  const setProvider = (p: Provider | null) => {
    const next = new URLSearchParams(location.search);
    if (p) next.set("proveedor", p);
    else next.delete("proveedor");
    navigate({ pathname: location.pathname, search: next.toString() });
  };
  return { provider: providerOf(params), setProvider };
}
