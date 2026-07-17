import type { CaseMetrics } from "../core/caseAnalysis";
import { exportCasesJSON, exportCasesCSV } from "../core/exporters";

interface Props {
  cases: CaseMetrics[];
}

/** 本地下载：Blob + 链接，无网络请求。 */
function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ cases }: Props) {
  const disabled = cases.length === 0;
  return (
    <div className="export-panel">
      <h3>导出</h3>
      <button
        disabled={disabled}
        onClick={() =>
          download("trace-cases.json", exportCasesJSON(cases), "application/json")
        }
      >
        导出逐文件 JSON
      </button>
      <button
        disabled={disabled}
        onClick={() => download("trace-cases.csv", exportCasesCSV(cases), "text/csv")}
      >
        导出逐文件 CSV
      </button>
    </div>
  );
}
