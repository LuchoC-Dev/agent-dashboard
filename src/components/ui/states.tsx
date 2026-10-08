import type { ReactNode } from "react";
import { RangeLink as Link } from "../RangeLink";
import { Icon } from "./Icon";
import { button } from "./styles";

const state =
  "mx-auto flex max-w-[520px] flex-col items-center gap-2.5 px-6 py-14 text-center";
const title = "mt-1 text-size-lg font-semibold";
const body = "text-size-sm text-ink-2";
const fine = "mt-1 inline-flex items-center gap-1.5 text-size-xs text-ink-3";
const icon = "grid size-10 place-items-center rounded-full";

/** Centered message for empty ranges and missing pages/projects. */
export function MessageState({
  title: heading,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={state}>
      <h2 className={title}>{heading}</h2>
      {children}
    </div>
  );
}
export function StateText({ children }: { children: ReactNode }) {
  return <p className={body}>{children}</p>;
}
/** A path or id the user may need to check, in monospace. */
export function StatePath({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-sm bg-sunken px-2 py-[3px] font-mono text-[12px] wrap-anywhere text-ink">
      {children}
    </span>
  );
}

export function LoadingState() {
  return (
    <div role="status" aria-live="polite">
      <div className={state}>
        <span className={icon + " bg-sunken text-ink-2"}>
          <Icon name="refresh" spin />
        </span>
        <h2 className={title}>Escaneando sesiones…</h2>
        <p className={body}>
          Leyendo archivos locales. El primer escaneo puede tardar unos
          segundos.
        </p>
        <progress
          className="h-1 w-[280px] overflow-hidden rounded-[2px] bg-line"
          aria-label="Escaneo en curso"
        />
      </div>
      <div className="skel h-[130px]" />
      <div className="skel mt-4 h-[270px]" />
    </div>
  );
}

export function EmptyState({
  paths = ["~/.claude/projects"],
  onRefresh,
}: {
  /** Every directory read, one line each. */
  paths?: string[];
  onRefresh: () => void;
}) {
  return (
    <div className={state}>
      <span className={icon + " bg-sunken text-ink-2"}>
        <Icon name="folder" />
      </span>
      <h2 className={title}>No encontramos sesiones</h2>
      <p className={body}>
        {paths.length > 1
          ? "Revisá las carpetas que estamos leyendo."
          : "Revisá la carpeta que estamos leyendo."}
      </p>
      {paths.map((p) => (
        <StatePath key={p}>{p}</StatePath>
      ))}
      <button className={button()} onClick={onRefresh}>
        Refrescar
      </button>
      <p className={fine}>
        <Icon name="lock" />
        Solo lectura · No modifica ningún archivo.
      </p>
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const e = error as { kind?: string; message?: string };
  const notFound = e?.kind === "notFound";
  return (
    <div className={state} role="alert">
      <span className={icon + " bg-error-wash text-error"}>
        <Icon name="alert" />
      </span>
      <h2 className={title}>
        {notFound ? "No encontramos esta sesión" : "No pudimos leer los archivos"}
      </h2>
      <p className={body}>
        {notFound
          ? "Puede que el archivo ya no esté en la carpeta."
          : "Revisá los permisos de la carpeta y volvé a intentar."}
      </p>
      <div className="w-full rounded-sm border border-[color-mix(in_srgb,var(--color-error-mark)_35%,transparent)] bg-error-wash px-2.5 py-2 text-left font-mono text-[11.5px] wrap-anywhere text-error">
        {e?.message || String(error)}
      </div>
      <div className="mt-1.5 flex gap-2">
        <Link className={button()} to="/sesiones">
          Volver a sesiones
        </Link>
        <button className={button()} onClick={onRetry}>
          Reintentar
        </button>
      </div>
      <p className={fine}>Solo lectura · No modifica ningún archivo.</p>
    </div>
  );
}
