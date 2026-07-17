import type { CaseMetrics, CaseMetricKey } from "./caseAnalysis";
import { metricValue, METRIC_HIGHER_IS_BETTER } from "./caseAnalysis";

/**
 * 两种业务对比视图：
 *
 * 需求 1（横向对比）：固定同一文件(scene)，看它在 不同采样率 × 不同算法 下的差异。
 *   → 行 = algo，列 = downsample，每格为该 (scene,algo,downsample) 唯一文件的真实值。
 *
 * 需求 2（纵向对比）：固定同采样率 + 同算法，看 不同文件(scene) 的差异。
 *   → 行 = scene（不同 case），单列指标，纵向排列。
 */

export interface GridCell {
  fileId: string | null;
  value: number | null;
  isBest?: boolean;
  isWorst?: boolean;
}

/* ---------------- 需求 1：单文件的 采样率×算法 网格 ---------------- */

export interface HScenarioGrid {
  scene: string;
  metric: CaseMetricKey;
  algos: string[]; // 行
  downsamples: string[]; // 列
  cells: Record<string, Record<string, GridCell>>; // [algo][downsample]
  higherIsBetter: boolean;
}

/** 列出所有出现过的 scene，供 UI 下拉选择。 */
export function listScenes(cases: CaseMetrics[]): string[] {
  const s = new Set<string>();
  for (const c of cases) if (c.dims.matched && c.dims.scene) s.add(c.dims.scene);
  return [...s].sort();
}

export function buildScenarioGrid(
  cases: CaseMetrics[],
  scene: string,
  metric: CaseMetricKey,
): HScenarioGrid {
  const higherIsBetter = METRIC_HIGHER_IS_BETTER[metric];
  const subset = cases.filter((c) => c.dims.matched && c.dims.scene === scene);

  const algos = [...new Set(subset.map((c) => c.dims.algo ?? "?"))].sort();
  const downsamples = [...new Set(subset.map((c) => c.dims.downsample ?? "?"))].sort();

  const cells: Record<string, Record<string, GridCell>> = {};
  for (const a of algos) {
    cells[a] = {};
    for (const d of downsamples) cells[a][d] = { fileId: null, value: null };
  }
  for (const c of subset) {
    const a = c.dims.algo ?? "?";
    const d = c.dims.downsample ?? "?";
    if (!cells[a][d].fileId) {
      cells[a][d] = { fileId: c.fileId, value: metricValue(c, metric) };
    }
  }

  // 全网格范围内标注 best/worst（横向对比：看采样率与算法差异）
  let best: GridCell | null = null;
  let worst: GridCell | null = null;
  for (const a of algos)
    for (const d of downsamples) {
      const cell = cells[a][d];
      if (cell.value === null) continue;
      if (!best || better(cell.value, best.value!, higherIsBetter)) best = cell;
      if (!worst || better(worst.value!, cell.value, higherIsBetter)) worst = cell;
    }
  if (best) best.isBest = true;
  if (worst) worst.isWorst = true;

  return { scene, metric, algos, downsamples, cells, higherIsBetter };
}

/* ---------------- 需求 2：固定 算法+采样率 的跨文件纵向对比 ---------------- */

export interface VComboRow {
  scene: string;
  fileId: string;
  value: number | null;
  isBest?: boolean;
  isWorst?: boolean;
}

export interface VerticalCompare {
  algo: string;
  downsample: string;
  metric: CaseMetricKey;
  rows: VComboRow[]; // 不同 scene，纵向
  higherIsBetter: boolean;
}

/** 列出所有 (algo,downsample) 组合，供 UI 选择。 */
export function listAlgoDsCombos(
  cases: CaseMetrics[],
): { algo: string; downsample: string }[] {
  const set = new Map<string, { algo: string; downsample: string }>();
  for (const c of cases) {
    if (!c.dims.matched) continue;
    const a = c.dims.algo ?? "?";
    const d = c.dims.downsample ?? "?";
    set.set(`${a}|${d}`, { algo: a, downsample: d });
  }
  return [...set.values()].sort(
    (x, y) => x.algo.localeCompare(y.algo) || x.downsample.localeCompare(y.downsample),
  );
}

export function buildVerticalCompare(
  cases: CaseMetrics[],
  algo: string,
  downsample: string,
  metric: CaseMetricKey,
): VerticalCompare {
  const higherIsBetter = METRIC_HIGHER_IS_BETTER[metric];
  const subset = cases.filter(
    (c) => c.dims.matched && c.dims.algo === algo && c.dims.downsample === downsample,
  );

  const rows: VComboRow[] = subset.map((c) => ({
    scene: c.dims.scene ?? "?",
    fileId: c.fileId,
    value: metricValue(c, metric),
  }));
  rows.sort((a, b) => a.scene.localeCompare(b.scene));

  let best: VComboRow | null = null;
  let worst: VComboRow | null = null;
  for (const r of rows) {
    if (r.value === null) continue;
    if (!best || better(r.value, best.value!, higherIsBetter)) best = r;
    if (!worst || better(worst.value!, r.value, higherIsBetter)) worst = r;
  }
  if (best) best.isBest = true;
  if (worst) worst.isWorst = true;

  return { algo, downsample, metric, rows, higherIsBetter };
}

function better(a: number, b: number, higherIsBetter: boolean): boolean {
  return higherIsBetter ? a > b : a < b;
}
