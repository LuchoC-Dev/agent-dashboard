import { Link, NavLink } from "react-router";
import { useMock } from "../../api";
import { Icon, type IconName } from "../../components/ui/Icon";
import type { DateRange } from "../../bindings/DateRange";
import type { Provider } from "../../bindings/Provider";
import { useProvider } from "../../hooks/useProvider";
import { withRange } from "../../lib/navigation";
import { ACCENTS, type Accent } from "../../lib/accents";
import type { Theme } from "./useTheme";

function BrandMark() {
  return (
    <svg className="size-5 flex-none" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="1" y="1" width="18" height="18" rx="4" fill="var(--color-primary)" />
      <path
        d="M6.2 10v5 M10 6v9 M13.8 8v7"
        stroke="var(--color-accent-ink)"
        strokeWidth="2.4"
      />
    </svg>
  );
}

const themes: [Theme, string, IconName][] = [
  ["system", "Sistema", "monitor"],
  ["light", "Claro", "sun"],
  ["dark", "Oscuro", "moon"],
];

function ThemeSwitch({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (t: Theme) => void;
}) {
  return (
    <div
      className="inline-flex w-max overflow-hidden rounded-sm border border-line collapsed:flex-col"
      role="group"
      aria-label="Tema"
    >
      {themes.map(([value, label, icon]) => (
        <button
          key={value}
          className="grid h-6 w-[30px] cursor-pointer place-items-center border-0 focus-visible:-outline-offset-2 bg-transparent text-ink-3 not-first:border-l not-first:border-line aria-pressed:bg-sunken aria-pressed:text-ink collapsed:not-first:border-t collapsed:not-first:border-l-0"
          title={label}
          aria-label={label}
          aria-pressed={theme === value}
          onClick={() => onChange(value)}
        >
          <Icon name={icon} />
        </button>
      ))}
    </div>
  );
}

/** App accent presets; each swatch carries its own `data-accent`, so it shows that preset's color. */
function AccentPicker({
  accent,
  onChange,
}: {
  accent: Accent;
  onChange: (a: Accent) => void;
}) {
  return (
    <div
      className="inline-flex w-max gap-0.5 collapsed:flex-col"
      role="group"
      aria-label="Color de acento"
    >
      {ACCENTS.map(([value, label]) => (
        <button
          key={value}
          data-accent={value}
          className="grid size-6 cursor-pointer place-items-center rounded-sm border border-transparent bg-transparent hover:bg-sunken aria-pressed:border-line-strong"
          title={`Acento: ${label}`}
          aria-label={label}
          aria-pressed={accent === value}
          onClick={() => onChange(value)}
        >
          <span className="size-3 rounded-full bg-(--app-accent)" />
        </button>
      ))}
    </div>
  );
}

export function Sidebar({
  range,
  sessionCount,
  projectCount,
  providers,
  sourceDirs,
  theme,
  onTheme,
  accent,
  onAccent,
}: {
  range: DateRange;
  sessionCount: number | undefined;
  projectCount: number | undefined;
  /** The providers on screen: the selected one, or every provider with sessions. */
  providers: Provider[];
  sourceDirs: string[];
  theme: Theme;
  onTheme: (t: Theme) => void;
  accent: Accent;
  onAccent: (a: Accent) => void;
}) {
  const { provider } = useProvider();
  const nav: [string, string, IconName, number | undefined | null][] = [
    ["/resumen", "Resumen", "overview", null],
    ["/sesiones", "Sesiones", "list", sessionCount],
    ["/proyectos", "Proyectos", "folder", projectCount],
    ["/herramientas", "Herramientas", "tool", null],
  ];
  return (
    <aside className="flex min-h-0 flex-col gap-1 border-r border-line bg-page px-2.5 pt-3.5 pb-3">
      <Link
        className="flex items-center gap-[9px] px-2 pt-0.5 pb-4 text-size-sm font-semibold tracking-[0.01em] text-ink hover:text-ink hover:no-underline collapsed:justify-center collapsed:px-0"
        to="/resumen"
      >
        <BrandMark />
        <div className="collapsed:hidden">
          Agent Dashboard
          <small className="block text-size-xs font-normal text-ink-3">
            {(providers.length ? providers : (["claude"] as const))
              .map((p) => (p === "codex" ? "Codex" : "Claude Code"))
              .join(" · ")}
            {useMock ? " · ejemplo" : ""}
          </small>
        </div>
      </Link>
      <nav className="flex flex-col gap-px" aria-label="Principal">
        {nav.map(([path, label, icon, count]) => (
          <NavLink
            key={path}
            to={withRange(path, range, provider)}
            title={label}
            className="group flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-size-sm font-medium text-ink-2 hover:bg-sunken hover:text-ink hover:no-underline aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:shadow-[inset_0_0_0_1px_var(--color-line)] collapsed:justify-center collapsed:p-0"
          >
            <Icon
              name={icon}
              className="group-aria-[current=page]:text-accent"
            />
            <span className="collapsed:hidden">{label}</span>
            {count !== null &&
              (count === undefined ? (
                <span
                  className="skel ml-auto h-3 w-5 border-0 collapsed:hidden"
                  aria-hidden="true"
                />
              ) : (
                <span className="ml-auto text-size-xs text-ink-3 tabular-nums collapsed:hidden">
                  {count}
                </span>
              ))}
          </NavLink>
        ))}
      </nav>
      <footer className="mt-auto flex flex-col gap-2.5 px-2 text-size-xs text-ink-3 collapsed:items-center collapsed:p-0">
        <div className="flex items-start gap-2 leading-4">
          <Icon name="lock" className="mt-px" />
          <div className="min-w-0 collapsed:hidden">
            <b className="block font-medium text-ink-2">Solo lectura</b>Lee{" "}
            {/* One line per directory read (Codex may read several homes). */}
            {(sourceDirs.length ? sourceDirs : ["~/.claude/projects"]).map((d) => (
              <span
                key={d}
                className="block truncate font-mono text-[10.5px] [direction:rtl] text-left"
                title={d}
              >
                <bdi>{d}</bdi>
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 collapsed:flex-col">
          <ThemeSwitch theme={theme} onChange={onTheme} />
          <AccentPicker accent={accent} onChange={onAccent} />
        </div>
      </footer>
    </aside>
  );
}
