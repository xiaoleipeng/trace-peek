import { describe, it, expect } from "vitest";
import { buildGroupedChart, listFunctionNames } from "./groupCompare";
import type { CaseMetrics } from "./caseAnalysis";
import type { ParsedDims } from "./types";

function dims(scene: string, algo: string, ds: string): ParsedDims {
  return { scene, algo, downsample: ds, matched: true, raw: `${scene}-${algo}-${ds}` };
}

function mk(
  scene: string,
  algo: string,
  ds: string,
  fps: number,
  selfMsByFn: Record<string, number> = {},
  countByFn: Record<string, number> = {},
): CaseMetrics {
  const frameCount = 10;
  const fnStatsByName: Record<string, import("./caseAnalysis").CaseFnStat> = {};
  for (const [name, selfTotalMs] of Object.entries(selfMsByFn)) {
    const count = countByFn[name] ?? 1;
    fnStatsByName[name] = {
      name,
      selfTotalMs,
      totalTotalMs: selfTotalMs,
      count,
      selfPerCallMs: count > 0 ? selfTotalMs / count : 0,
      selfPerFrameMs: selfTotalMs / frameCount,
    };
  }
  return {
    fileId: `${scene}-${algo}-${ds}.trace`,
    dims: dims(scene, algo, ds),
    frameCount,
    rawFrameCount: frameCount,
    removedFrameCount: 0,
    avgRenderFps: fps,
    avgDisplayFps: fps / 3,
    avgFrameMs: 1000 / fps,
    p90FrameMs: 1,
    maxFrameMs: 2,
    wallClockMs: 100,
    totalEvents: 100,
    selfMsByFn,
    fnStatsByName,
  };
}

const cases: CaseMetrics[] = [
  mk("feather_64_64_10", "exp", "ds8", 200, { blur_a8_exp: 5, lv_vg_lite_finish: 2 }),
  mk("feather_64_64_10", "gau", "ds8", 180, { blur_a8_gau: 7, lv_vg_lite_finish: 2 }),
  mk("feather_64_64_10", "stk", "ds8", 220, { lv_vg_lite_finish: 1 }),
  mk("feather_64_64_10", "exp", "dsauto", 260, { blur_a8_exp: 3 }),
  mk("radial_34", "exp", "ds8", 100, { blur_a8_exp: 9 }),
];

describe("图1 不同算法：seriesDim=algo，X=(scene,downsample)", () => {
  it("每个算法一个系列，展示所有文件", () => {
    const chart = buildGroupedChart(cases, "algo", { kind: "frame", key: "avgRenderFps" });
    expect(chart.series.map((s) => s.name).sort()).toEqual(["exp", "gau", "stk"]);
    // feather+ds8 分类下三种算法各有值
    const catIdx = chart.categories.indexOf("feather_64_64_10 · ds8");
    expect(catIdx).toBeGreaterThanOrEqual(0);
    const exp = chart.series.find((s) => s.name === "exp")!;
    const gau = chart.series.find((s) => s.name === "gau")!;
    const stk = chart.series.find((s) => s.name === "stk")!;
    expect(exp.data[catIdx]).toBe(200);
    expect(gau.data[catIdx]).toBe(180);
    expect(stk.data[catIdx]).toBe(220);
  });
});

describe("图2 不同采样率：seriesDim=downsample，X=(scene,algo)", () => {
  it("每个采样率一个系列", () => {
    const chart = buildGroupedChart(cases, "downsample", { kind: "frame", key: "avgRenderFps" });
    expect(chart.series.map((s) => s.name).sort()).toEqual(["ds8", "dsauto"]);
    const catIdx = chart.categories.indexOf("feather_64_64_10 · exp");
    const ds8 = chart.series.find((s) => s.name === "ds8")!;
    const dsauto = chart.series.find((s) => s.name === "dsauto")!;
    expect(ds8.data[catIdx]).toBe(200);
    expect(dsauto.data[catIdx]).toBe(260);
  });
});

describe("图3 不同文件：seriesDim=scene，X=(algo,downsample)", () => {
  it("每个文件一个系列，可用帧率或函数 self", () => {
    const chart = buildGroupedChart(cases, "scene", { kind: "frame", key: "avgRenderFps" });
    expect(chart.series.map((s) => s.name).sort()).toEqual([
      "feather_64_64_10",
      "radial_34",
    ]);
    const catIdx = chart.categories.indexOf("exp · ds8");
    const feather = chart.series.find((s) => s.name === "feather_64_64_10")!;
    const radial = chart.series.find((s) => s.name === "radial_34")!;
    expect(feather.data[catIdx]).toBe(200);
    expect(radial.data[catIdx]).toBe(100);
  });

  it("按函数 self 指标（blur，累计口径，子串匹配聚合）", () => {
    const chart = buildGroupedChart(cases, "algo", { kind: "fnSelf", fn: "blur", agg: "total" });
    expect(chart.unit).toBe("ms");
    const catIdx = chart.categories.indexOf("feather_64_64_10 · ds8");
    const exp = chart.series.find((s) => s.name === "exp")!;
    const gau = chart.series.find((s) => s.name === "gau")!;
    const stk = chart.series.find((s) => s.name === "stk")!;
    expect(exp.data[catIdx]).toBe(5); // blur_a8_exp
    expect(gau.data[catIdx]).toBe(7); // blur_a8_gau
    expect(stk.data[catIdx]).toBeNull(); // stk 无 blur 函数
  });

  it("每次调用平均口径消除调用次数差异", () => {
    // A: blur self 累计 10ms / 10 次 = 1ms/次；B: 6ms / 2 次 = 3ms/次
    const cs = [
      mk("s", "exp", "ds8", 200, { blur_x: 10 }, { blur_x: 10 }),
      mk("s", "gau", "ds8", 200, { blur_x: 6 }, { blur_x: 2 }),
    ];
    const total = buildGroupedChart(cs, "algo", { kind: "fnSelf", fn: "blur", agg: "total" });
    const perCall = buildGroupedChart(cs, "algo", { kind: "fnSelf", fn: "blur", agg: "perCall" });
    const ci = total.categories.indexOf("s · ds8");
    // 累计口径：exp(10) 看似比 gau(6) 慢
    expect(total.series.find((s) => s.name === "exp")!.data[ci]).toBe(10);
    expect(total.series.find((s) => s.name === "gau")!.data[ci]).toBe(6);
    // 每次调用口径：exp(1ms) 实际比 gau(3ms) 快 —— 结论反转，这才公平
    expect(perCall.series.find((s) => s.name === "exp")!.data[ci]).toBe(1);
    expect(perCall.series.find((s) => s.name === "gau")!.data[ci]).toBe(3);
  });
});

describe("listFunctionNames", () => {
  it("去重列出所有函数名", () => {
    const names = listFunctionNames(cases);
    expect(names).toContain("blur_a8_exp");
    expect(names).toContain("lv_vg_lite_finish");
  });
});
