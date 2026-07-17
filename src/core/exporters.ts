import type { CaseMetrics, CaseMetricKey, PivotTable } from "./caseAnalysis";
import { CASE_METRIC_LABELS } from "./caseAnalysis";

/** bigint 序列化为字符串以保留精度。 */
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/**
 * 导出所有 case 的逐文件明细为 JSON。每个 case 是独立测试，指标各自独立。
 */
export function exportCasesJSON(cases: CaseMetrics[]): string {
  return JSON.stringify({ cases }, bigintReplacer, 2);
}

/**
 * 导出所有 case 的逐文件明细为 CSV（每行一个文件，指标各自独立，不做平均）。
 */
export function exportCasesCSV(cases: CaseMetrics[]): string {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const metricKeys: CaseMetricKey[] = [
    "frameCount",
    "avgRenderFps",
    "avgDisplayFps",
    "avgFrameMs",
    "p90FrameMs",
    "maxFrameMs",
    "wallClockMs",
  ];
  const header = [
    "file",
    "scene",
    "algo",
    "downsample",
    ...metricKeys.map((k) => CASE_METRIC_LABELS[k]),
  ]
    .map(esc)
    .join(",");
  const lines = [header];
  for (const c of cases) {
    const cells = [
      esc(c.fileId),
      esc(c.dims.scene ?? ""),
      esc(c.dims.algo ?? ""),
      esc(c.dims.downsample ?? ""),
      ...metricKeys.map((k) => {
        const v = c[k];
        return v === null || v === undefined ? "" : String(v);
      }),
    ];
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

/**
 * 导出配对透视表为 CSV：行=固定维度组合，列=变化维度取值，格子=单个文件真实值。
 */
export function exportPivotCSV(pivot: PivotTable): string {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const header = [
    ...pivot.rowDims,
    ...pivot.columns,
    "best",
    "worst",
  ]
    .map(esc)
    .join(",");
  const lines = [header];
  for (const row of pivot.rows) {
    const cells = [
      ...pivot.rowDims.map((d) => esc(row.rowDims[d] ?? "")),
      ...pivot.columns.map((col) => {
        const cell = row.cells[col];
        return cell && cell.value !== null ? String(cell.value) : "";
      }),
      esc(row.bestColumn ?? ""),
      esc(row.worstColumn ?? ""),
    ];
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}
