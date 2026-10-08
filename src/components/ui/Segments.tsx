export function Segments<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      // Scrolls instead of overflowing its panel when the window is narrow.
      className="inline-flex max-w-full overflow-x-auto rounded-sm border border-line-strong bg-surface"
      role="group"
      aria-label={label}
    >
      {options.map(([v, l]) => (
        <button
          key={v}
          className="h-7 flex-none cursor-pointer border-0 focus-visible:-outline-offset-2 bg-transparent px-2.5 phone:px-2 text-size-xs font-medium whitespace-nowrap text-ink-2 tabular-nums not-first:border-l not-first:border-line hover:bg-sunken aria-pressed:bg-accent-wash aria-pressed:font-semibold aria-pressed:text-accent"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
