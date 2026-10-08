import { panel } from "../../../components/ui/styles";

/**
 * A panel-shaped placeholder: same frame, title and height as the section it stands for, so
 * nothing moves when the data lands.
 */
export function SectionSkeleton({
  title,
  height,
}: {
  title?: string;
  /** Height classes, per breakpoint, matching the final section. */
  height: string;
}) {
  return (
    <section
      className={panel + " flex flex-col " + height}
      aria-busy="true"
      aria-label={title ? title + " · cargando" : "Cargando"}
    >
      {title && (
        <h2 className="px-4 pt-3 text-size-sm font-semibold text-ink-3">{title}</h2>
      )}
      <div className="skel m-4 mt-3 flex-1 border-0" />
    </section>
  );
}
