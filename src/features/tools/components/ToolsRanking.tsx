import { Fragment, useState } from "react";
import { useSearchParams } from "react-router";
import type { ToolStat } from "../../../bindings/ToolStat";
import { RangeLink as Link } from "../../../components/RangeLink";
import { InlineBar } from "../../../components/ui/InlineBar";
import { Pagination } from "../../../components/ui/Pagination";
import { Panel } from "../../../components/ui/Panel";
import { ShareBar } from "../../../components/ui/ShareBar";
import {
  errorText,
  note,
  num,
  textLink,
} from "../../../components/ui/styles";
import { Swatch } from "../../../components/ui/Swatch";
import type { Palette } from "../../../lib/colors";
import { dur, int, pct } from "../../../lib/format";

const PAGE = 50;
const headers = [
  ["name", "Herramienta"],
  ["calls", "Llamadas"],
  ["errors", "Errores"],
  ["rate", "Tasa de error"],
  ["duration", "Duración prom."],
] as const;
type SortKey = (typeof headers)[number][0];

const value = (t: ToolStat, key: SortKey): number | string =>
  key === "name"
    ? t.name
    : key === "errors"
      ? t.errors
      : key === "rate"
        ? t.errorRate
        : key === "duration"
          ? t.avgDurationMs || 0
          : t.calls;

/** Calls per project for one tool, shown under its ranking row. */
function ToolBreakdown({
  tool,
  sessionCount,
  colors,
}: {
  tool: ToolStat;
  sessionCount: number;
  colors: Palette;
}) {
  return (
    <tr>
      <td colSpan={7} className="h-auto bg-sunken pt-1.5 pb-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-6 gap-y-1 pl-[38px] text-size-xs">
          {tool.byProject.map((p) => (
            <div key={p.key} className="flex items-center gap-2 tabular-nums">
              <Swatch color={colors.projectColor(p.key)} />
              <Link to={"/sesiones?" + new URLSearchParams({ proyecto: p.key })}>
                {p.label}
              </Link>
              <span className="ml-auto text-ink">{int(p.count)} llamadas</span>
            </div>
          ))}
        </div>
        <p className={note}>
          {sessionCount} sesiones en el rango.{" "}
          <Link to="/sesiones">Explorar sesiones →</Link>
        </p>
      </td>
    </tr>
  );
}

/** Sortable tool ranking; a row expands (`?tool=`) into its per-project breakdown. */
export function ToolsRanking({
  tools,
  projects,
  sessionCount,
  colors,
}: {
  tools: ToolStat[];
  projects: string[];
  sessionCount: number;
  colors: Palette;
}) {
  const [params, setParams] = useSearchParams(),
    selected = params.get("tool") || "",
    [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
      key: "calls",
      desc: true,
    }),
    [page, setPage] = useState(0);
  const sorted = [...tools].sort((a, b) => {
    const x = value(a, sort.key),
      y = value(b, sort.key);
    return (
      (typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y))) * (sort.desc ? -1 : 1)
    );
  });
  return (
    <Panel
      title="Ranking de herramientas"
      sub="Hacé click para ver por proyecto"
      flush
    >
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              {headers.map(([k, l]) => (
                <th
                  key={k}
                  className={k === "name" ? "" : num}
                  aria-sort={
                    sort.key === k
                      ? sort.desc
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <button
                    onClick={() => {
                      setSort({
                        key: k,
                        desc: sort.key === k ? !sort.desc : k !== "name",
                      });
                      setPage(0);
                    }}
                  >
                    {l} {sort.key === k ? (sort.desc ? "▼" : "▲") : ""}
                  </button>
                </th>
              ))}
              <th>Llamadas por proyecto</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(page * PAGE, (page + 1) * PAGE).map((t) => (
              <Fragment key={t.name}>
                <tr
                  className={
                    "link" + (selected === t.name ? " *:bg-sunken" : "")
                  }
                  onClick={() =>
                    setParams(selected === t.name ? {} : { tool: t.name })
                  }
                >
                  <td className="w-7 text-ink-3">
                    {tools.findIndex((x) => x.name === t.name) + 1}
                  </td>
                  <td className="font-mono text-[12px] font-semibold">
                    <button
                      className={textLink}
                      aria-expanded={selected === t.name}
                    >
                      {t.name}
                    </button>
                  </td>
                  <td className={num}>
                    <InlineBar
                      percent={(100 * t.calls) / (tools[0]?.calls || 1)}
                      color="var(--color-primary)"
                    >
                      {int(t.calls)}
                    </InlineBar>
                  </td>
                  <td className={num}>
                    <span className={t.errors ? errorText : "text-ink-3"}>
                      ⊗ {int(t.errors)}
                    </span>
                  </td>
                  <td className={num}>
                    <span className="inline-block h-[5px] w-11 overflow-hidden rounded-[2px] bg-line align-middle">
                      <i
                        className="block h-full bg-error-mark"
                        style={{ width: `${100 * t.errorRate}%` }}
                      />
                    </span>{" "}
                    {pct(t.errorRate)}
                  </td>
                  <td className={num}>{dur(t.avgDurationMs)}</td>
                  <td>
                    <ShareBar
                      parts={projects.map((p) => ({
                        label: colors.projectName(p),
                        value: t.byProject.find((g) => g.key === p)?.count || 0,
                        color: colors.projectColor(p),
                      }))}
                    />
                  </td>
                </tr>
                {selected === t.name && (
                  <ToolBreakdown
                    tool={t}
                    sessionCount={sessionCount}
                    colors={colors}
                  />
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {tools.length > PAGE && (
        <Pagination
          label={
            <>
              {page + 1} de {Math.ceil(tools.length / PAGE)}
            </>
          }
          hasPrevious={page > 0}
          hasNext={(page + 1) * PAGE < tools.length}
          onPrevious={() => setPage(page - 1)}
          onNext={() => setPage(page + 1)}
        />
      )}
    </Panel>
  );
}
