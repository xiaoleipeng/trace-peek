import { describe, it, expect } from "vitest";
import { buildPivot, toCaseMetrics, type CaseMetrics } from "./caseAnalysis";
import type { AnalysisReport, FileEntry, ParsedDims } from "./types";

function dims(scene: string, algo: string, downsample: string): ParsedDims {
  return { scene, algo, downsample, matched: true, raw: `${scene}-${algo}-${downsample}` };
}

function mkCase(
  scene: string,
  algo: string,
  downsample: string,
  renderFps: number,
): CaseMetrics {
  return {
    fileId: `${scene}-${algo}-${downsample}.trace`,
    dims: dims(scene, algo, downsample),
    frameCount: 10,
    rawFrameCount: 10,
    removedFrameCount: 0,
    avgRenderFps: renderFps,
    avgDisplayFps: renderFps / 3,
    avgFrameMs: 1000 / renderFps,
    p90FrameMs: 1,
    maxFrameMs: 2,
    wallClockMs: 100,
    totalEvents: 1000,
    selfMsByFn: {},
    fnStatsByName: {},
  };
}

describe("toCaseMetrics — 单文件独立指标（不平均）", () => {
  it("从报告抽取 case 指标", () => {
    const report: AnalysisReport = {
      source: "feather_64_64_10-exp-ds8.trace",
      wallClockNs: 100_000_000n,
      totalEvents: 500,
      functions: [
        {
          name: "vg_lite_draw",
          count: 5,
          totalTimeNs: 5_000_000n,
          selfTimeNs: 4_000_000n,
          minNs: 1n,
          maxNs: 2n,
          avgNs: 1.5,
          p50Ns: 1,
          p90Ns: 2,
          p99Ns: 2,
        },
      ],
      frames: {
        boundaryEvent: "_lv_display_refr_timer",
        frameCount: 3,
        // 三帧渲染各 4ms；起点间隔 12ms
        frameDurationsNs: [4_000_000n, 4_000_000n, 4_000_000n],
        frameStartsNs: [0n, 12_000_000n, 24_000_000n],
        avgFrameMs: 4,
        p90FrameMs: 4,
        maxFrameMs: 4,
        avgRenderFps: 250,
        avgDisplayFps: 83,
      },
      diagnostics: {
        totalLines: 0,
        parsedEvents: 500,
        skippedHeaderLines: 0,
        malformedLines: [],
        danglingBegin: 0,
        danglingEnd: 0,
        mismatchedNames: 0,
        negativeDurations: 0,
        stackDepthCapHits: 0,
      },
    };
    const entry: FileEntry = {
      id: report.source,
      name: report.source,
      parsedDims: dims("feather_64_64_10", "exp", "ds8"),
    };
    // 关闭帧离群剔除，验证由帧数据重算的口径
    const c = toCaseMetrics(report, entry, { enabled: false, method: "iqr" });
    expect(Math.round(c.avgRenderFps)).toBe(250); // 1e9/4e6
    expect(Math.round(c.avgDisplayFps!)).toBe(83); // 1e9/12e6
    expect(c.wallClockMs).toBe(100);
    expect(c.selfMsByFn["vg_lite_draw"]).toBe(4);
  });
});

describe("buildPivot — 配对透视对比（每格为单文件真实值）", () => {
  // 同一 scene+algo，仅 downsample 变化
  const cases = [
    mkCase("feather_64_64_10", "exp", "ds8", 200),
    mkCase("feather_64_64_10", "exp", "dsauto", 260),
    mkCase("radial_34", "exp", "ds8", 100),
    mkCase("radial_34", "exp", "dsauto", 90),
  ];

  it("按 downsample 对比：列为 ds8/dsauto，行为 scene+algo", () => {
    const pivot = buildPivot(cases, "downsample", "avgRenderFps");
    expect(pivot.columns).toEqual(["ds8", "dsauto"]);
    expect(pivot.rows).toHaveLength(2);

    const featherRow = pivot.rows.find((r) => r.rowKey.includes("feather_64_64_10"))!;
    // 每个格子是单个文件的真实值，未做平均
    expect(featherRow.cells["ds8"].value).toBe(200);
    expect(featherRow.cells["dsauto"].value).toBe(260);
    // FPS 越高越好 → dsauto 更优
    expect(featherRow.bestColumn).toBe("dsauto");
    expect(featherRow.worstColumn).toBe("ds8");

    const radialRow = pivot.rows.find((r) => r.rowKey.includes("radial_34"))!;
    expect(radialRow.cells["ds8"].value).toBe(100);
    expect(radialRow.bestColumn).toBe("ds8"); // 100 > 90
  });

  it("对耗时类指标：越低越好", () => {
    const pivot = buildPivot(cases, "downsample", "avgFrameMs");
    const featherRow = pivot.rows.find((r) => r.rowKey.includes("feather_64_64_10"))!;
    // dsauto 帧耗时更低（1000/260 < 1000/200）→ best
    expect(featherRow.bestColumn).toBe("dsauto");
  });

  it("绝不跨行合并：不同 scene 各自独立成行，不平均", () => {
    const pivot = buildPivot(cases, "downsample", "avgRenderFps");
    // feather 与 radial 的 ds8 值互不影响
    const featherRow = pivot.rows.find((r) => r.rowKey.includes("feather_64_64_10"))!;
    const radialRow = pivot.rows.find((r) => r.rowKey.includes("radial_34"))!;
    expect(featherRow.cells["ds8"].value).toBe(200);
    expect(radialRow.cells["ds8"].value).toBe(100);
  });

  it("按 algo 对比", () => {
    const cs = [
      mkCase("s1", "exp", "ds8", 200),
      mkCase("s1", "gau", "ds8", 180),
      mkCase("s1", "stk", "ds8", 220),
    ];
    const pivot = buildPivot(cs, "algo", "avgRenderFps");
    expect(pivot.columns.sort()).toEqual(["exp", "gau", "stk"]);
    const row = pivot.rows[0];
    expect(row.bestColumn).toBe("stk"); // 220 最高
    expect(row.worstColumn).toBe("gau"); // 180 最低
  });
});
