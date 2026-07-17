import type { Diagnostics, Interval, ParseResult, TraceEvent } from "./types";
import { DEFAULT_MAX_STACK_DEPTH } from "./types";

interface OpenFrame {
  id: number;
  name: string;
  startNs: bigint;
  childrenNs: bigint;
}

export interface BuildIntervalsOptions {
  maxStackDepth?: number;
}

export function newDiagnostics(): Diagnostics {
  return {
    totalLines: 0,
    parsedEvents: 0,
    skippedHeaderLines: 0,
    malformedLines: [],
    danglingBegin: 0,
    danglingEnd: 0,
    mismatchedNames: 0,
    negativeDurations: 0,
    stackDepthCapHits: 0,
  };
}

/**
 * 从最近打开（栈顶）向下查找最近的同名打开帧的下标；找不到返回 -1。
 * 保证同名递归按"最近优先"配对，绝不误配对更外层的同名帧。
 */
function findNearestOpen(stack: OpenFrame[], name: string): number {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].name === name) return i;
  }
  return -1;
}

/**
 * 将一个已弹出的帧收尾为 Interval，并把耗时累加到其父帧的 childrenNs 上。
 */
function emitInterval(
  frame: OpenFrame,
  endNs: bigint,
  stack: OpenFrame[],
  intervals: Interval[],
  diag: Diagnostics,
): void {
  let duration = endNs - frame.startNs;
  if (duration < 0n) {
    duration = 0n; // 时钟异常：钳制为 0
    diag.negativeDurations += 1;
  }
  const depth = stack.length; // 尚在其下方打开的帧数
  const parent = stack.length > 0 ? stack[stack.length - 1] : null;
  intervals.push({
    id: frame.id,
    parentId: parent ? parent.id : null,
    name: frame.name,
    startNs: frame.startNs,
    endNs: frame.startNs + duration,
    durationNs: duration,
    depth,
    parentName: parent ? parent.name : null,
    childrenNs: frame.childrenNs,
  });
  if (parent) {
    parent.childrenNs += duration;
  }
}

/**
 * B/E 配对栈状态机：把有序事件流折叠成嵌套调用区间。
 *
 * 容错策略：
 * - 空栈遇 E → danglingEnd（trace 中途开始）。
 * - 栈顶名称匹配 → 立即弹出（栈顶优先匹配，天然正确处理同名递归）。
 * - 栈顶不匹配 → mismatchedNames，findNearestOpen 向下找最近同名帧；
 *   找到则隐式关闭其间帧，未找到则该 E 计入 danglingEnd 并丢弃。
 * - EOF 处栈中剩余帧 → danglingBegin（截断尾部），不产出 Interval。
 * - 负耗时钳制为 0。
 * - 栈深超过上限 → 计 stackDepthCapHits 并丢弃该 B（防病态输入耗尽内存）。
 *
 * 按 CPU 隔离各自的栈。
 */
export function buildIntervals(
  events: Iterable<TraceEvent>,
  diag: Diagnostics = newDiagnostics(),
  opts: BuildIntervalsOptions = {},
): ParseResult {
  const maxDepth = opts.maxStackDepth ?? DEFAULT_MAX_STACK_DEPTH;
  const stacks = new Map<number, OpenFrame[]>();
  const intervals: Interval[] = [];
  let nextId = 0;

  const getStack = (cpu: number): OpenFrame[] => {
    let s = stacks.get(cpu);
    if (!s) {
      s = [];
      stacks.set(cpu, s);
    }
    return s;
  };

  for (const ev of events) {
    const stack = getStack(ev.cpu);

    if (ev.phase === "B") {
      if (stack.length >= maxDepth) {
        diag.stackDepthCapHits += 1;
        continue; // 病态输入保护：不再压栈
      }
      stack.push({ id: nextId++, name: ev.name, startNs: ev.timestampNs, childrenNs: 0n });
      continue;
    }

    // ev.phase === "E"
    if (stack.length === 0) {
      diag.danglingEnd += 1; // trace 中途开始
      continue;
    }

    const top = stack[stack.length - 1];
    if (top.name !== ev.name) {
      // 恢复路径：仅当栈顶不匹配时触发
      diag.mismatchedNames += 1;
      const idx = findNearestOpen(stack, ev.name);
      if (idx < 0) {
        diag.danglingEnd += 1;
        continue;
      }
      // 隐式关闭 idx 之上的所有帧（在当前时间戳处收尾）
      while (stack.length - 1 > idx) {
        const f = stack.pop()!;
        emitInterval(f, ev.timestampNs, stack, intervals, diag);
      }
    }

    const frame = stack.pop()!;
    emitInterval(frame, ev.timestampNs, stack, intervals, diag);
  }

  // EOF：任何仍打开的帧都属截断，计入 danglingBegin，不产出 Interval。
  for (const stack of stacks.values()) {
    diag.danglingBegin += stack.length;
  }

  return { intervals, diagnostics: diag };
}
