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
import { int, tok, usd } from "../../../../lib/format";
import { tokenKinds } from "../../../../lib/usage";
import { answerRow, chartAnswers, type AnswerRow } from "../../answers";
import type { Focus } from "../../focus";

type AnswerMetric = "cost" | "tokens" | "context" | "output" | "tools";
const PAGE = 60;
const tick = { fontSize: 10.5, fill: "var(--color-ink-3)" };

const seriesFor = (metric: AnswerMetric) =>
  metric === "cost"
    ? tokenKinds.map(([, l, c, ck]) => ({ key: "cost." + ck, label: l, color: c }))
    : metric === "tokens"
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

/** The chart tooltip; under Costo an answer with unpriced tokens gets the mark and a note. */
function AnswerTooltip({
  cost,
  ...props
}: Parameters<typeof ChartTooltip>[0] & { cost: boolean }) {
  const row = (props.payload?.[0] as { payload?: AnswerRow } | undefined)?.payload,
    unpriced = cost ? row?.unpriced : 0;
  return (
    <ChartTooltip
      {...props}
      unpriced={unpriced}
      footer={
        (unpriced ? `* ${int(unpriced)} tokens sin precio: el costo no los cuenta. ` : "") +
        "Hacé click para ver el mensaje."
      }
    />
  );
}

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
  const answers = chartAnswers(detail.messages),
    rows = answers.slice(page * PAGE, (page + 1) * PAGE).map(answerRow);
  const series = seriesFor(metric),
    format = metric === "tools" ? int : metric === "cost" ? usd : tok;
  return (
    <Panel
      title="Por respuesta"
      sub={
        <Segments
          label="Métrica por respuesta"
          value={metric}
          onChange={setMetric}
          options={[
            ["cost", "Costo"],
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
              content={<AnswerTooltip format={format} cost={metric === "cost"} />}
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
