import { Outlet, useMatch } from "react-router";
import { usePalette } from "../../features/sessions/hooks";
import type { ShellContext } from "./context";
import { sourceDirs } from "../../lib/scan";
import { Notices } from "./Notices";
import { Sidebar } from "./Sidebar";
import { useRouteHandle } from "./route-handle";
import { Topbar } from "./Topbar";
import { useRefresh, useShellData } from "./useShellData";
import { useAccent, useProviderTheme, useTheme } from "./useTheme";

/** Layout route: sidebar, top bar, page notices and the routed screen. */
export function AppShell() {
  const data = useShellData(),
    colors = usePalette(data.all.data, data.sessions),
    [theme, setTheme] = useTheme(),
    [accent, setAccent] = useAccent(),
    { mutation, lastScan, refresh } = useRefresh(),
    { detail = false } = useRouteHandle();
  const busy = mutation.isPending,
    report = data.report.data,
    scannedAt = lastScan || (report ? Date.parse(report.scannedAt) : null);
  // A session uses its own provider's colors; a list, the selected or only provider's, and
  // several providers together the neutral app color ("all").
  const sessionId = useMatch("/sesion/:id/*")?.params.id,
    sessionProvider = data.all.data?.find((s) => s.id === sessionId)?.provider,
    brand =
      sessionProvider ??
      data.provider ??
      (data.providers.length === 1 ? data.providers[0] : "all");
  useProviderTheme(brand);
  return (
    <div className="grid h-screen grid-cols-[var(--sidebar-w)_minmax(0,1fr)]">
      <Sidebar
        range={data.range}
        // Counts wait for the final scan of the scope: a partial count would change under the user.
        sessionCount={data.ready ? data.scoped?.length : undefined}
        projectCount={
          data.ready ? new Set(data.scoped?.map((s) => s.projectKey)).size : undefined
        }
        providers={data.provider ? [data.provider] : data.providers}
        sourceDirs={sourceDirs(report, data.provider) ?? []}
        theme={theme}
        onTheme={setTheme}
        accent={accent}
        onAccent={setAccent}
      />
      <div className="flex min-h-0 min-w-0 flex-col">
        <Topbar
          range={data.range}
          onRange={data.setRange}
          provider={data.provider}
          providers={data.providers}
          onProvider={data.setProvider}
          scanning={data.loading || data.scanning}
          refreshing={busy}
          scanFailed={
            !!(data.error || data.report.error || mutation.error)
          }
          scannedAt={scannedAt}
          onRefresh={refresh}
        />
        <main
          className={
            "flex-1 overflow-auto px-5 pt-5 pb-10 transition-[opacity] duration-200 ease-[ease] compact:px-3 compact:pt-3 compact:pb-8" +
            (busy ? " pointer-events-none opacity-55" : "")
          }
        >
          <div className="@container mx-auto flex max-w-[1440px] flex-col gap-4">
            <Notices
              all={data.all.data}
              detail={detail}
              refreshError={mutation.error}
              report={report}
              reportError={data.report.error}
            />
            <Outlet context={{ data, colors, refresh } satisfies ShellContext} />
          </div>
        </main>
      </div>
    </div>
  );
}
