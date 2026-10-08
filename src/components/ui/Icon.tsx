const paths = {
  overview: "M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z",
  list: "M9 6h12 M9 12h12 M9 18h12 M4 6h1 M4 12h1 M4 18h1",
  folder: "M3 7h6l3 2h9v11H3z",
  tool: "M15 4l-3 4 4 4 4-3a6 6 0 0 1-8 7l-6 6-3-3 6-6a6 6 0 0 1 6-9z",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
  refresh:
    "M20 10a8 8 0 0 0-14-4L3 9 M3 3v6h6 M4 14a8 8 0 0 0 14 4l3-3 M21 21v-6h-6",
  calendar: "M3 5h18v16H3z M8 3v4 M16 3v4 M3 10h18",
  search: "M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  alert: "M12 3L2 21h20z M12 9v5 M12 17v1",
  sun: "M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon: "M19 15A8 8 0 1 1 9 4a6 6 0 0 0 10 11",
  monitor: "M3 4h18v13H3z M8 21h8 M12 17v4",
  chevron: "M9 6l6 6-6 6",
  close: "M6 6l12 12 M18 6L6 18",
};
export type IconName = keyof typeof paths;

/** 16 px stroke icon in the current text color; `spin` rotates it while work is pending. */
export function Icon({
  name,
  spin = false,
  className = "",
}: {
  name: IconName;
  spin?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={
        "size-4 flex-none fill-none stroke-current stroke-[1.6] align-[-3px] [stroke-linecap:round] [stroke-linejoin:round] " +
        (spin ? "animate-spin motion-reduce:animate-none " : "") +
        className
      }
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
