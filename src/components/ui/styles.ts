/*
 * Tailwind class sets shared by elements that are not one component: a button can be a
 * <button> or a <Link>, a panel a <section> or a plain <div>.
 */

export function button({
  size = "md",
  ghost = false,
}: { size?: "md" | "sm"; ghost?: boolean } = {}) {
  return [
    "inline-flex cursor-pointer items-center gap-1.5 rounded-sm border font-medium whitespace-nowrap hover:bg-sunken disabled:cursor-default disabled:opacity-60",
    size === "sm"
      ? "h-[26px] px-2 text-size-xs"
      : "h-[30px] px-[11px] text-size-sm",
    ghost
      ? "border-transparent bg-transparent text-ink-2 hover:text-ink"
      : "border-line-strong bg-surface",
  ].join(" ");
}

/** Hairline section on the page background (not a floating card). */
export const panel = "min-w-0 rounded-md border border-line bg-surface";

export const field =
  "h-[30px] rounded-sm border border-line-strong bg-surface px-2 text-size-sm text-ink focus:outline-2 focus:-outline-offset-1 focus:outline-accent";

/** Status text: always paired with an icon or a word, never color alone. */
export const errorText =
  "inline-flex items-center gap-1 text-size-xs font-medium whitespace-nowrap text-error";

/** See `.mono` in styles/components.css. */
export const mono = "mono";

/** A button that reads as a link. */
export const textLink =
  "cursor-pointer border-0 bg-none p-0 text-left text-accent hover:underline";

/** Small muted explanatory text. */
export const note = "text-size-xs leading-4 text-ink-3";

/** Toolbar row of a list screen: search, selects and a summary. */
export const filters = "flex flex-wrap items-center gap-2";
export const summary = "text-size-xs text-ink-3 tabular-nums";

/** Two equal columns, stacked when the sidebar collapses. */
export const grid2 = "grid grid-cols-2 gap-4 collapsed:grid-cols-1";

/** Page header of a session or project. */
export const detailHead = "flex flex-col gap-1.5 pb-1";
export const detailTitle =
  "text-size-xl leading-(--text-xl--line-height) font-semibold tracking-[-0.01em]";
/** A wrapping row of facts; direct children align their icon/swatch and text. */
export const metaLine =
  "flex flex-wrap gap-x-4 gap-y-1.5 text-size-xs text-ink-2 tabular-nums *:inline-flex *:items-center *:gap-[5px]";

/** Optional table columns: hidden on narrower windows or dashboard panels. */
export const optionalColumn = "narrow:hidden table-md:hidden";
export const secondaryColumn = "collapsed:hidden table-sm:hidden";

/** Right-aligned figures. */
export const num = "text-right whitespace-nowrap tabular-nums";
