import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { DateRange } from "../../../bindings/DateRange";
import type { Provider } from "../../../bindings/Provider";
import type { SessionSummary } from "../../../bindings/SessionSummary";
import { paginationBar } from "../../../components/ui/Pagination";
import {
  button,
  field,
  filters,
  panel,
  summary,
  textLink,
} from "../../../components/ui/styles";
import { useFixture } from "../../../hooks/useFixture";
import type { Palette } from "../../../lib/colors";
import { modelArgs } from "../../../lib/filters";
import { int, usd } from "../../../lib/format";
import {
  familyFilter,
  familyLabel,
  filterLabel,
  MODEL_FAMILIES,
  parseModel,
} from "../../../lib/models";
import { keyOfPath } from "../../../lib/projects";
import { withToolCounts } from "../../../lib/sessions";
import { filterSessions } from "../filters";
import { sessionQueries } from "../queries";
import { DurationHistogram } from "./DurationHistogram";
import { SessionsTable } from "./SessionsTable";

const FILTERS = ["q", "proyecto", "modelo", "herramienta"] as const;

/**
 * Sesiones: search, project and model (or model family) filters live in the URL, and so does a
 * tool (`herramienta`, from Resumen): only the sessions that called it, through the backend's
 * list, with the tool column counting only its calls (contracts v2.6 and v2.6.1).
 */
export function SessionsList({
  sessions,
  all,
  colors,
  range,
  provider,
}: {
  sessions: SessionSummary[];
  all: SessionSummary[];
  colors: Palette;
  range: DateRange;
  provider: Provider | null;
}) {
  const [params, setParams] = useSearchParams();
  // A pre-v2.5 link carries a working-copy path: it selects that path's project.
  const proyecto = params.get("proyecto") || "";
  const q = params.get("q") || "",
    project = proyecto && (keyOfPath(proyecto, all) ?? proyecto),
    model = params.get("modelo") || "",
    tool = params.get("herramienta") || null;
  const fixture = useFixture();
  const called = useQuery({
    ...sessionQueries.slot(range, provider, fixture, {
      projectKey: project || null,
      tool,
      ...modelArgs(model || null, colors.models),
    }),
    enabled: !!tool,
  });
  const shown = tool ? withToolCounts(sessions, called.data ?? []) : sessions;
  const filtered = filterSessions(shown, { q, project, model }),
    filtering = !!(q || project || model || tool);
  const update = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    // Typing replaces the entry; a picked filter is a new one, so Back restores the previous.
    setParams(p, { replace: key === "q" });
  };
  const clear = () => {
    const p = new URLSearchParams(params);
    FILTERS.forEach((k) => p.delete(k));
    setParams(p);
  };
  return (
    <>
      <div className={filters}>
        <input
          className={field}
          aria-label="Buscar sesiones"
          placeholder="Buscar título, prompt o proyecto…"
          value={q}
          onChange={(e) => update("q", e.target.value)}
        />
        <select
          className={field + " pr-6"}
          aria-label="Proyecto"
          value={project}
          onChange={(e) => update("proyecto", e.target.value)}
        >
          <option value="">Todos los proyectos</option>
          {colors.projects.map((p) => (
            <option key={p} value={p}>
              {colors.projectName(p)}
            </option>
          ))}
        </select>
        <select
          className={field + " pr-6"}
          aria-label="Modelo"
          value={model}
          onChange={(e) => update("modelo", e.target.value)}
        >
          <option value="">Todos los modelos</option>
          {MODEL_FAMILIES.map((f) => {
            const versions = colors.models.filter((m) => parseModel(m).family === f);
            // The family itself is the group's first option: every version at once.
            return (
              versions.length > 0 && (
                <optgroup label={familyLabel(f)} key={f}>
                  <option value={familyFilter(f)}>{filterLabel(familyFilter(f))}</option>
                  {versions.map((m) => (
                    <option key={m} value={m}>
                      {parseModel(m).name}
                    </option>
                  ))}
                </optgroup>
              )
            );
          })}
        </select>
        {tool && (
          <button
            className={button({ size: "sm" })}
            title="Quitar el filtro de herramienta"
            onClick={() => update("herramienta", "")}
          >
            Herramienta: {tool} ✕
          </button>
        )}
        {filtering && (
          <button className={button({ size: "sm", ghost: true })} onClick={clear}>
            Limpiar filtros
          </button>
        )}
        <span className="flex-1" />
        <span className={summary}>
          <b className="font-semibold text-ink">{int(filtered.length)}</b> sesiones ·{" "}
          {usd(filtered.reduce((n, s) => n + s.costUsd, 0))}
        </span>
      </div>
      <div className={panel}>
        {tool && !called.data ? (
          <div className={paginationBar}>Cargando…</div>
        ) : (
          <SessionsTable sessions={filtered} colors={colors} tool={tool} />
        )}
        {!filtered.length && filtering && (
          <div className={paginationBar}>
            <button className={button()} onClick={clear}>
              Limpiar filtros
            </button>
          </div>
        )}
      </div>
      <details>
        <summary className={textLink}>Ver distribución de duración</summary>
        <DurationHistogram sessions={filtered} />
      </details>
    </>
  );
}
