import type { Palette } from "../../lib/colors";
import { parseModel } from "../../lib/models";
import { Swatch } from "./Swatch";

export function ModelBadge({ id, colors }: { id: string; colors: Palette }) {
  return (
    <span
      className="inline-flex gap-1.5 whitespace-nowrap in-[.tbl]:max-w-[170px] in-[.tbl]:overflow-hidden in-[.tbl]:text-ellipsis in-[.tbl]:align-middle"
      title={id}
    >
      <span className="inline-flex items-center gap-[5px]">
        <Swatch dot color={colors.modelColor(id)} />
        {parseModel(id).name}
      </span>
    </span>
  );
}
