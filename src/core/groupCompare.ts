import type { CaseMetrics, CaseMetricKey } from "./caseAnalysis";
import { metricValue, METRIC_HIGHER_IS_BETTER } from "./caseAnalysis";
import type { GroupDimension } from "./types";

/**
 * 分组柱状图数据：一次性展示所有文件。
 *
 * 统一模型：选一个「变化维度」seriesDim，其取值作为图例(系列)；
 * 其余两个维度组合成 X 轴分类。每个文件恰好落入一个 (category, series) 格 = 一根柱。
 *
 * 三种业务视图：
 *  - 不同算法：seriesDim = algo        → X = (scene, downsample)
 *  - 不同采样率：seriesDim = downsample → X = (scene, algo)
 *  - 不同文件：seriesDim = scene        → X = (algo, downsample)
 *
 * 指标可为帧级指标（CaseMetricKey），也可为某函数的 self 耗时（ms）。
 */

/** 函数 self 的聚合口径：每次调用平均(默认,最公平) / 每帧平均 / 累计总和。 */
export type FnAgg = "perCall" | "perFrame" | "total";

export type MetricSpec =
  | { kind: "frame"; key: CaseMetricKey }
  | { kind: "fnSelf"; fn: string; agg: FnAgg }; // 该函数 self 耗时(ms)，按子串匹配聚合

export interface GroupedSeries {
  name: string; // 系列名 = seriesDim 的取值
  data: (number | null)[]; // 对齐 categories
  fileIds: (string | null)[]; // 每格对应文件
}

export interface GroupedChart {
  seriesDim: GroupDimension;
  categoryDims: GroupDimension[];
  categories: string[]; // X 轴分类
  series: GroupedSeries[];
  higherIsBetter: boolean;
  metricLabel: string;
  unit: string;
}

const ALL_DIMS: GroupDimension[] = ["scene", "algo", "downsample"];

/**
 * 自然排序：按数字段的数值比较，使 feather_64_64 排在 feather_128_128 之前，
 * 而不是字典序把 "128" 排在 "64" 前面。
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** 取某文件在给定指标下的值。 */
function valueOf(c: CaseMetrics, metric: MetricSpec): number | null {
  if (metric.kind === "frame") return metricValue(c, metric.key);
  // fnSelf：把命中关键词(子串, 不区分大小写)的所有函数按选定口径聚合。
  const needle = metric.fn.trim().toLowerCase();
  if (!needle) return null;
  let selfTotal = 0;
  let callCount = 0;
  let hit = false;
  for (const stat of Object.values(c.fnStatsByName)) {
    if (stat.name.toLowerCase().includes(needle)) {
      selfTotal += stat.selfTotalMs;
      callCount += stat.count;
      hit = true;
    }
  }
  if (!hit) return null;
  switch (metric.agg) {
    case "total":
      return selfTotal;
    case "perFrame":
      // 每帧平均：用该文件有效帧数，消除帧数差异带来的不可比。
      return c.frameCount > 0 ? selfTotal / c.frameCount : null;
    case "perCall":
    default:
      // 每次调用平均：最能反映算法单次开销，消除调用次数/帧数差异。
      return callCount > 0 ? selfTotal / callCount : null;
  }
}

function metricMeta(metric: MetricSpec): {
  higherIsBetter: boolean;
  label: string;
  unit: string;
} {
  if (metric.kind === "frame") {
    return {
      higherIsBetter: METRIC_HIGHER_IS_BETTER[metric.key],
      label: metric.key,
      unit: metric.key.includes("Fps") ? "FPS" : metric.key === "frameCount" ? "帧" : "ms",
    };
  }
  const aggLabel =
    metric.agg === "total" ? "累计" : metric.agg === "perFrame" ? "每帧" : "每次调用";
  return { higherIsBetter: false, label: `self:${metric.fn}(${aggLabel})`, unit: "ms" };
}

export function buildGroupedChart(
  cases: CaseMetrics[],
  seriesDim: GroupDimension,
  metric: MetricSpec,
): GroupedChart {
  const categoryDims = ALL_DIMS.filter((d) => d !== seriesDim);
  const meta = metricMeta(metric);

  const catKey = (c: CaseMetrics) =>
    categoryDims.map((d) => c.dims[d] ?? "?").join(" · ");

  // 收集分类与系列（保持稳定排序）
  const categorySet = new Set<string>();
  const seriesSet = new Set<string>();
  for (const c of cases) {
    if (!c.dims.matched) continue;
    categorySet.add(catKey(c));
    seriesSet.add(c.dims[seriesDim] ?? "?");
  }
  const categories = [...categorySet].sort(naturalCompare);
  const seriesNames = [...seriesSet].sort(naturalCompare);

  const catIndex = new Map(categories.map((c, i) => [c, i]));

  const series: GroupedSeries[] = seriesNames.map((sName) => ({
    name: sName,
    data: new Array<number | null>(categories.length).fill(null),
    fileIds: new Array<string | null>(categories.length).fill(null),
  }));
  const seriesIndex = new Map(seriesNames.map((s, i) => [s, i]));

  for (const c of cases) {
    if (!c.dims.matched) continue;
    const ci = catIndex.get(catKey(c));
    const si = seriesIndex.get(c.dims[seriesDim] ?? "?");
    if (ci === undefined || si === undefined) continue;
    // 同格若有多个文件（重复 case）取先到者
    if (series[si].fileIds[ci] === null) {
      series[si].data[ci] = valueOf(c, metric);
      series[si].fileIds[ci] = c.fileId;
    }
  }

  return {
    seriesDim,
    categoryDims,
    categories,
    series,
    higherIsBetter: meta.higherIsBetter,
    metricLabel: meta.label,
    unit: meta.unit,
  };
}

/** 列出所有 case 中出现过的函数名（供 self 指标选择，如 blur/finish）。 */
export function listFunctionNames(cases: CaseMetrics[]): string[] {
  const s = new Set<string>();
  for (const c of cases) for (const name of Object.keys(c.selfMsByFn)) s.add(name);
  return [...s].sort();
}
