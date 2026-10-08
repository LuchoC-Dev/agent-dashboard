import { DataTable } from "../../../components/ui/DataTable";
import { Panel } from "../../../components/ui/Panel";
import {
  mono,
  optionalColumn,
  secondaryColumn,
} from "../../../components/ui/styles";
import type { FileTouch } from "../../../lib/tools";

/** Files read, edited or written, already counted under the view's filters (`filesTouched`). */
export function FilesTouched({ files }: { files: FileTouch[] }) {
  return (
    <Panel title="Archivos más tocados" sub="Read · Edit · Write" flush>
      <DataTable
        rows={files}
        rowKey={(f) => f.path}
        defaultSort="total"
        pageSize={15}
        columns={[
          {
            key: "path",
            className: "name-cell",
            label: "Archivo",
            value: (f) => f.path,
            render: (f) => (
              <span className={"file-path " + mono} title={f.path}>
                {f.path}
              </span>
            ),
          },
          {
            key: "reads",
            className: optionalColumn,
            label: "Lecturas",
            numeric: true,
            value: (f) => f.reads,
          },
          {
            key: "edits",
            label: "Ediciones",
            numeric: true,
            value: (f) => f.edits,
          },
          {
            key: "writes",
            className: secondaryColumn,
            label: "Escrituras",
            numeric: true,
            value: (f) => f.writes,
          },
          {
            key: "total",
            label: "Total",
            numeric: true,
            value: (f) => f.total,
          },
        ]}
      />
    </Panel>
  );
}
