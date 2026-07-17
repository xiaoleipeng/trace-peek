import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { applyAnomalyFilter } from "./applyAnomalyFilter";
import type { AnomalyFilterConfig } from "./types";

describe("applyAnomalyFilter", () => {
  it("默认 none：仅丢弃 1 帧预热，不做值级剔除", () => {
    const values = [10n, 20n, 30n, 40n, 1000n];
    const { kept, report } = applyAnomalyFilter(values, {
      dropIncompleteFrames: true,
      warmupFrames: 1,
      method: "none",
    });
    expect(kept).toEqual([20n, 30n, 40n, 1000n]); // 首元素预热被丢
    expect(report.removedCount).toBe(1);
    expect(report.removedSamples[0].reason).toBe("warmup");
  });

  it("percentile 方法剔除 > p99 的极端值", () => {
    const values: bigint[] = [];
    for (let i = 0; i < 100; i++) values.push(BigInt(10 + i)); // 10..109
    values.push(100000n); // 极端值
    const { report } = applyAnomalyFilter(values, {
      dropIncompleteFrames: false,
      warmupFrames: 0,
      method: "percentile",
    });
    expect(report.removedCount).toBeGreaterThanOrEqual(1);
    expect(report.removedSamples.some((s) => s.reason === "> p99")).toBe(true);
  });

  it("iqr 方法剔除超出上界的值", () => {
    const values = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 1000n];
    const { report } = applyAnomalyFilter(values, {
      dropIncompleteFrames: false,
      warmupFrames: 0,
      method: "iqr",
    });
    expect(report.removedSamples.some((s) => s.reason === "> Q3+1.5IQR")).toBe(true);
  });

  it("透明记录剔除前后平均值", () => {
    const values = [10n, 10n, 10n, 10n, 10000n];
    const { report } = applyAnomalyFilter(values, {
      dropIncompleteFrames: false,
      warmupFrames: 0,
      method: "percentile",
    });
    expect(report.avgBefore).toBeGreaterThan(report.avgAfter);
  });
});

describe("applyAnomalyFilter — 属性测试", () => {
  const cfgArb: fc.Arbitrary<AnomalyFilterConfig> = fc.record({
    dropIncompleteFrames: fc.boolean(),
    warmupFrames: fc.integer({ min: 0, max: 5 }),
    method: fc.constantFrom("none", "percentile", "iqr", "mad"),
  });

  it("属性 13：keptCount + removedCount == originalCount", () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 0n, max: 1_000_000n }), { maxLength: 200 }),
        cfgArb,
        (values, cfg) => {
          const { kept, report } = applyAnomalyFilter(values, cfg);
          expect(report.originalCount).toBe(values.length);
          expect(report.keptCount + report.removedCount).toBe(report.originalCount);
          expect(kept.length).toBe(report.keptCount);
        },
      ),
    );
  });

  it("属性 13：method='none' 且 warmup=0 时不做任何剔除", () => {
    fc.assert(
      fc.property(
        fc.array(fc.bigInt({ min: 0n, max: 1_000_000n }), { maxLength: 200 }),
        (values) => {
          const { kept, report } = applyAnomalyFilter(values, {
            dropIncompleteFrames: false,
            warmupFrames: 0,
            method: "none",
          });
          expect(report.removedCount).toBe(0);
          expect(kept.length).toBe(values.length);
        },
      ),
    );
  });
});
