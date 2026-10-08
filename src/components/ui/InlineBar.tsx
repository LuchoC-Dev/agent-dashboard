import type { ReactNode } from "react";

/** A table value followed by a bar `percent` wide (0–100). */
export function InlineBar({
  children,
  percent,
  color,
}: {
  children: ReactNode;
  percent: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {children}
      <span className="relative h-1.5 w-16 bg-transparent table-sm:w-8">
        <i
          className="absolute inset-y-0 left-0 rounded-r-[2px]"
          style={{ width: `${percent}%`, background: color }}
        />
      </span>
    </div>
  );
}
