import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SessionDetail } from "../../../../bindings/SessionDetail";
import { ChartTooltip } from "../../../../components/ui/ChartTooltip";
import { Legend } from "../../../../components/ui/Legend";
import { Pagination } from "../../../../components/ui/Pagination";
import { Panel } from "../../../../components/ui/Panel";
import { Segments } from "../../../../components/ui/Segments";
import { button, note } from "../../../../components/ui/styles";
import { int, time, tok } from "../../../../lib/format";
import { callsIn } from "../../../../lib/sessions";
import { tokenKinds } from "../../../../lib/usage";
import type { Focus } from "../../focus";

type AnswerMetric = "tokens" | "context" | "output" | "tools";
const PAGE = 60;
const tick = { fontSize: 10.5, fill: "var(--color-ink-3)" };

const seriesFor = (metric: AnswerMetric) =>
  metric === "tokens"
    ? tokenKinds.map(([k, l, c]) => ({ key: k, label: l, color: c }))
    : metric === "tools"
      ? [
          { key: "ok", label: "Sin error", color: "var(--color-primary)" },
          { key: "error", label: "Con error", color: "var(--color-error-mark)" },
        ]
      : [
          {
            key: metric,
            label: metric === "context" ? "Contexto" : "Salida",
            color: "var(--color-primary)",
          },
        ];

/** One bar per assistant answer (60 per page); a click opens it in the conversation. */
export function PerAnswerChart({
  detail,
  onFocus,
}: {
  detail: SessionDetail;
  onFocus: (f: Focus) => void;
}) {
  const [metric, setMetric] = useState<AnswerMetric>("tokens"),
    [page, setPage] = useState(0);
  const answers = detail.messages.filter((m) => m.role === "assistant"),
    rows = answers.slice(page * PAGE, (page + 1) * PAGE).map((m) => {
      const calls = callsIn([m]);
      return {
        id: m.id,
        time: time(m.timestamp),
        ...m.usage,
        context: m.usage?.cacheReadTokens || 0,
        output: m.usage?.outputTokens || 0,
        ok: calls.filter((c) => !c.isError).length,
        error: calls.filter((c) => c.isError).length,
      };
    });
  const series = seriesFor(metric),
    format = metric === "tools" ? int : tok;
  return (
    <Panel
      title="Por respuesta"
      sub={
        <Segments
          label="Métrica por respuesta"
          value={metric}
          onChange={setMetric}
          options={[
            ["tokens", "Tokens"],
            ["context", "Contexto"],
            ["output", "Salida"],
            ["tools", "Herramientas"],
          ]}
        />
      }
    >
      <div style={{ height: 220 }}>
        <ResponsiveContainer>
          <BarChart
            data={rows}
            accessibilityLayer
            onClick={(state) => {
              if (
                typeof state.activeTooltipIndex === "number" ||
                typeof state.activeTooltipIndex === "string"
              ) {
                const r = rows[Number(state.activeTooltipIndex)];
                if (r) onFocus({ msg: r.id });
              }
            }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis dataKey="time" tick={tick} />
            <YAxis tickFormatter={format} tick={tick} />
            <Tooltip
              content={
                <ChartTooltip
                  format={format}
                  footer="Hacé click para ver el mensaje."
                />
              }
              cursor={{ fill: "var(--color-sunken)" }}
            />
            {series.map((x) => (
              <Bar
                isAnimationActive={false}
                key={x.key}
                dataKey={x.key}
                name={x.label}
                stackId="a"
                fill={x.color}
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend items={series} />
      {answers.length > PAGE && (
        <Pagination
          label={
            <>
              Respuestas {page * PAGE + 1}–
              {Math.min((page + 1) * PAGE, answers.length)} de{" "}
              {answers.length}
            </>
          }
          hasPrevious={page > 0}
          hasNext={(page + 1) * PAGE < answers.length}
          onPrevious={() => setPage(page - 1)}
          onNext={() => setPage(page + 1)}
        />
      )}
      <details className={note}>
        <summary>Ir a una respuesta</summary>
        <div className="flex flex-wrap gap-1 py-2">
          {rows.map((r, i) => (
            <button
              key={r.id}
              className={button({ size: "sm" })}
              onClick={() => onFocus({ msg: r.id })}
            >
              #{page * PAGE + i + 1} · {r.time}
            </button>
          ))}
        </div>
      </details>
    </Panel>
  );
}
