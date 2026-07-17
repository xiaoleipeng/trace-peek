import type {
  AnalysisReport,
  FileEntry,
  GroupDimension,
  ParsedDims,
} from "./types";
import { applyAnomalyFilter } from "./applyAnomalyFilter";
import { meanNumber, percentileSorted, maxBig } from "./stats";

/**
 * 每个 .trace 文件是一个独立测试 case，其指标各自独立，绝不跨文件求平均。
 * 本模块把单文件报告抽取为 CaseMetrics，并提供"配对透视对比"：
 * 固定其余维度、仅让一个维度变化，每个格子都是单个文件的真实值。
 */

/** 帧离群剔除配置：默认开启，剔除"超大帧"避免拉偏帧率统计（需求 3）。 */
export interface FrameOutlierConfig {
  enabled: boolean;
  method: "percentile" | "iqr" | "mad";
}

export const DEFAULT_FRAME_OUTLIER: FrameOutlierConfig = {
  enabled: true,
  method: "iqr",
};

export interface CaseMetrics {
  fileId: string;
  dims: ParsedDims;
  frameCount: number; // 参与统计的帧数（剔除后）
  rawFrameCount: number; // 原始帧数
  removedFrameCount: number; // 被剔除的超大帧数
  avgRenderFps: number;
  avgDisplayFps: number | null;
  avgFrameMs: number;
  p90FrameMs: number;
  maxFrameMs: number;
  wallClockMs: number;
  totalEvents: number;
  /** 便于取某函数 self time 累计（ms）的映射（向后兼容）。 */
  selfMsByFn: Record<string, number>;
  /** 每函数更完整的统计，支持"累计/每次调用/每帧"多口径对比。 */
  fnStatsByName: Record<string, CaseFnStat>;
}

export interface CaseFnStat {
  name: string;
  selfTotalMs: number; // 该函数所有调用的 self 累计（ms）
  totalTotalMs: number; // total 累计（含子调用）（ms）
  count: number; // 调用次数
  selfPerCallMs: number; // 每次调用平均 self（ms）= selfTotal / count
  selfPerFrameMs: number; // 每帧平均 self（ms）= selfTotal / frameCount
}

/** 可用于透视对比的数值型指标键。 */
export type CaseMetricKey =
  | "avgRenderFps"
  | "avgDisplayFps"
  | "avgFrameMs"
  | "p90FrameMs"
  | "maxFrameMs"
  | "wallClockMs"
  | "frameCount";

export const CASE_METRIC_LABELS: Record<CaseMetricKey, string> = {
  avgRenderFps: "渲染FPS",
  avgDisplayFps: "刷新率FPS",
  avgFrameMs: "平均帧耗时(ms)",
  p90FrameMs: "P90帧耗时(ms)",
  maxFrameMs: "最大帧耗时(ms)",
  wallClockMs: "总时长(ms)",
  frameCount: "帧数",
};

/** 数值越大越好的指标（用于 best/worst 标注方向）。 */
export const METRIC_HIGHER_IS_BETTER: Record<CaseMetricKey, boolean> = {
  avgRenderFps: true,
  avgDisplayFps: true,
  avgFrameMs: false,
  p90FrameMs: false,
  maxFrameMs: false,
  wallClockMs: false,
  frameCount: true,
};

const NS_PER_MS = 1_000_000;
const NS_PER_SEC = 1_000_000_000;

/** 对一组值仅剔除"超大"离群（上界），返回保留值。 */
function dropLargeOutliers(values: bigint[], method: FrameOutlierConfig["method"]): bigint[] {
  const { kept } = applyAnomalyFilter(values, {
    dropIncompleteFrames: false,
    warmupFrames: 0,
    method,
  });
  return kept;
}

/**
 * 从单文件报告抽取 case 指标。
 * 需求 3：默认对帧耗时做"超大帧"离群剔除，再据剩余帧计算 avg/p90/max/FPS，
 * 避免个别超大帧把平均帧率/FPS 拉偏；同时保留原始帧数与被剔数以便透明展示。
 */
export function toCaseMetrics(
  report: AnalysisReport,
  entry: FileEntry,
  frameOutlier: FrameOutlierConfig = DEFAULT_FRAME_OUTLIER,
): CaseMetrics {
  const f = report.frames;

  const rawDurations = f?.frameDurationsNs ?? [];
  const rawStarts = f?.frameStartsNs ?? [];
  const rawFrameCount = rawDurations.length;

  // 剔除超大帧（仅渲染耗时口径）
  const keptDurations =
    frameOutlier.enabled && rawDurations.length > 0
      ? dropLargeOutliers(rawDurations, frameOutlier.method)
      : rawDurations;
  const removedFrameCount = rawFrameCount - keptDurations.length;

  const durMs = keptDurations.map((d) => Number(d) / NS_PER_MS);
  const sortedMs = [...durMs].sort((a, b) => a - b);
  const avgFrameMs = meanNumber(durMs);
  const p90FrameMs = percentileSorted(sortedMs, 90);
  const maxFrameMs = keptDurations.length > 0 ? Number(maxBig(keptDurations)) / NS_PER_MS : 0;
  const avgDurNs = keptDurations.length > 0 ? meanNumber(keptDurations.map(Number)) : 0;
  const avgRenderFps = avgDurNs > 0 ? NS_PER_SEC / avgDurNs : 0;

  // display fps：相邻帧起点间隔，剔除超大间隔（如中途暂停）后再平均
  let avgDisplayFps: number | null = null;
  if (rawStarts.length >= 2) {
    const periods: bigint[] = [];
    for (let i = 1; i < rawStarts.length; i++) periods.push(rawStarts[i] - rawStarts[i - 1]);
    const keptPeriods = frameOutlier.enabled
      ? dropLargeOutliers(periods, frameOutlier.method)
      : periods;
    const meanPeriod = keptPeriods.length > 0 ? meanNumber(keptPeriods.map(Number)) : 0;
    avgDisplayFps = meanPeriod > 0 ? NS_PER_SEC / meanPeriod : null;
  }

  const frameCount = keptDurations.length;
  // 用于"每帧平均"的分母：优先用有效帧数，无帧则退化为 1 避免除零。
  const frameDivisor = frameCount > 0 ? frameCount : 1;

  const selfMsByFn: Record<string, number> = {};
  const fnStatsByName: Record<string, CaseFnStat> = {};
  for (const fn of report.functions) {
    const selfTotalMs = Number(fn.selfTimeNs) / NS_PER_MS;
    const totalTotalMs = Number(fn.totalTimeNs) / NS_PER_MS;
    selfMsByFn[fn.name] = selfTotalMs;
    fnStatsByName[fn.name] = {
      name: fn.name,
      selfTotalMs,
      totalTotalMs,
      count: fn.count,
      selfPerCallMs: fn.count > 0 ? selfTotalMs / fn.count : 0,
      selfPerFrameMs: selfTotalMs / frameDivisor,
    };
  }

  return {
    fileId: report.source,
    dims: entry.parsedDims,
    frameCount,
    rawFrameCount,
    removedFrameCount,
    avgRenderFps,
    avgDisplayFps,
    avgFrameMs,
    p90FrameMs,
    maxFrameMs,
    wallClockMs: Number(report.wallClockNs) / NS_PER_MS,
    totalEvents: report.totalEvents,
    selfMsByFn,
    fnStatsByName,
  };
}

/** 取某指标的数值（frameCount/frames 缺失时返回 null）。 */
export function metricValue(c: CaseMetrics, key: CaseMetricKey): number | null {
  const v = c[key];
  return v === null || v === undefined ? null : (v as number);
}

/* ------------------------- 配对透视对比 ------------------------- */

export interface PivotCell {
  fileId: string | null;
  value: number | null;
}

export interface PivotRow {
  rowKey: string;
  rowDims: Partial<Record<GroupDimension, string>>;
  cells: Record<string, PivotCell>;
  bestColumn: string | null;
  worstColumn: string | null;
}

export interface PivotTable {
  compareDim: GroupDimension;
  rowDims: GroupDimension[];
  metric: CaseMetricKey;
  columns: string[];
  rows: PivotRow[];
  higherIsBetter: boolean;
}

const ALL_DIMS: GroupDimension[] = ["scene", "algo", "downsample"];

export function buildPivot(
  cases: CaseMetrics[],
  compareDim: GroupDimension,
  metric: CaseMetricKey,
): PivotTable {
  const rowDims = ALL_DIMS.filter((d) => d !== compareDim);
  const higherIsBetter = METRIC_HIGHER_IS_BETTER[metric];

  const columns: string[] = [];
  const rowMap = new Map<string, PivotRow>();

  const rowKeyOf = (c: CaseMetrics) =>
    rowDims.map((d) => `${d}=${c.dims[d] ?? "?"}`).join(" · ");

  for (const c of cases) {
    if (!c.dims.matched) continue;
    const col = c.dims[compareDim] ?? "?";
    if (!columns.includes(col)) columns.push(col);

    const rk = rowKeyOf(c);
    let row = rowMap.get(rk);
    if (!row) {
      const rowDimVals: Partial<Record<GroupDimension, string>> = {};
      for (const d of rowDims) rowDimVals[d] = c.dims[d] ?? "?";
      row = { rowKey: rk, rowDims: rowDimVals, cells: {}, bestColumn: null, worstColumn: null };
      rowMap.set(rk, row);
    }
    if (!row.cells[col]) {
      row.cells[col] = { fileId: c.fileId, value: metricValue(c, metric) };
    }
  }

  columns.sort();
  const rows = [...rowMap.values()];
  for (const row of rows) markBestWorst(row, columns, higherIsBetter);
  rows.sort((a, b) => a.rowKey.localeCompare(b.rowKey));

  return { compareDim, rowDims, metric, columns, rows, higherIsBetter };
}

function markBestWorst(row: PivotRow, columns: string[], higherIsBetter: boolean): void {
  let best: string | null = null;
  let worst: string | null = null;
  for (const col of columns) {
    const cell = row.cells[col];
    if (!cell || cell.value === null) continue;
    if (best === null || compareBetter(cell.value, row.cells[best]!.value!, higherIsBetter)) best = col;
    if (worst === null || compareBetter(row.cells[worst]!.value!, cell.value, higherIsBetter)) worst = col;
  }
  row.bestColumn = best;
  row.worstColumn = worst;
}

function compareBetter(a: number, b: number, higherIsBetter: boolean): boolean {
  return higherIsBetter ? a > b : a < b;
}
