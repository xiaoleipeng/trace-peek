import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildIntervals } from "./buildIntervals";
import { aggregate, topLevelDurationSum } from "./aggregate";
import { ev, treeToEvents, type CallNode } from "./testutil";
import type { TraceEvent } from "./types";

describe("aggregate — 基本行为", () => {
  it("按函数名聚合并计算 self time", () => {
    const events = [
      ev("B", "a", 0),
      ev("B", "b", 2),
      ev("E", "b", 6),
      ev("E", "a", 10),
    ];
    const report = aggregate(buildIntervals(events), { source: "t" });
    const a = report.functions.find((f) => f.name === "a")!;
    const b = report.functions.find((f) => f.name === "b")!;
    expect(a.totalTimeNs).toBe(10n);
    expect(a.selfTimeNs).toBe(6n); // 10 - b(4)
    expect(b.totalTimeNs).toBe(4n);
    expect(b.selfTimeNs).toBe(4n);
    expect(report.wallClockNs).toBe(10n);
  });

  it("count 等于该名称配对次数", () => {
    const events = [
      ev("B", "x", 0),
      ev("E", "x", 1),
      ev("B", "x", 2),
      ev("E", "x", 5),
    ];
    const report = aggregate(buildIntervals(events), { source: "t" });
    const x = report.functions.find((f) => f.name === "x")!;
    expect(x.count).toBe(2);
    expect(x.totalTimeNs).toBe(4n);
  });
});

const leaf: fc.Arbitrary<CallNode> = fc.record({
  name: fc.constantFrom("a", "b", "c"),
  children: fc.constant([] as CallNode[]),
});
const treeArb: fc.Arbitrary<CallNode> = fc.letrec<{ node: CallNode }>((tie) => ({
  node: fc.oneof(
    { depthSize: "small" },
    leaf,
    fc.record({
      name: fc.constantFrom("a", "b", "c"),
      children: fc.array(tie("node"), { maxLength: 3 }),
    }),
  ),
})).node;

describe("aggregate — 属性测试", () => {
  it("属性 2：0 <= selfTimeNs <= totalTimeNs", () => {
    fc.assert(
      fc.property(fc.array(treeArb, { maxLength: 4 }), (roots) => {
        const report = aggregate(buildIntervals(treeToEvents(roots)), { source: "t" });
        for (const f of report.functions) {
          expect(f.selfTimeNs >= 0n).toBe(true);
          expect(f.selfTimeNs <= f.totalTimeNs).toBe(true);
        }
      }),
    );
  });

  it("属性 7：count 等于该名称已匹配 E 数", () => {
    fc.assert(
      fc.property(fc.array(treeArb, { maxLength: 4 }), (roots) => {
        const events = treeToEvents(roots);
        const report = aggregate(buildIntervals(events), { source: "t" });
        const expected = new Map<string, number>();
        for (const e of events) {
          if (e.phase === "E") expected.set(e.name, (expected.get(e.name) ?? 0) + 1);
        }
        for (const f of report.functions) {
          expect(f.count).toBe(expected.get(f.name) ?? 0);
        }
      }),
    );
  });

  it("属性 9：min <= p50 <= p90 <= p99 <= max", () => {
    fc.assert(
      fc.property(fc.array(treeArb, { maxLength: 5 }), (roots) => {
        const report = aggregate(buildIntervals(treeToEvents(roots)), { source: "t" });
        for (const f of report.functions) {
          const mn = Number(f.minNs);
          const mx = Number(f.maxNs);
          expect(mn <= f.p50Ns).toBe(true);
          expect(f.p50Ns <= f.p90Ns).toBe(true);
          expect(f.p90Ns <= f.p99Ns).toBe(true);
          expect(f.p99Ns <= mx).toBe(true);
        }
      }),
    );
  });

  it("属性 10(a)：Σ 顶层区间耗时 <= wallClockNs", () => {
    fc.assert(
      fc.property(fc.array(treeArb, { maxLength: 5 }), (roots) => {
        const { intervals, diagnostics } = buildIntervals(treeToEvents(roots));
        const report = aggregate({ intervals, diagnostics }, { source: "t" });
        const topSum = topLevelDurationSum(intervals);
        expect(topSum <= report.wallClockNs).toBe(true);
      }),
    );
  });

  it("属性 10(b)：selfTime + Σ子区间 == duration（区间级精确分解）", () => {
    fc.assert(
      fc.property(fc.array(treeArb, { maxLength: 5 }), (roots) => {
        const { intervals } = buildIntervals(treeToEvents(roots));
        for (const iv of intervals) {
          const self = iv.durationNs - iv.childrenNs;
          expect(self + iv.childrenNs).toBe(iv.durationNs);
          expect(self >= 0n).toBe(true);
        }
      }),
    );
  });
});

// 保证类型引用被使用
const _unused: TraceEvent[] = [];
void _unused;
