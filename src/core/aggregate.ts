import type {
  AnalysisReport,
  FunctionStats,
  Interval,
  ParseResult,
} from "./types";
import {
  maxBig,
  meanNumber,
  minBig,
  percentileSorted,
  sumBig,
} from "./stats";

interface MutableStats {
  name: string;
  count: number;
  totalTimeNs: bigint;
  selfTimeNs: bigint;
  durations: number[]; // number 纳秒，用于百分位
  minNs: bigint;
  maxNs: bigint;
}

/**
 * 把区间列表按函数名聚合成 FunctionStats。
 *
 * self time 通过 interval.childrenNs 精确分解：
 *   selfTimeNs = durationNs - childrenNs（childrenNs 在 buildIntervals 中累加）。
 * 满足属性 10(b)：selfTimeNs + Σ(直接子区间 durationNs) == durationNs。
 */
export function aggregate(
  result: ParseResult,
  meta: { source: string },
): AnalysisReport {
  const byName = new Map<string, MutableStats>();

  let firstTs: bigint | null = null;
  let lastTs: bigint | null = null;

  for (const iv of result.intervals) {
    if (firstTs === null || iv.startNs < firstTs) firstTs = iv.startNs;
    if (lastTs === null || iv.endNs > lastTs) lastTs = iv.endNs;

    let s = byName.get(iv.name);
    if (!s) {
      s = {
        name: iv.name,
        count: 0,
        totalTimeNs: 0n,
        selfTimeNs: 0n,
        durations: [],
        minNs: iv.durationNs,
        maxNs: iv.durationNs,
      };
      byName.set(iv.name, s);
    }
    let self = iv.durationNs - iv.childrenNs;
    if (self < 0n) self = 0n; // 防御：钳制/浮点噪声
    s.count += 1;
    s.totalTimeNs += iv.durationNs;
    s.selfTimeNs += self;
    s.durations.push(Number(iv.durationNs));
    if (iv.durationNs < s.minNs) s.minNs = iv.durationNs;
    if (iv.durationNs > s.maxNs) s.maxNs = iv.durationNs;
  }

  const functions: FunctionStats[] = [];
  for (const s of byName.values()) {
    const sorted = [...s.durations].sort((a, b) => a - b);
    functions.push({
      name: s.name,
      count: s.count,
      totalTimeNs: s.totalTimeNs,
      selfTimeNs: s.selfTimeNs,
      minNs: s.minNs,
      maxNs: s.maxNs,
      avgNs: meanNumber(s.durations),
      p50Ns: percentileSorted(sorted, 50),
      p90Ns: percentileSorted(sorted, 90),
      p99Ns: percentileSorted(sorted, 99),
    });
  }

  // 默认按 selfTime 降序，便于直接看热点。
  functions.sort((a, b) => Number(b.selfTimeNs - a.selfTimeNs));

  const wallClockNs =
    firstTs !== null && lastTs !== null ? lastTs - firstTs : 0n;

  return {
    source: meta.source,
    wallClockNs,
    totalEvents: result.diagnostics.parsedEvents,
    functions,
    diagnostics: result.diagnostics,
  };
}

/** 顶层（depth==0）区间耗时之和，用于属性 10(a) 的核算。 */
export function topLevelDurationSum(intervals: Interval[]): bigint {
  return sumBig(intervals.filter((i) => i.depth === 0).map((i) => i.durationNs));
}

export { minBig, maxBig };
