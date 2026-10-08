import { Icon } from "../../../components/ui/Icon";
import { Swatch } from "../../../components/ui/Swatch";
import type { Palette } from "../../../lib/colors";
import { activeFilters, type FilterKey, type OverviewFilters } from "../../../lib/filters";
import { dayLabel } from "../../../lib/format";
import { familyLabel, filterFamily, matchesModel, parseModel } from "../../../lib/models";
import { providerColor, providerLabel } from "../../../lib/providers";
import { tokenKinds } from "../../../lib/usage";
import { hourLabel, WEEKDAYS } from "./UsageByHourHeatmap";

const names: Record<FilterKey, string> = {
  provider: "Proveedor",
  project: "Proyecto",
  model: "Modelo",
  day: "Día",
  tokenKind: "Tokens",
  weekday: "Día de semana",
  hour: "Hora",
  tool: "Herramienta",
};

/** A filter's value as shown on its chip, with its color key when it has one. */
function describe(
  key: FilterKey,
  f: OverviewFilters,
  colors: Palette,
): { name?: string; text: string; color?: string; title?: string } {
  const v = String(f[key]);
  switch (key) {
    case "provider":
      return { text: providerLabel(f.provider!), color: providerColor(v) };
    case "project":
      return { text: colors.projectName(v), color: colors.projectColor(v), title: v };
    case "model": {
      // A whole family (contract v2.5): "Familia: Opus".
      const family = filterFamily(v);
      if (family) {
        const first = colors.models.find((m) => matchesModel(m, v));
        return {
          name: "Familia",
          text: familyLabel(family),
          color: first && colors.modelColor(first),
          title: "Todas las versiones de " + familyLabel(family),
        };
      }
      return { text: parseModel(v).name, color: colors.modelColor(v), title: v };
    }
    case "day":
      return { text: dayLabel(v) };
    case "tokenKind": {
      const kind = tokenKinds.find(([k]) => k === v)!;
      return { text: kind[1], color: kind[2] };
    }
    case "weekday":
      return { text: WEEKDAYS[f.weekday!] };
    case "hour":
      return { text: hourLabel(f.hour!) };
    case "tool":
      return { text: v };
  }
}

/**
 * The active cross-filters of Resumen, one removable chip each, plus "Quitar filtros" when
 * there are several. Renders nothing without filters.
 */
export function FilterChips({
  filters,
  colors,
  onRemove,
  onClear,
}: {
  filters: OverviewFilters;
  colors: Palette;
  onRemove: (key: FilterKey) => void;
  onClear: () => void;
}) {
  const keys = activeFilters(filters);
  if (!keys.length) return null;
  const clearable = keys.filter((k) => k !== "provider");
  return (
    <div
      role="region"
      aria-label="Filtros activos"
      className="flex flex-wrap items-center gap-2 text-size-xs"
    >
      <span className="text-ink-3">Filtrado por</span>
      {keys.map((key) => {
        const d = describe(key, filters, colors);
        return (
          <button
            key={key}
            type="button"
            className="inline-flex h-7 max-w-[320px] min-w-0 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface pr-1.5 pl-2.5 text-ink-2 hover:border-ink-3 hover:text-ink"
            title={(d.title ? d.title + " · " : "") + "Quitar este filtro"}
            aria-label={`Quitar filtro ${d.name ?? names[key]}: ${d.text}`}
            onClick={() => onRemove(key)}
          >
            {d.color && <Swatch color={d.color} />}
            <span className="whitespace-nowrap text-ink-3">{d.name ?? names[key]}:</span>
            <b className="min-w-0 truncate font-semibold text-ink">{d.text}</b>
            <span className="grid size-[18px] flex-none place-items-center rounded-full text-ink-3 hover:bg-sunken">
              <Icon name="close" className="size-3" />
            </span>
          </button>
        );
      })}
      {clearable.length > 1 && (
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 font-medium text-accent hover:underline"
          onClick={onClear}
        >
          Quitar filtros
        </button>
      )}
    </div>
  );
}
