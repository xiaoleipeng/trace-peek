import type { AnalysisReport, Interval } from "./types";
import type { MetricSpec } from "./groupCompare";
import { percentileSorted, meanNumber } from "./stats";
import { outlierUpperBound } from "./applyAnomalyFilter";

/**
 * 点击某根柱时，展开该格（单个文件）背后的原始数据，便于排查数据正确性。
 *
 * 关键：统计摘要（均值/P50/...）与图表口径一致——**基于剔除异常后的样本**计算，
 * 但仍把异常样本显示出来并标红，做到"看得见、但不污染统计"。
 */

export interface RawSample {
  index: number;
  label: string; // 帧序号或 "调用#/帧k"
  valueMs: number;
  isOutlier: boolean; // 是否被判定为超大异常（不计入统计）
}

export interface CellDetail {
  fileId: string;
  metricLabel: string;
  unit: string;
  samples: RawSample[]; // 全部样本（含异常，异常标红）
  count: number; // 参与统计的样本数（剔除异常后）
  outlierCount: number; // 被剔除的异常样本数
  meanMs: number; // 以下摘要均基于剔除异常后的样本
  p50Ms: number;
  p90Ms: number;
  maxMs: number;
  upperBound: number | null; // 异常判定上界（用于图上标线）
  note?: string;
}

const NS_PER_MS = 1_000_000;

function summarize(values: number[]): { mean: number; p50: number; p90: number; max: number } {
  if (values.length === 0) return { mean: 0, p50: 0, p90: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: meanNumber(values),
    p50: percentileSorted(sorted, 50),
    p90: percentileSorted(sorted, 90),
    max: sorted[sorted.length - 1],
  };
}

export function buildCellDetail(
  fileId: string,
  metric: MetricSpec,
  report: AnalysisReport | undefined,
  intervals: Interval[] | undefined,
  outlierMethod: "none" | "percentile" | "iqr" | "mad" = "iqr",
): CellDetail {
  // 先取出全部原始值（ms）与标签
  let rawValues: number[];
  let labelOf: (i: number) => string;
  let metricLabel: string;

  if (metric.kind === "frame") {
    const durations = report?.frames?.frameDurationsNs ?? [];
    rawValues = durations.map((d) => Number(d) / NS_PER_MS);
    labelOf = (i) => `帧 ${i}`;
    metricLabel = "每帧渲染耗时";
  } else {
    const needle = metric.fn.trim().toLowerCase();
    const ivs = (intervals ?? []).filter((iv) => iv.name.toLowerCase().includes(needle));
    rawValues = ivs.map((iv) => {
      let self = iv.durationNs - iv.childrenNs;
      if (self < 0n) self = 0n;
      return Number(self) / NS_PER_MS;
    });
    labelOf = (i) => `${metric.fn} #${i}`;
    metricLabel = `${metric.fn} 每次调用 self`;
  }

  // 计算异常上界，逐条标记；统计摘要仅基于非异常样本（与图表一致）
  const upperBound = outlierUpperBound(rawValues, outlierMethod);
  const samples: RawSample[] = rawValues.map((v, i) => ({
    index: i,
    label: labelOf(i),
    valueMs: v,
    isOutlier: upperBound !== null && v > upperBound,
  }));
  const kept = samples.filter((s) => !s.isOutlier).map((s) => s.valueMs);
  const outlierCount = samples.length - kept.length;
  const s = summarize(kept);

  return {
    fileId,
    metricLabel,
    unit: "ms",
    samples,
    count: kept.length,
    outlierCount,
    meanMs: s.mean,
    p50Ms: s.p50,
    p90Ms: s.p90,
    maxMs: s.max,
    upperBound,
    note:
      kept.length < 5
        ? "有效样本量偏少，均值可能不稳定，建议结合 P50 判断"
        : outlierCount > 0
          ? `已剔除 ${outlierCount} 个异常样本（超过上界 ${upperBound?.toFixed(2)} ms），未计入统计`
          : undefined,
  };
}
