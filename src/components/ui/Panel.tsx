import type { ReactNode, Ref } from "react";
import { panel } from "./styles";

export function Panel({
  title,
  sub,
  action,
  children,
  flush = false,
  ref,
}: {
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  ref?: Ref<HTMLElement>;
}) {
  return (
    <section ref={ref} className={panel}>
      <header className="flex items-baseline gap-2.5 px-4 pt-3">
        <h2 className="text-size-sm font-semibold whitespace-nowrap">{title}</h2>
        {sub && (
          <span className="min-w-0 text-size-xs text-ink-3 tabular-nums">
            {sub}
          </span>
        )}
        <span className="ml-auto text-size-xs">{action}</span>
      </header>
      <div className={flush ? "pt-2 pb-1" : "px-4 pt-2.5 pb-3.5"}>
        {children}
      </div>
    </section>
  );
}
