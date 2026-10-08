import type { DateRange } from "../../bindings/DateRange";
import type { Provider } from "../../bindings/Provider";
import { RangeLink as Link } from "../../components/RangeLink";
import { Icon } from "../../components/ui/Icon";
import { button } from "../../components/ui/styles";
import { DateRangeControl } from "./DateRangeControl";
import { ProviderControl } from "./ProviderControl";
import { useHistoryNav } from "./useHistoryNav";
import { useRouteHandle } from "./route-handle";
import { useNow } from "./useShellData";

const navButton =
  "grid size-[30px] flex-none cursor-pointer place-items-center rounded-sm border-0 bg-transparent text-ink-2 hover:bg-sunken hover:text-ink disabled:cursor-default disabled:text-ink-4 disabled:hover:bg-transparent";

/** Back and Forward through the app's history (filters included); disabled at either end. */
function HistoryButtons() {
  const { canBack, canForward, back, forward } = useHistoryNav();
  return (
    <div className="-ml-2 flex flex-none items-center" role="group" aria-label="Historial">
      <button
        type="button"
        className={navButton}
        aria-label="Atrás"
        title="Atrás (Alt+←)"
        disabled={!canBack}
        onClick={back}
      >
        <Icon name="chevron" className="rotate-180" />
      </button>
      <button
        type="button"
        className={navButton}
        aria-label="Adelante"
        title="Adelante (Alt+→)"
        disabled={!canForward}
        onClick={forward}
      >
        <Icon name="chevron" />
      </button>
    </div>
  );
}

function ScanStatus({
  busy,
  failed,
  scannedAt,
}: {
  busy: boolean;
  failed: boolean;
  scannedAt: number | null;
}) {
  const now = useNow(30000),
    minutes =
      scannedAt !== null
        ? Math.max(0, Math.floor((now - scannedAt) / 60000))
        : null;
  return (
    <div
      className="flex items-center gap-1.5 text-size-xs whitespace-nowrap text-ink-3 phone:hidden"
      role="status"
      aria-live="polite"
    >
      {busy ? (
        <>
          <Icon name="refresh" spin />
          Escaneando…{" "}
          <progress
            aria-label="Escaneo en curso"
            className="h-1 w-16 accent-accent"
          />
        </>
      ) : failed ? (
        <span className="inline-flex items-center gap-1.5 font-medium text-error">
          <Icon name="alert" />
          Error al escanear
        </span>
      ) : (
        <>
          ✓{" "}
          {minutes !== null
            ? `Escaneado hace ${minutes} min`
            : "Escaneo completo"}
        </>
      )}
    </div>
  );
}

export function Topbar({
  range,
  onRange,
  provider,
  providers,
  onProvider,
  scanning,
  refreshing,
  scanFailed,
  scannedAt,
  onRefresh,
}: {
  range: DateRange;
  onRange: (r: DateRange) => void;
  provider: Provider | null;
  providers: Provider[];
  onProvider: (p: Provider | null) => void;
  scanning: boolean;
  refreshing: boolean;
  scanFailed: boolean;
  scannedAt: number | null;
  onRefresh: () => void;
}) {
  const { title, detail } = useRouteHandle();
  return (
    <header className="flex h-(--topbar-h) flex-none items-center gap-3 border-b border-line bg-page px-5 compact:px-3 phone:h-auto phone:min-h-(--topbar-h) phone:flex-wrap phone:gap-x-2 phone:gap-y-2 phone:py-2">
      {/* On a phone the title (after Back/Forward) takes its own row above the date controls. */}
      <div
        className={
          "flex min-w-0 items-center gap-1.5 text-size-lg font-semibold" +
          (detail ? "" : " phone:w-full")
        }
      >
        <HistoryButtons />
        {detail && (
          <>
            <Link className="font-medium text-ink-3" to="/sesiones">
              Sesiones
            </Link>
            <span className="font-normal text-ink-4">/</span>
          </>
        )}
        <span className="truncate">{title}</span>
      </div>
      <span className="flex-1" />
      {!detail && providers.length > 1 && (
        <ProviderControl
          value={provider}
          providers={providers}
          onChange={onProvider}
        />
      )}
      {!detail && <DateRangeControl range={range} onChange={onRange} />}
      <ScanStatus
        busy={refreshing || scanning}
        failed={scanFailed}
        scannedAt={scannedAt}
      />
      <button
        className={button()}
        title="Vuelve a leer los archivos · no modifica nada"
        aria-label="Refrescar"
        disabled={refreshing}
        onClick={onRefresh}
      >
        <Icon name="refresh" spin={refreshing} />
        <span className="phone:hidden">Refrescar</span>
      </button>
    </header>
  );
}
