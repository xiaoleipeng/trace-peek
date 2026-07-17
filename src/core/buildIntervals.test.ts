import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildIntervals, newDiagnostics } from "./buildIntervals";
import { ev, treeToEvents, countPhases, type CallNode } from "./testutil";
import type { TraceEvent } from "./types";

describe("buildIntervals — 基本行为", () => {
  it("简单嵌套配对", () => {
    const events = [
      ev("B", "a", 0),
      ev("B", "b", 1),
      ev("E", "b", 3),
      ev("E", "a", 5),
    ];
    const { intervals, diagnostics } = buildIntervals(events);
    expect(intervals).toHaveLength(2);
    const b = intervals.find((i) => i.name === "b")!;
    const a = intervals.find((i) => i.name === "a")!;
    expect(b.durationNs).toBe(2n);
    expect(b.depth).toBe(1);
    expect(b.parentName).toBe("a");
    expect(a.durationNs).toBe(5n);
    expect(a.depth).toBe(0);
    expect(a.parentName).toBeNull();
    // a 的直接子项耗时 = b 的耗时
    expect(a.childrenNs).toBe(2n);
    expect(diagnostics.danglingBegin).toBe(0);
    expect(diagnostics.danglingEnd).toBe(0);
  });

  it("悬空 E（中途开始）计入 danglingEnd 并被丢弃", () => {
    const events = [ev("E", "x", 0), ev("E", "y", 1), ev("B", "a", 2), ev("E", "a", 3)];
    const { intervals, diagnostics } = buildIntervals(events);
    expect(diagnostics.danglingEnd).toBe(2);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].name).toBe("a");
  });

  it("悬空 B（EOF 截断）计入 danglingBegin 且不产出 interval", () => {
    const events = [ev("B", "a", 0), ev("B", "b", 1)];
    const { intervals, diagnostics } = buildIntervals(events);
    expect(diagnostics.danglingBegin).toBe(2);
    expect(intervals).toHaveLength(0);
  });

  it("名称不匹配：向下找到最近同名帧，隐式关闭中间帧", () => {
    // B a, B b, E a  —— 栈顶是 b，但来了 E a
    const events = [ev("B", "a", 0), ev("B", "b", 1), ev("E", "a", 4)];
    const { intervals, diagnostics } = buildIntervals(events);
    expect(diagnostics.mismatchedNames).toBe(1);
    // b 被隐式关闭，a 正常关闭
    expect(intervals.map((i) => i.name).sort()).toEqual(["a", "b"]);
    const a = intervals.find((i) => i.name === "a")!;
    expect(a.durationNs).toBe(4n);
  });

  it("名称不匹配且找不到同名帧：计入 danglingEnd 并丢弃", () => {
    const events = [ev("B", "a", 0), ev("E", "zzz", 1), ev("E", "a", 2)];
    const { intervals, diagnostics } = buildIntervals(events);
    expect(diagnostics.mismatchedNames).toBe(1);
    expect(diagnostics.danglingEnd).toBe(1);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].name).toBe("a");
  });

  it("负耗时被钳制为 0 并计数", () => {
    const events = [ev("B", "a", 10), ev("E", "a", 5)];
    const { intervals, diagnostics } = buildIntervals(events);
    expect(diagnostics.negativeDurations).toBe(1);
    expect(intervals[0].durationNs).toBe(0n);
  });

  it("多 CPU 栈相互隔离", () => {
    const events = [
      ev("B", "a", 0, 0),
      ev("B", "a", 0, 1),
      ev("E", "a", 2, 1),
      ev("E", "a", 4, 0),
    ];
    const { intervals } = buildIntervals(events);
    expect(intervals).toHaveLength(2);
    const durations = intervals.map((i) => i.durationNs).sort();
    expect(durations).toEqual([2n, 4n]);
  });

  it("栈深上限保护：超限的 B 被丢弃并计数", () => {
    const events: TraceEvent[] = [];
    for (let i = 0; i < 10; i++) events.push(ev("B", `n${i}`, i));
    const { diagnostics } = buildIntervals(events, newDiagnostics(), {
      maxStackDepth: 4,
    });
    expect(diagnostics.stackDepthCapHits).toBe(6);
  });
});

// ------------------ 属性测试 ------------------

// 生成随机调用树
const leaf: fc.Arbitrary<CallNode> = fc.record({
  name: fc.constantFrom("a", "b", "c", "d"),
  children: fc.constant([] as CallNode[]),
});
const treeArb: fc.Arbitrary<CallNode> = fc.letrec<{ node: CallNode }>((tie) => ({
  node: fc.oneof(
    { depthSize: "small" },
    leaf,
    fc.record({
      name: fc.constantFrom("a", "b", "c", "d"),
      children: fc.array(tie("node"), { maxLength: 3 }),
    }),
  ),
})).node;

describe("buildIntervals — 属性测试", () => {
  it("属性 1：耗时非负性（durationNs >= 0）", () => {
    fc.assert(
      fc.property(fc.array(treeArb, { maxLength: 4 }), (roots) => {
        const events = treeToEvents(roots);
        const { intervals } = buildIntervals(events);
        for (const iv of intervals) {
          expect(iv.durationNs >= 0n).toBe(true);
          expect(iv.endNs >= iv.startNs).toBe(true);
        }
      }),
    );
  });

  it("属性 3：良构流 B/E 配对守恒", () => {
    fc.assert(
      fc.property(fc.array(treeArb, { maxLength: 4 }), (roots) => {
        const events = treeToEvents(roots);
        const { b, e } = countPhases(events);
        const { intervals, diagnostics } = buildIntervals(events);
        expect(intervals.length).toBe(b);
        expect(intervals.length).toBe(e);
        expect(diagnostics.danglingBegin).toBe(0);
        expect(diagnostics.danglingEnd).toBe(0);
        expect(diagnostics.mismatchedNames).toBe(0);
      }),
    );
  });

  it("属性 4：良构嵌套往返一致（区间数量与名称多重集不变）", () => {
    fc.assert(
      fc.property(fc.array(treeArb, { maxLength: 4 }), (roots) => {
        const events = treeToEvents(roots);
        const { intervals } = buildIntervals(events);
        // 事件里的 B 名称多重集应等于产出的 interval 名称多重集
        const bNames = events.filter((x) => x.phase === "B").map((x) => x.name).sort();
        const ivNames = intervals.map((i) => i.name).sort();
        expect(ivNames).toEqual(bNames);
      }),
    );
  });

  it("属性 5：悬空 end 容忍性（前置 k 个 E → danglingEnd == k）", () => {
    fc.assert(
      fc.property(
        fc.array(treeArb, { maxLength: 3 }),
        fc.integer({ min: 0, max: 5 }),
        (roots, k) => {
          const good = treeToEvents(roots, 1000n);
          const prefix: TraceEvent[] = [];
          for (let i = 0; i < k; i++) prefix.push(ev("E", "ghost", i));
          const { intervals, diagnostics } = buildIntervals([...prefix, ...good]);
          expect(diagnostics.danglingEnd).toBe(k);
          // 其余 interval 数量不受影响
          const { b } = countPhases(good);
          expect(intervals.length).toBe(b);
        },
      ),
    );
  });

  it("属性 6：悬空 begin 容忍性（EOF 保留 k 个打开 B → danglingBegin == k）", () => {
    fc.assert(
      fc.property(
        fc.array(treeArb, { maxLength: 3 }),
        fc.integer({ min: 0, max: 5 }),
        (roots, k) => {
          const good = treeToEvents(roots);
          const tail: TraceEvent[] = [];
          for (let i = 0; i < k; i++) tail.push(ev("B", "open", 100000 + i));
          const run = () => buildIntervals([...good, ...tail]);
          expect(run).not.toThrow();
          const { diagnostics } = run();
          expect(diagnostics.danglingBegin).toBe(k);
        },
      ),
    );
  });

  it("属性 8：自身耗时分解（parent.duration >= Σ 直接子项耗时）", () => {
    fc.assert(
      fc.property(fc.array(treeArb, { maxLength: 4 }), (roots) => {
        const events = treeToEvents(roots);
        const { intervals } = buildIntervals(events);
        for (const iv of intervals) {
          expect(iv.childrenNs <= iv.durationNs).toBe(true);
          expect(iv.childrenNs >= 0n).toBe(true);
        }
      }),
    );
  });

  it("属性 18：同名递归正确配对（纯同名嵌套 d 层 → d 个区间且 mismatchedNames == 0）", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (d) => {
        const events: TraceEvent[] = [];
        for (let i = 0; i < d; i++) events.push(ev("B", "R", i));
        for (let i = 0; i < d; i++) events.push(ev("E", "R", 1000 + i));
        const { intervals, diagnostics } = buildIntervals(events);
        expect(intervals).toHaveLength(d);
        expect(diagnostics.mismatchedNames).toBe(0);
        expect(diagnostics.danglingBegin).toBe(0);
        expect(diagnostics.danglingEnd).toBe(0);
      }),
    );
  });
});
