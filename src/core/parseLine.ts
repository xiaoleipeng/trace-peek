import type { TraceEvent } from "./types";

/**
 * 单次捕获的事件行正则。字段：
 *   1 task, 2 cpu, 3 seconds, 4 nanos, 5 phase(B/E), 6 markerId, 7 name
 * 例：
 *   LVGL-1 [0] 85.880882456: tracing_mark_write: B|1|event_cb
 */
const EVENT_RE =
  /^\s*(\S+)\s+\[(\d+)\]\s+(\d+)\.(\d+):\s+tracing_mark_write:\s+([BE])\|(\d+)\|(.+?)\s*$/;

const NS_PER_SEC = 1_000_000_000n;

/**
 * 解析单行 trace 文本为 TraceEvent。
 *
 * - 头部行（以 `#` 开头）、空行、无法匹配事件语法的行返回 null（由调用方记入诊断）。
 * - 纯函数、无副作用、确定性：相同输入行始终产出相同输出（正确性属性 12）。
 *
 * @param line   单行文本（不含换行符）
 * @param lineNo 1 起始的源行号
 */
export function parseLine(line: string, lineNo: number): TraceEvent | null {
  // 头部行 / 空行：快速跳过。
  const trimmed = line.trimStart();
  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return null;
  }

  const m = EVENT_RE.exec(line);
  if (m === null) {
    return null;
  }

  const [, task, cpuStr, secStr, nanoStr, phase, markerStr, name] = m;

  // 纳秒对齐：小数部分补齐到 9 位再转 bigint，避免精度丢失。
  const nanosPadded = (nanoStr + "000000000").slice(0, 9);
  const timestampNs = BigInt(secStr) * NS_PER_SEC + BigInt(nanosPadded);

  return {
    task,
    cpu: Number(cpuStr),
    timestampNs,
    phase: phase as "B" | "E",
    markerId: Number(markerStr),
    name,
    lineNo,
  };
}

/** 判断一行是否为头部行或空行（供解析主循环统计 skippedHeaderLines）。 */
export function isHeaderOrBlank(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.length === 0 || trimmed.startsWith("#");
}
