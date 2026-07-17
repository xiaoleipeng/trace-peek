import type { AnomalyFilterConfig, AnomalyReport, RemovedSample } from "./types";
import { meanNumber, percentileSorted } from "./stats";

export interface AnomalyFilterResult {
  kept: bigint[];
  report: AnomalyReport;
}

export const DEFAULT_ANOMALY_CONFIG: AnomalyFilterConfig = {
  dropIncompleteFrames: true,
  warmupFrames: 1,
  method: "none",
};

/**
 * 计算某方法下的"超大值上界"。大于该上界者视为异常离群（应剔除）。
 * 与 applyAnomalyFilter 内部阈值一致，供 UI 逐条标记异常。
 * 返回 null 表示不设上界（method="none" 或样本不足）。
 */
export function outlierUpperBound(
  values: number[],
  method: "none" | "percentile" | "iqr" | "mad",
): number | null {
  if (method === "none" || values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a - b);
  switch (method) {
    case "percentile":
      return percentileSorted(sorted, 99);
    case "iqr": {
      const q1 = percentileSorted(sorted, 25);
      const q3 = percentileSorted(sorted, 75);
      return q3 + 1.5 * (q3 - q1);
    }
    case "mad": {
      const med = percentileSorted(sorted, 50);
      const absDev = values.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
      const mad = percentileSorted(absDev, 50);
      return med + 3 * mad;
    }
    default:
      return null;
  }
}

/**
 * 统计层（值级）异常剔除。
 *
 * 剔除顺序：
 *  (b1) 不完整帧守卫（启发式，仅当 isFrameSeries 且能判定首/末帧被截断时移除）
 *  (b2) 丢弃前 N 帧预热
 *  (b3) 离群值方法 none/percentile/iqr/mad
 *
 * 核心原则：默认 method="none" 时不做值级剔除；无论如何都满足
 * keptCount + removedCount == originalCount（正确性属性 13）。
 *
 * 说明：未配对的边界帧已由 buildIntervals 自动排除，不在此处处理、不重复计数。
 * dropIncompleteFrames 仅作为启发式，作用于"已配对但疑似被截断"的首/末帧；
 * 由于是否"被截断"需要外部语境判断，这里以可选谓词 isTruncated 表达；
 * 未提供时该守卫为空操作（保持默认保守，不误删健康帧）。
 */
export function applyAnomalyFilter(
  values: bigint[],
  cfg: AnomalyFilterConfig = DEFAULT_ANOMALY_CONFIG,
  opts: {
    isFrameSeries?: boolean;
    isTruncated?: (value: bigint, index: number, all: bigint[]) => boolean;
  } = {},
): AnomalyFilterResult {
  const original = values;
  const originalCount = original.length;
  const removed: RemovedSample[] = [];

  let working = [...values];

  // (b1) 不完整帧守卫（启发式）
  if (cfg.dropIncompleteFrames && opts.isFrameSeries && opts.isTruncated) {
    // 检查首帧
    if (working.length > 0 && opts.isTruncated(working[0], 0, working)) {
      const v = working.shift()!;
      removed.push({ value: Number(v), reason: "incomplete-frame" });
    }
    // 检查末帧
    const lastIdx = working.length - 1;
    if (lastIdx >= 0 && opts.isTruncated(working[lastIdx], lastIdx, working)) {
      const v = working.pop()!;
      removed.push({ value: Number(v), reason: "incomplete-frame" });
    }
  }

  // (b2) 丢弃前 N 帧预热
  const warmup = Math.max(0, Math.floor(cfg.warmupFrames));
  for (let i = 0; i < warmup && working.length > 0; i++) {
    const v = working.shift()!;
    removed.push({ value: Number(v), reason: "warmup" });
  }

  // (b3) 离群值方法
  if (cfg.method !== "none" && working.length > 0) {
    const asNum = working.map(Number);
    const sorted = [...asNum].sort((a, b) => a - b);

    let predicate: (v: number) => boolean;
    let reason: string;

    switch (cfg.method) {
      case "percentile": {
        const p99 = percentileSorted(sorted, 99);
        predicate = (v) => v > p99;
        reason = "> p99";
        break;
      }
      case "iqr": {
        const q1 = percentileSorted(sorted, 25);
        const q3 = percentileSorted(sorted, 75);
        const upper = q3 + 1.5 * (q3 - q1);
        predicate = (v) => v > upper;
        reason = "> Q3+1.5IQR";
        break;
      }
      case "mad": {
        const med = percentileSorted(sorted, 50);
        const absDev = asNum.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
        const mad = percentileSorted(absDev, 50);
        predicate = (v) => Math.abs(v - med) > 3 * mad;
        reason = "> 3*MAD";
        break;
      }
      default:
        predicate = () => false;
        reason = "";
    }

    const next: bigint[] = [];
    for (const v of working) {
      if (predicate(Number(v))) {
        removed.push({ value: Number(v), reason });
      } else {
        next.push(v);
      }
    }
    working = next;
  }

  const report: AnomalyReport = {
    method: cfg.method,
    originalCount,
    removedCount: removed.length,
    keptCount: working.length,
    removedSamples: removed,
    avgBefore: meanNumber(original.map(Number)),
    avgAfter: meanNumber(working.map(Number)),
  };

  return { kept: working, report };
}
