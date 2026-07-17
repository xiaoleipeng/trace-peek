/** 展示层格式化工具：bigint 纳秒 → 可读字符串。 */

export function nsToMs(ns: bigint | number): number {
  return Number(ns) / 1_000_000;
}

export function nsToUs(ns: bigint | number): number {
  return Number(ns) / 1_000;
}

/** 自适应单位：ns/µs/ms。 */
export function fmtDuration(ns: bigint | number): string {
  const n = Number(ns);
  if (n < 1_000) return `${n.toFixed(0)} ns`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(2)} µs`;
  return `${(n / 1_000_000).toFixed(3)} ms`;
}

export function fmtFps(fps: number | null): string {
  return fps === null ? "—" : `${fps.toFixed(1)} FPS`;
}

export function fmtNumber(n: number, digits = 2): string {
  return n.toFixed(digits);
}
