import type { SessionDetail } from "../../../../bindings/SessionDetail";
import { DataTable } from "../../../../components/ui/DataTable";
import { Panel } from "../../../../components/ui/Panel";
import { mono, note, num } from "../../../../components/ui/styles";
import { Swatch } from "../../../../components/ui/Swatch";
import { TokenBar } from "../../../../components/ui/TokenBar";
import { ToolCount } from "../../../../components/ui/ToolCount";
import { UnpricedMark } from "../../../../components/ui/UnpricedMark";
import { dur, int, pct, usd, when } from "../../../../lib/format";
import { providerLabel } from "../../../../lib/providers";
import { displayDir } from "../../../../lib/scan";
import { allMessages, callsIn } from "../../../../lib/sessions";
import { toolsFromDetails } from "../../../../lib/tools";
import { tokenKinds, totalTok } from "../../../../lib/usage";

const metaList =
  "grid grid-cols-[92px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-size-xs";
const metaTerm = "text-ink-3";
const metaValue = "wrap-anywhere text-ink tabular-nums";

export function TokenBreakdown({ detail }: { detail: SessionDetail }) {
  const s = detail.summary,
    total = totalTok(s.usage),
    subCost = detail.subagents.reduce((n, a) => n + a.costUsd, 0);
  return (
    <Panel title="Tokens y costo">
      <div className="text-[24px] leading-[30px] font-semibold tracking-[-0.01em]">
        {usd(s.costUsd)}
        <UnpricedMark tokens={s.unpricedTokens} />
      </div>
      <p className={note}>
        Estimado según el modelo · incluye subagentes
        {s.provider === "codex" &&
          " · equivalente a precios de la API de OpenAI (Codex no registra costos)"}
      </p>
      <TokenBar usage={s.usage} />
      <div className="mt-3 grid grid-cols-[12px_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 gap-y-1.5 text-size-xs tabular-nums">
        {tokenKinds.map(([k, l, c, ck]) => (
          <div className="contents" key={k}>
            <Swatch color={c} />
            <span className="text-ink-2">{l}</span>
            <span className="text-right text-ink">{int(s.usage[k])}</span>
            <span className="min-w-[42px] text-right text-ink-3">
              {pct(s.usage[k] / (total || 1))}
            </span>
            <span className="col-[2/-1] -mt-[3px] mb-1 text-right text-size-2xs text-ink-3">
              Costo {usd(s.costBreakdown[ck])}
            </span>
          </div>
        ))}
      </div>
      <hr className="my-3 border-0 border-t border-line" />
      <dl className={metaList}>
        <dt className={metaTerm}>Sesión principal</dt>
        <dd className={metaValue + " " + num}>
          {usd(Math.max(0, s.costUsd - subCost))}
        </dd>
        <dt className={metaTerm}>Subagentes</dt>
        <dd className={metaValue + " " + num}>{usd(subCost)}</dd>
        {!!s.usage.reasoningTokens && (
          <>
            <dt className={metaTerm}>Razonamiento</dt>
            <dd className={metaValue + " " + num}>
              {int(s.usage.reasoningTokens)} tokens · incluidos en salida
            </dd>
          </>
        )}
        {!!s.unpricedTokens && (
          <>
            <dt className={metaTerm}>Sin precio</dt>
            <dd className={metaValue + " " + num}>
              {int(s.unpricedTokens)} tokens · fuera del costo
            </dd>
          </>
        )}
      </dl>
    </Panel>
  );
}

export function SessionMetaPanel({ detail }: { detail: SessionDetail }) {
  const s = detail.summary;
  const pairs = [
    ["Proyecto", s.projectName],
    ["Carpeta", s.projectPath],
    ["Rama", s.gitBranch || "—"],
    ["Versión CLI", s.cliVersion || "—"],
    ["Inicio", when(s.startedAt)],
    ["Fin", when(s.endedAt)],
    ["Duración", dur(s.durationMs)],
    ["Mensajes", int(s.messageCount)],
    ["Proveedor", providerLabel(s.provider)],
    // Which home the session was read from (contract v2.5: Codex reads several).
    ...(s.sourceDir ? [["Leída de", displayDir(s.sourceDir)]] : []),
    ["ID", s.id],
  ];
  return (
    <Panel title="Sesión">
      <dl className={metaList}>
        {pairs.map(([k, v]) => (
          <div className="contents" key={k}>
            <dt className={metaTerm}>{k}</dt>
            <dd
              className={
                metaValue +
                (["Carpeta", "Rama", "ID", "Leída de"].includes(k) ? " " + mono : "")
              }
            >
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** Tool calls in this session (main + subagents); optionally with total time. */
export function SessionToolsTable({
  detail,
  withTime = false,
}: {
  detail: SessionDetail;
  withTime?: boolean;
}) {
  const calls = callsIn(allMessages(detail));
  const time = (name: string) =>
    calls
      .filter((c) => c.name === name)
      .reduce((n, c) => n + (c.durationMs || 0), 0);
  return (
    <Panel title="Herramientas" flush>
      <DataTable
        rows={toolsFromDetails([detail])}
        rowKey={(t) => t.name}
        defaultSort="calls"
        columns={[
          {
            key: "name",
            label: withTime ? "Herramienta" : "Nombre",
            value: (t) => t.name,
            className: mono,
          },
          {
            key: "calls",
            label: "Llamadas",
            numeric: true,
            value: (t) => t.calls,
            render: (t) => <ToolCount calls={t.calls} errors={t.errors} />,
          },
          ...(withTime
            ? [
                {
                  key: "time",
                  label: "Tiempo total",
                  numeric: true,
                  value: (t: { name: string }) => time(t.name),
                  render: (t: { name: string }) => dur(time(t.name)),
                },
              ]
            : []),
        ]}
      />
    </Panel>
  );
}
