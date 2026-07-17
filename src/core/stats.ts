/**
 * 通用统计工具（纯函数）。
 * 百分位以 number 计算（纳秒量级在 2^53 内安全），耗时输入为 bigint。
 */

/** 升序排序的 number 数组上的线性插值百分位。p ∈ [0,100]。 */
export function percentileSorted(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAsc[0];
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

export function meanNumber(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function medianSorted(sortedAsc: number[]): number {
  return percentileSorted(sortedAsc, 50);
}

/** bigint 数组求和。 */
export function sumBig(values: bigint[]): bigint {
  let s = 0n;
  for (const v of values) s += v;
  return s;
}

export function minBig(values: bigint[]): bigint {
  let m = values[0];
  for (const v of values) if (v < m) m = v;
  return m;
}

export function maxBig(values: bigint[]): bigint {
  let m = values[0];
  for (const v of values) if (v > m) m = v;
  return m;
}

export const NS_PER_MS = 1_000_000;
export const NS_PER_US = 1_000;
export const NS_PER_SEC = 1_000_000_000;
