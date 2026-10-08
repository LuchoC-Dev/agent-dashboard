import type { Provider } from "../../bindings/Provider";
import { Segments } from "../../components/ui/Segments";
import { providerLabel } from "../../lib/providers";

/** Todos · Claude · Codex. Only rendered when more than one provider has sessions. */
export function ProviderControl({
  value,
  providers,
  onChange,
}: {
  value: Provider | null;
  providers: Provider[];
  onChange: (p: Provider | null) => void;
}) {
  return (
    <Segments
      label="Proveedor"
      value={value ?? "all"}
      options={[
        ["all", "Todos"],
        ...providers.map((p) => [p, providerLabel(p)] as const),
      ]}
      onChange={(v) => onChange(v === "all" ? null : (v as Provider))}
    />
  );
}
