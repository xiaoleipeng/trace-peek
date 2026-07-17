import type { TraceEvent } from "./types";

/**
 * 测试辅助：构造 TraceEvent 的简易工厂。
 */
export function ev(
  phase: "B" | "E",
  name: string,
  timestampNs: bigint | number,
  cpu = 0,
  lineNo = 0,
): TraceEvent {
  return {
    task: "LVGL-1",
    cpu,
    timestampNs: BigInt(timestampNs),
    phase,
    markerId: 1,
    name,
    lineNo,
  };
}

/**
 * 一棵用于往返测试的调用树节点。
 */
export interface CallNode {
  name: string;
  children: CallNode[];
}

/**
 * 把调用树展平成有序的 (phase,name) 事件序列，并赋予单调递增时间戳。
 * 每个 B 与其对应 E 之间、以及相邻事件之间，时间戳步进 step。
 */
export function treeToEvents(
  roots: CallNode[],
  startNs = 0n,
  step = 1n,
): TraceEvent[] {
  const events: TraceEvent[] = [];
  let t = startNs;
  let line = 1;
  const walk = (node: CallNode) => {
    events.push(ev("B", node.name, t, 0, line++));
    t += step;
    for (const c of node.children) walk(c);
    events.push(ev("E", node.name, t, 0, line++));
    t += step;
  };
  for (const r of roots) walk(r);
  return events;
}

/** 统计事件序列中的 B / E 数量。 */
export function countPhases(events: TraceEvent[]): { b: number; e: number } {
  let b = 0;
  let e = 0;
  for (const x of events) {
    if (x.phase === "B") b++;
    else e++;
  }
  return { b, e };
}
