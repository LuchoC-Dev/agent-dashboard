import type { SessionDetail } from "../../../../bindings/SessionDetail";
import { DataTable } from "../../../../components/ui/DataTable";
import { ModelBadge } from "../../../../components/ui/ModelBadge";
import { Panel } from "../../../../components/ui/Panel";
import { mono, textLink } from "../../../../components/ui/styles";
import { ToolCount } from "../../../../components/ui/ToolCount";
import type { Palette } from "../../../../lib/colors";
import { dur, time, usd } from "../../../../lib/format";
import { allMessages, callsIn, keyArgument } from "../../../../lib/sessions";
import { CostWithMark } from "../../../../components/ui/UnpricedMark";
import type { Focus } from "../../focus";
import { GuardianToggle, useGuardians } from "../../guardians";

export function SubagentsTable({
  detail,
  colors,
  onFocus,
}: {
  detail: SessionDetail;
  colors: Palette;
  onFocus: (f: Focus) => void;
}) {
  const guardians = useGuardians(detail);
  return (
    <Panel
      title="Subagentes"
      sub="Hacé click para ver la conversación"
      action={<GuardianToggle guardians={guardians} />}
      flush
    >
      <DataTable
        rows={guardians.subagents}
        rowKey={(a) => a.id}
        defaultSort="cost"
        onRow={(a) => onFocus({ sub: a.id })}
        columns={[
          {
            key: "type",
            label: "Tipo",
            value: (a) => a.agentType || "Subagente",
            render: (a) => (
              <button
                className={textLink}
                onClick={() => onFocus({ sub: a.id })}
              >
                {a.agentType || "Subagente"}
              </button>
            ),
          },
          {
            key: "model",
            label: "Modelo",
            value: (a) => a.messages.find((m) => m.model)?.model || "",
            render: (a) => (
              <ModelBadge
                id={a.messages.find((m) => m.model)?.model || "Desconocido"}
                colors={colors}
              />
            ),
          },
          {
            key: "duration",
            label: "Duración",
            numeric: true,
            value: (a) => Date.parse(a.endedAt) - Date.parse(a.startedAt),
            render: (a) => dur(Date.parse(a.endedAt) - Date.parse(a.startedAt)),
          },
          {
            key: "calls",
            label: "Herram.",
            numeric: true,
            value: (a) => callsIn(a.messages).length,
            render: (a) => (
              <ToolCount
                calls={callsIn(a.messages).length}
                errors={callsIn(a.messages).filter((c) => c.isError).length}
              />
            ),
          },
          {
            key: "cost",
            label: "Costo",
            numeric: true,
            value: (a) => a.costUsd,
            render: (a) => (
              <CostWithMark text={usd(a.costUsd)} tokens={a.unpricedTokens} />
            ),
          },
        ]}
      />
    </Panel>
  );
}

/** Failed tool calls (main + subagents); a click inspects the call. */
export function ErrorsTable({
  detail,
  onFocus,
}: {
  detail: SessionDetail;
  onFocus: (f: Focus) => void;
}) {
  const errors = allMessages(detail).flatMap((m) =>
    callsIn([m])
      .filter((c) => c.isError)
      .map((c) => ({ ...c, timestamp: m.timestamp })),
  );
  return (
    <Panel title="Errores" sub="Hacé click para inspeccionar la llamada" flush>
      <DataTable
        rows={errors}
        rowKey={(c) => c.id}
        defaultSort="time"
        onRow={(c) => onFocus({ call: c.id })}
        columns={[
          {
            key: "time",
            label: "Hora",
            value: (c) => c.timestamp,
            render: (c) => time(c.timestamp),
          },
          {
            key: "name",
            label: "Herramienta",
            value: (c) => c.name,
            render: (c) => (
              <button
                className={textLink}
                onClick={() => onFocus({ call: c.id })}
              >
                ⊗ <span className={mono}>{c.name}</span>
              </button>
            ),
          },
          {
            key: "arg",
            label: "Argumento",
            value: keyArgument,
            className: mono,
            render: (c) => (
              <span className="file-path" title={keyArgument(c)}>
                {keyArgument(c)}
              </span>
            ),
          },
        ]}
        empty="No hay errores registrados."
      />
    </Panel>
  );
}
