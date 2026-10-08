import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SessionSummary } from "../../../bindings/SessionSummary";
import { tooltip } from "../../../components/ui/ChartTooltip";
import { Panel } from "../../../components/ui/Panel";
import { dur, usd } from "../../../lib/format";

const BOUNDS = [5, 15, 30, 60, 120, Infinity],
  LABELS = ["< 5 min", "5–15", "15–30", "30–60", "1–2 h", "> 2 h"];
const tick = { fontSize: 11, fill: "var(--color-ink-3)" };

/** Sessions per duration bucket (minutes), with the mean cost per session. */
function durationBuckets(sessions: SessionSummary[]) {
  return BOUNDS.map((b, i) => {
    const ss = sessions.filter(
      (s) =>
        s.durationMs / 60000 < b &&
        (i === 0 || s.durationMs / 60000 >= BOUNDS[i - 1]),
    );
    return {
      name: LABELS[i],
      count: ss.length,
      cost: ss.reduce((n, s) => n + s.costUsd, 0) / (ss.length || 1),
    };
  });
}

export function DurationHistogram({
  sessions,
}: {
  sessions: SessionSummary[];
}) {
  const sorted = sessions.map((s) => s.durationMs).sort((a, b) => a - b);
  return (
    <Panel
      title="Duración de las sesiones"
      sub={`Mediana ${dur(sorted[Math.floor(sorted.length / 2)] || 0)} · Máxima ${dur(sorted[sorted.length - 1] || 0)}`}
    >
      <div style={{ height: 160 }}>
        <ResponsiveContainer>
          <BarChart data={durationBuckets(sessions)}>
            <XAxis dataKey="name" tick={tick} />
            <YAxis tick={tick} />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className={tooltip}>
                    {payload[0].payload.name} · {payload[0].payload.count}{" "}
                    sesiones · {usd(payload[0].payload.cost)} / sesión
                  </div>
                ) : null
              }
            />
            <Bar
              isAnimationActive={false}
              dataKey="count"
              fill="var(--color-primary)"
              label={{
                position: "top",
                fill: "var(--color-ink-2)",
                fontSize: 11,
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
