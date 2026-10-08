import type { Provider } from "../bindings/Provider";
import type { ScanReport } from "../bindings/ScanReport";
import type { SourceScan } from "../bindings/SourceScan";
import { PROVIDERS } from "./providers";

const sourcesOf = (report: ScanReport): SourceScan[] => report.sources ?? [];

/** A directory for display, without Windows' extended-length prefix (`\\?\`, `\\?\UNC\`). */
export const displayDir = (dir: string) =>
  dir.replace(/^\\\\\?\\UNC\\/, "\\\\").replace(/^\\\\\?\\/, "");

/**
 * Every directory the scan reads (one per source: Codex may read several homes, contract
 * v2.5), optionally of one provider; the single `sourceDir` of a report without sources.
 */
export function sourceDirs(report: ScanReport | undefined, provider: Provider | null = null) {
  if (!report) return undefined;
  const sources = sourcesOf(report);
  if (!sources.length) return [report.sourceDir];
  return sources
    .filter((s) => s.available && (!provider || s.provider === provider))
    .map((s) => displayDir(s.sourceDir));
}

/**
 * Whether one source is still being scanned. `SourceScan.scanning` is contract v2.2; a backend
 * without it only reports the global flag.
 */
export const sourceScanning = (report: ScanReport, source: SourceScan) =>
  source.scanning ?? report.scanning === true;

/**
 * Whether the data of `provider` (null = every provider) is final: no source in that scope is
 * still scanning. Unknown (no report yet) counts as not final.
 */
export function scopeDone(report: ScanReport | undefined, provider: Provider | null) {
  if (!report) return false;
  const sources = sourcesOf(report);
  if (!sources.length) return report.scanning !== true;
  return sources
    .filter((s) => !provider || s.provider === provider)
    .every((s) => !sourceScanning(report, s));
}

/**
 * The providers whose scan has finished (every source of theirs: Codex may read several
 * homes, contract v2.5), in display order: part of the session list's query key, so a
 * provider that finishes refetches the list instead of trusting a partial one.
 */
export function scanSignature(report: ScanReport | undefined): string | null {
  if (!report) return null;
  const sources = sourcesOf(report);
  if (!sources.length) return report.scanning ? "" : "listo";
  return PROVIDERS.filter((p) => {
    const own = sources.filter((s) => s.provider === p);
    return own.length > 0 && own.every((s) => !sourceScanning(report, s));
  }).join(",");
}
