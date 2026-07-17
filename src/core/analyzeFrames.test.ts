import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildIntervals } from "./buildIntervals";
import { analyzeFrames } from "./analyzeFrames";
import { ev } from "./testutil";
import type { TraceEvent } from "./types";

const FB = "_lv_display_refr_timer";

/** 构造 n 个帧：帧起点间隔 period，帧渲染耗时 render。 */
function makeFrames(n: number, render: number, period: number): TraceEvent[] {
  const events: TraceEvent[] = [];
  for (let i = 0; i < n; i++) {
    const start = i * period;
    events.push(ev("B", FB, start));
    events.push(ev("E", FB, start + render));
  }
  return events;
}

describe("analyzeFrames", () => {
  it("双帧率语义：render 与 display 可相差数倍", () => {
    // 渲染 4ms，帧周期 12ms（含空闲）
    const events = makeFrames(5, 4_000_000, 12_000_000);
    const fr = analyzeFrames(buildIntervals(events), FB);
    expect(fr.frameCount).toBe(5);
    // render fps ≈ 1e9/4e6 = 250
    expect(Math.round(fr.avgRenderFps)).toBe(250);
    // display fps ≈ 1e9/12e6 ≈ 83.3
    expect(Math.round(fr.avgDisplayFps!)).toBe(83);
  });

  it("frameCount < 2 时 avgDisplayFps 为 null", () => {
    const events = makeFrames(1, 4_000_000, 12_000_000);
    const fr = analyzeFrames(buildIntervals(events), FB);
    expect(fr.frameCount).toBe(1);
    expect(fr.avgDisplayFps).toBeNull();
    expect(fr.avgRenderFps).toBeGreaterThan(0);
  });

  it("开头悬空 E 的半帧不被计入（天然排除）", () => {
    const events = [
      ev("E", FB, 5), // 悬空 E：开头半帧
      ...makeFrames(3, 4_000_000, 12_000_000).map((e) => ({
        ...e,
        timestampNs: e.timestampNs + 100n,
      })),
    ];
    const fr = analyzeFrames(buildIntervals(events), FB);
    expect(fr.frameCount).toBe(3); // 悬空 E 不计入
  });

  it("EOF 未闭合的边界 B 不被计入", () => {
    const events = [
      ...makeFrames(2, 4_000_000, 12_000_000),
      ev("B", FB, 999_000_000), // 未闭合
    ];
    const fr = analyzeFrames(buildIntervals(events), FB);
    expect(fr.frameCount).toBe(2);
  });
});

describe("analyzeFrames — 属性测试", () => {
  it("属性 16：frameDurationsNs/frameStartsNs 仅含已配对帧", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 5 }),
        (paired, danglingEnds) => {
          const events: TraceEvent[] = [];
          let t = 0;
          for (let i = 0; i < danglingEnds; i++) events.push(ev("E", FB, t++));
          for (let i = 0; i < paired; i++) {
            events.push(ev("B", FB, (t += 10)));
            events.push(ev("E", FB, (t += 5)));
          }
          const fr = analyzeFrames(buildIntervals(events), FB);
          expect(fr.frameCount).toBe(paired);
          expect(fr.frameDurationsNs).toHaveLength(paired);
          expect(fr.frameStartsNs).toHaveLength(paired);
        },
      ),
    );
  });

  it("属性 17：帧率公式与 <2 帧的 null", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 1_000_000, max: 8_000_000 }),
        fc.integer({ min: 9_000_000, max: 20_000_000 }),
        (n, render, period) => {
          const fr = analyzeFrames(buildIntervals(makeFrames(n, render, period)), FB);
          if (n < 2) {
            expect(fr.avgDisplayFps).toBeNull();
          } else {
            // display 周期恒为 period
            expect(Math.round(fr.avgDisplayFps!)).toBe(Math.round(1e9 / period));
          }
          if (n >= 1) {
            expect(Math.round(fr.avgRenderFps)).toBe(Math.round(1e9 / render));
          }
        },
      ),
    );
  });
});
