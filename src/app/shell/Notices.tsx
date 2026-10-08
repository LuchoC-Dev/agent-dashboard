import { useState } from "react";
import type { ScanReport } from "../../api";
import type { SessionSummary } from "../../bindings/SessionSummary";
import type { SourceScan } from "../../bindings/SourceScan";
import { Icon } from "../../components/ui/Icon";
import { button, mono, note } from "../../components/ui/styles";
import { hasDate } from "../../lib/dates";
import { int } from "../../lib/format";
import { providerLabel } from "../../lib/providers";
import { displayDir } from "../../lib/scan";

const banner =
  "flex items-center gap-2.5 rounded-md border border-[color-mix(in_srgb,var(--color-warn-mark)_40%,transparent)] bg-warn-wash px-3 py-2 text-size-sm text-ink";

const message = (error: unknown) =>
  String((error as { message?: string }).message || error);

/** Partial scan: some files could not be read; lists them on demand. */
function ScanErrors({
  errors,
  source,
}: {
  errors: ScanReport["errors"];
  /** The provider the files belong to, when the report has one part per source. */
  source?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!errors.length) return null;
  return (
    <div>
      <div className={banner} role="status">
        <Icon name="alert" className="text-warn" />
        <span>
          {source && <b className="font-semibold">{source}: </b>}
          {int(errors.length)}{" "}
          {errors.length === 1
            ? "archivo no se pudo leer"
            : "archivos no se pudieron leer"}
          . Las métricas incluyen solo las sesiones cargadas.
        </span>
        <button
          className={button({ size: "sm", ghost: true }) + " ml-auto"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Ocultar" : "Ver archivos"}
        </button>
      </div>
      {open && (
        <ul className="mt-1.5 flex flex-col gap-[3px] text-size-xs">
          {errors.map((e, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
              <span className={mono}>{e.path}</span>
              <span>{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A source's name on its notices: the provider, plus the directory when the provider reads
 * more than one (Codex homes, contract v2.5).
 */
export const sourceLabel = (sources: SourceScan[], src: SourceScan) =>
  sources.filter((s) => s.provider === src.provider).length > 1
    ? `${providerLabel(src.provider)} (${displayDir(src.sourceDir)})`
    : providerLabel(src.provider);

/** Page-level notices shown above every screen. */
export function Notices({
  all,
  detail,
  refreshError,
  report,
  reportError,
}: {
  all: SessionSummary[] | undefined;
  detail: boolean;
  refreshError: unknown;
  report: ScanReport | undefined;
  reportError: unknown;
}) {
  const undated = all?.filter((s) => !hasDate(s.startedAt)).length ?? 0;
  return (
    <>
      {undated > 0 && !detail && (
        <div className={note}>
          {undated}{" "}
          sesiones sin fecha registrada: aparecen en Sesiones con “Todo” y no
          entran en las métricas por fecha.
        </div>
      )}
      {!!refreshError && (
        <div className={banner} role="alert">
          No pudimos refrescar:{" "}
          {message(refreshError)}
        </div>
      )}
      {!!reportError && (
        <div className={banner} role="alert">
          No pudimos leer el reporte de escaneo:{" "}
          {message(reportError)}
        </div>
      )}
      {report?.sources ? (
        <>
          <ScanErrors
            errors={report.errors.filter((error) => !error.provider)}
            source="Escaneo"
          />
          {report.sources.map((src) => (
            <ScanErrors
              key={src.provider + src.sourceDir}
              errors={src.errors}
              source={sourceLabel(report.sources!, src)}
            />
          ))}
          {report.sources
            .filter((src) => !src.available && !detail)
            .map((src) => (
              <div key={src.provider + src.sourceDir} className={note}>
                {providerLabel(src.provider)}: no encontrado en{" "}
                <span className={mono}>{displayDir(src.sourceDir)}</span>
              </div>
            ))}
          {!!report.duplicatesMerged && !detail && (
            <div className={note}>
              Codex: {int(report.duplicatesMerged)}{" "}
              {report.duplicatesMerged === 1
                ? "hilo repetido entre carpetas se cuenta"
                : "hilos repetidos entre carpetas se cuentan"}{" "}
              una sola vez.
            </div>
          )}
        </>
      ) : (
        report && <ScanErrors errors={report.errors} />
      )}
    </>
  );
}
