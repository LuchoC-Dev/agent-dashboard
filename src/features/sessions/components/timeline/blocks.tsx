import type { ReactNode } from "react";
import type { ToolCall } from "../../../../bindings/ToolCall";
import { errorText, mono } from "../../../../components/ui/styles";
import { dur } from "../../../../lib/format";
import { keyArgument } from "../../../../lib/sessions";

/** Highlight animation for the target of a deep link. */
export const flash =
  "animate-flash motion-reduce:animate-none motion-reduce:bg-accent-wash";

/** Disclosure chevron that turns only when its own section is open. */
export function Chevron({ open }: { open: boolean }) {
  return (
    <span
      className={
        "text-ink-3 transition-transform duration-[120ms] ease-[ease]" +
        (open ? " rotate-90" : "")
      }
    >
      ›
    </span>
  );
}

const code =
  "max-h-[260px] overflow-auto rounded-sm px-2.5 py-2 font-mono text-[11.5px] leading-[17px] whitespace-pre-wrap wrap-anywhere";

/** Pretty-printed JSON with highlighted keys. */
export function JsonBlock({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2) ?? "null";
  return (
    <pre className={code + " bg-sunken text-ink"}>
      {text.split(/("(?:[^"\\]|\\.)*"\s*:)/g).map((part, i) => (
        <span
          key={i}
          className={/^".*":$/.test(part.trim()) ? "text-accent" : undefined}
        >
          {part}
        </span>
      ))}
    </pre>
  );
}

export function ThinkingMarker({ text }: { text: string }) {
  return (
    <details className="border-l-2 border-line py-0.5 pl-2.5 text-size-xs text-ink-3">
      <summary className="inline-flex w-fit max-w-full cursor-pointer items-center gap-1.5 text-size-xs text-ink-3 hover:text-ink-2">
        ··· Razonamiento{text ? "" : " · sin contenido en el log"}
      </summary>
      <p className="whitespace-pre-wrap wrap-anywhere">
        {text ||
          "Este log no guarda el texto del razonamiento. No hay contenido para mostrar."}
      </p>
    </details>
  );
}

const heading =
  "mb-1 text-size-2xs font-medium tracking-[0.05em] text-ink-3 uppercase";

/** A collapsible tool call: status, name, key argument, duration; input/result when open. */
export function ToolCallRow({
  call,
  expanded,
  onToggle,
  children,
  focused,
}: {
  call: ToolCall;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
  focused?: boolean;
}) {
  return (
    <div
      id={"call-" + call.id}
      className={
        "not-first:border-t not-first:border-line" + (focused ? " " + flash : "")
      }
    >
      <button
        className={
          // Inset focus ring: the call list clips anything outside it.
          "grid h-(--row-h-dense) w-full cursor-pointer focus-visible:-outline-offset-2 grid-cols-[14px_16px_auto_minmax(0,1fr)_auto] items-center gap-2 border-0 px-2.5 text-left text-size-sm " +
          (call.isError ? "bg-error-wash" : "bg-transparent hover:bg-sunken")
        }
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <Chevron open={expanded} />
        <span className={call.isError ? errorText : "text-ink-3"}>
          {call.isError ? "⊗" : "✓"}
        </span>
        <span className="font-mono text-[12px] font-semibold">{call.name}</span>
        <span
          className="truncate font-mono text-[12px] text-ink-2"
          title={keyArgument(call)}
        >
          {keyArgument(call)}
        </span>
        <span className="flex items-center gap-2.5 text-size-xs text-ink-3 tabular-nums">
          {dur(call.durationMs)}
          {call.isError && <span className={errorText}>error</span>}
        </span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-2.5 bg-surface pt-1 pr-2.5 pb-3 pl-12">
          <div>
            <h4 className={heading}>Entrada</h4>
            <JsonBlock value={call.input} />
          </div>
          <div>
            <h4 className={heading}>Resultado</h4>
            <pre
              className={
                code +
                (call.isError ? " bg-error-wash text-error" : " bg-sunken text-ink")
              }
            >
              {call.result ?? "Sin resultado registrado"}
            </pre>
          </div>
          <span className={mono + " text-ink-3"}>{call.id}</span>
        </div>
      )}
      {children}
    </div>
  );
}
