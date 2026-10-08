import type { Provider } from "../bindings/Provider";
import type { ScanReport } from "../bindings/ScanReport";
import type { SessionSummary } from "../bindings/SessionSummary";

/** Display order: the default provider first. */
export const PROVIDERS = ["claude", "codex"] as const satisfies readonly Provider[];

export const providerLabel = (p: Provider) => (p === "codex" ? "Codex" : "Claude");
/** Static per-provider color, for comparing providers in one chart. */
export const providerColor = (p: string) => `var(--color-provider-${p})`;
export const isProvider = (v: string | null): v is Provider =>
  PROVIDERS.includes(v as Provider);

/**
 * Providers with sessions: from the scan report when it lists its sources, otherwise from the
 * sessions themselves. In display order. A source still being scanned counts while it is
 * installed, so the provider control is there from the first screen.
 */
export function activeProviders(
  report: ScanReport | undefined,
  sessions: SessionSummary[] | undefined,
): Provider[] {
  const found = report?.sources
    ? report.sources
        .filter(
          (s) =>
            s.available &&
            (s.sessions > 0 || (s.scanning ?? report.scanning === true)),
        )
        .map((s) => s.provider)
    : (sessions ?? []).map((s) => s.provider);
  return PROVIDERS.filter((p) => found.includes(p));
}

/** Sessions of one provider; all of them when `provider` is null. */
export const scope = <T extends { provider: Provider }>(
  sessions: T[],
  provider: Provider | null,
) => (provider ? sessions.filter((s) => s.provider === provider) : sessions);
