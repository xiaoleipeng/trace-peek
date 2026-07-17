import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildIntervals } from "./buildIntervals";
import { listCalls, selectFunctions } from "./drilldown";
import { aggregate } from "./aggregate";
import { ev } from "./testutil";
import type { Interval } from "./types";

const FB = "_lv_display_refr_timer";

describe("selectFunctions", () => {
  const events = [
    ev("B", "lv_draw_rect", 0),
    ev("E", "lv_draw_rect", 1),
    ev("B", "lv_draw_add_task", 2),
    ev("E", "lv_draw_add_task", 3),
    ev("B", "vg_lite_draw", 4),
    ev("E", "vg_lite_draw", 5),
  ];
  const report = aggregate(buildIntervals(events), { source: "t" });

  it("exact 精确匹配", () => {
    const r = selectFunctions([report], { mode: "exact", query: "vg_lite_draw" });
    expect(r.map((f) => f.name)).toEqual(["vg_lite_draw"]);
  });

  it("wildcard 通配符匹配", () => {
    const r = selectFunctions([report], { mode: "wildcard", query: "lv_draw_*" });
    expect(r.map((f) => f.name).sort()).toEqual(["lv_draw_add_task", "lv_draw_rect"]);
  });

  it("multi 多选匹配", () => {
    const r = selectFunctions([report], {
      mode: "multi",
      query: ["lv_draw_rect", "vg_lite_draw"],
    });
    expect(r.map((f) => f.name).sort()).toEqual(["lv_draw_rect", "vg_lite_draw"]);
  });
});

describe("listCalls — frameIndex 归属", () => {
  it("调用按 startNs 归属到所在帧，帧间空闲为 null", () => {
    // 帧 0: [0,100)  帧 1: [200,300)
    const events = [
      ev("B", FB, 0),
      ev("B", "foo", 10),
      ev("E", "foo", 20),
      ev("E", FB, 100),
      // 帧间空闲的调用
      ev("B", "foo", 150),
      ev("E", "foo", 160),
      ev("B", FB, 200),
      ev("B", "foo", 210),
      ev("E", "foo", 220),
      ev("E", FB, 300),
    ];
    const { intervals } = buildIntervals(events);
    const map = new Map<string, Interval[]>([["file1", intervals]]);
    const calls = listCalls(map, "foo", FB).sort((a, b) =>
      Number(a.startNs - b.startNs),
    );
    expect(calls).toHaveLength(3);
    expect(calls[0].frameIndex).toBe(0); // start=10 → 帧0
    expect(calls[1].frameIndex).toBeNull(); // start=150 → 空闲
    expect(calls[2].frameIndex).toBe(1); // start=210 → 帧1
  });

  it("属性 21：frameIndex==k 当且仅当 startNs ∈ [frame_k.start, frame_k.end)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            start: fc.integer({ min: 0, max: 100000 }),
            render: fc.integer({ min: 1, max: 500 }),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (specs) => {
          // 构造互不重叠、递增的帧
          const sorted = [...specs].sort((a, b) => a.start - b.start);
          const events = [];
          let prevEnd = -1;
          const frameRanges: Array<[number, number]> = [];
          for (const s of sorted) {
            const start = Math.max(s.start, prevEnd + 1);
            const end = start + s.render;
            frameRanges.push([start, end]);
            events.push(ev("B", FB, start));
            // 帧内放一个 foo 调用
            events.push(ev("B", "foo", start));
            events.push(ev("E", "foo", start + 1));
            events.push(ev("E", FB, end));
            prevEnd = end;
          }
          const { intervals } = buildIntervals(events);
          const map = new Map<string, Interval[]>([["f", intervals]]);
          const calls = listCalls(map, "foo", FB);
          for (const c of calls) {
            if (c.frameIndex === null) {
              // 不应落入任何帧区间
              for (const [s, e] of frameRanges) {
                expect(Number(c.startNs) >= s && Number(c.startNs) < e).toBe(false);
              }
            } else {
              const [s, e] = frameRanges[c.frameIndex];
              expect(Number(c.startNs) >= s && Number(c.startNs) < e).toBe(true);
            }
          }
        },
      ),
    );
  });
});
