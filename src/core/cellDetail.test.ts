import { describe, it, expect } from "vitest";
import { buildIntervals } from "./buildIntervals";
import { analyzeText } from "./analyzeFile";
import { buildCellDetail } from "./cellDetail";
import { naturalCompare } from "./groupCompare";
import { ev } from "./testutil";

describe("naturalCompare — 文件名自然排序", () => {
  it("feather_64_64 排在 feather_128_128 之前", () => {
    const arr = ["feather_128_128_10", "feather_64_64_10", "feather_256_256_10"];
    arr.sort(naturalCompare);
    expect(arr[0]).toBe("feather_64_64_10");
    expect(arr[1]).toBe("feather_128_128_10");
    expect(arr[2]).toBe("feather_256_256_10");
  });
});

describe("buildCellDetail — 点击柱子看原始数据", () => {
  it("函数 self 逐次调用列出，含分布摘要", () => {
    // blur 调用两次：self 分别 5ns、15ns（无子调用）
    const events = [
      ev("B", "blur_a8_exp", 0),
      ev("E", "blur_a8_exp", 5),
      ev("B", "blur_a8_exp", 10),
      ev("E", "blur_a8_exp", 25),
    ];
    const { intervals } = buildIntervals(events);
    const detail = buildCellDetail(
      "f-exp-ds8.trace",
      { kind: "fnSelf", fn: "blur", agg: "perCall" },
      undefined,
      intervals,
    );
    expect(detail.count).toBe(2);
    expect(detail.samples.map((s) => s.valueMs)).toEqual([5 / 1e6, 15 / 1e6]);
    expect(detail.maxMs).toBe(15 / 1e6);
  });

  it("帧级指标列出每帧耗时", () => {
    const FB = "_lv_display_refr_timer";
    const text = [
      `X [0] 0.000000000: tracing_mark_write: B|1|${FB}`,
      `X [0] 0.004000000: tracing_mark_write: E|1|${FB}`,
      `X [0] 0.012000000: tracing_mark_write: B|1|${FB}`,
      `X [0] 0.018000000: tracing_mark_write: E|1|${FB}`,
    ].join("\n");
    const { report } = analyzeText(text, "f.trace", FB);
    const detail = buildCellDetail(
      "f.trace",
      { kind: "frame", key: "avgFrameMs" },
      report,
      undefined,
    );
    expect(detail.count).toBe(2);
    expect(detail.samples[0].valueMs).toBeCloseTo(4, 6);
    expect(detail.samples[1].valueMs).toBeCloseTo(6, 6);
  });

  it("样本量少时给出提示", () => {
    const events = [ev("B", "finish", 0), ev("E", "finish", 3)];
    const { intervals } = buildIntervals(events);
    const detail = buildCellDetail(
      "f.trace",
      { kind: "fnSelf", fn: "finish", agg: "perCall" },
      undefined,
      intervals,
    );
    expect(detail.note).toBeTruthy();
  });

  it("超大异常帧被标记且不计入统计（与图表口径一致）", () => {
    const FB = "_lv_display_refr_timer";
    // 5 帧正常 ~4ms + 1 帧异常 2000ms
    const lines: string[] = [];
    let t = 0;
    const push = (name: string, dur: number) => {
      lines.push(`X [0] 0.${String(t).padStart(9, "0")}: tracing_mark_write: B|1|${name}`);
      t += dur;
      lines.push(`X [0] 0.${String(t).padStart(9, "0")}: tracing_mark_write: E|1|${name}`);
      t += 1000;
    };
    for (let i = 0; i < 5; i++) push(FB, 4_000_000);
    push(FB, 2_000_000_000); // 异常 2s 帧
    const { report } = analyzeText(lines.join("\n"), "bad.trace", FB);
    const detail = buildCellDetail(
      "bad.trace",
      { kind: "frame", key: "avgFrameMs" },
      report,
      undefined,
      "iqr",
    );
    expect(detail.outlierCount).toBe(1);
    expect(detail.count).toBe(5); // 异常不计入
    // 均值应接近 4ms 而非被 2000ms 拉高
    expect(detail.meanMs).toBeLessThan(10);
    // 异常样本仍在列表里且被标记
    expect(detail.samples.some((s) => s.isOutlier)).toBe(true);
  });
});
