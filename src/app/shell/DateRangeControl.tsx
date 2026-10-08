import { useState } from "react";
import type { DateRange } from "../../bindings/DateRange";
import { Icon } from "../../components/ui/Icon";
import { Segments } from "../../components/ui/Segments";
import { button, field } from "../../components/ui/styles";
import {
  addDays,
  presetRange,
  RANGE_PRESETS,
  today,
  type RangePreset,
} from "../../lib/dates";
import { dayLabel } from "../../lib/format";

const label = "flex flex-col gap-1 text-size-xs text-ink-3";

/** Presets for the last N days plus a custom from/to popover. */
export function DateRangeControl({
  range,
  onChange,
}: {
  range: DateRange;
  onChange: (r: DateRange) => void;
}) {
  const [open, setOpen] = useState(false),
    [from, setFrom] = useState(range.from || ""),
    [to, setTo] = useState(range.to || "");
  const preset =
    !range.from && !range.to
      ? "all"
      : ["7", "30", "90"].find(
          (n) =>
            range.from === addDays(today(), 1 - Number(n)) &&
            range.to === today(),
        ) || "";
  return (
    <div className="relative flex items-center gap-2">
      <span className="text-size-xs whitespace-nowrap text-ink-3 tabular-nums compact:hidden">
        {range.from ? dayLabel(range.from) : "Inicio"} —{" "}
        {range.to ? dayLabel(range.to) : "hoy"}
      </span>
      <Segments
        label="Rango de fechas"
        value={preset}
        options={RANGE_PRESETS}
        onChange={(n) => {
          onChange(presetRange(n as RangePreset));
          setOpen(false);
        }}
      />
      <button
        className={button({ size: "sm", ghost: true })}
        aria-label="Elegir fechas"
        aria-expanded={open}
        onClick={() => {
          setFrom(range.from || "");
          setTo(range.to || "");
          setOpen(!open);
        }}
      >
        <Icon name="calendar" />
      </button>
      {open && (
        <form
          className="absolute top-[calc(100%+6px)] right-0 z-20 flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2.5 rounded-md border border-line bg-raised p-3 shadow-(--shadow-pop)"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to && from > to) return;
            onChange({ ...(from ? { from } : {}), ...(to ? { to } : {}) });
            setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div className="grid grid-cols-2 gap-2 *:min-w-0">
            <label className={label}>
              Desde
              <input
                className={field + " w-full min-w-0"}
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className={label}>
              Hasta
              <input
                className={field + " w-full min-w-0"}
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <button className={button()} type="submit">
            Aplicar
          </button>
          <button
            className={button({ ghost: true })}
            type="button"
            onClick={() => setOpen(false)}
          >
            Cancelar
          </button>
        </form>
      )}
    </div>
  );
}
