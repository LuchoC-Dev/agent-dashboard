import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * A button that opens a small floating panel over the content below it, so opening it never
 * resizes its container. Escape, a click outside or the button again close it.
 */
export function Popover({
  label,
  title,
  buttonClassName,
  align = "left",
  children,
}: {
  label: ReactNode;
  /** Accessible name of the panel. */
  title: string;
  buttonClassName: string;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLSpanElement>(null),
    button = useRef<HTMLButtonElement>(null),
    id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
        if (!root.current?.contains(e.target as Node)) setOpen(false);
      },
      escape = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        setOpen(false);
        button.current?.focus();
      };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <span ref={root} className="relative inline-flex">
      <button
        ref={button}
        type="button"
        className={buttonClassName}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={title}
          className={
            "absolute top-[calc(100%+4px)] z-30 flex max-h-[260px] w-max max-w-[min(360px,calc(100vw-32px))] flex-col gap-0.5 overflow-auto rounded-md border border-line bg-raised p-1.5 shadow-(--shadow-pop) " +
            (align === "right" ? "right-0" : "left-0")
          }
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  );
}
