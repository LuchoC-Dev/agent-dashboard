import type { CSSProperties } from "react";
import { useQueries } from "@tanstack/react-query";
import { useDashboard } from "../app/dashboard-context";
import { ErrorState, LoadingState } from "../components/ui/states";
import { Swatch } from "../components/ui/Swatch";
import { ToolsOverview } from "../features/tools/components/ToolsOverview";
import { toolQueries } from "../features/tools/queries";
import { useFixture } from "../hooks/useFixture";
import { providerColor, providerLabel } from "../lib/providers";

/**
 * Herramientas (`/herramientas?tool=`). Tool names differ per provider (`Bash` vs `shell`),
 * so with every provider selected each one gets its own ranking and matrix.
 */
export function Component() {
  const { tools, sessions, colors, provider, providers, resolvedRange } =
      useDashboard(),
    fixture = useFixture(),
    split = !provider && providers.length > 1;
  const perProvider = useQueries({
    queries: (split ? providers : []).map((p) =>
      toolQueries.stats(resolvedRange, p, fixture),
    ),
  });
  if (!split)
    return <ToolsOverview tools={tools} sessions={sessions} colors={colors} />;
  const failed = perProvider.find((q) => q.error);
  if (failed)
    return <ErrorState error={failed.error} onRetry={() => failed.refetch()} />;
  if (perProvider.some((q) => !q.data)) return <LoadingState />;
  return providers.map((p, i) => (
    <section
      key={p}
      className="flex flex-col gap-4"
      aria-label={providerLabel(p)}
      // Each section charts in its own provider color.
      style={{ "--color-primary": providerColor(p) } as CSSProperties}
    >
      <h2 className="flex items-center gap-2 text-size-lg font-semibold">
        <Swatch color={providerColor(p)} rounded="rounded-[3px]" />
        {providerLabel(p)}
      </h2>
      <ToolsOverview
        tools={perProvider[i].data!}
        sessions={sessions.filter((s) => s.provider === p)}
        colors={colors}
      />
    </section>
  ));
}
