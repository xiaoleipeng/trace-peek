import { describe, it, expect } from "vitest";
import {
  buildScenarioGrid,
  buildVerticalCompare,
  listScenes,
  listAlgoDsCombos,
} from "./compareViews";
import type { CaseMetrics } from "./caseAnalysis";
import type { ParsedDims } from "./types";

function dims(scene: string, algo: string, ds: string): ParsedDims {
  return { scene, algo, downsample: ds, matched: true, raw: `${scene}-${algo}-${ds}` };
}

function mk(scene: string, algo: string, ds: string, fps: number): CaseMetrics {
  return {
    fileId: `${scene}-${algo}-${ds}.trace`,
    dims: dims(scene, algo, ds),
    frameCount: 10,
    rawFrameCount: 11,
    removedFrameCount: 1,
    avgRenderFps: fps,
    avgDisplayFps: fps / 3,
    avgFrameMs: 1000 / fps,
    p90FrameMs: 1,
    maxFrameMs: 2,
    wallClockMs: 100,
    totalEvents: 100,
    selfMsByFn: {},
    fnStatsByName: {},
  };
}

const cases: CaseMetrics[] = [
  mk("feather_64_64_10", "exp", "ds8", 200),
  mk("feather_64_64_10", "exp", "dsauto", 260),
  mk("feather_64_64_10", "gau", "ds8", 180),
  mk("feather_64_64_10", "gau", "dsauto", 210),
  mk("radial_34", "exp", "ds8", 100),
  mk("radial_34", "exp", "dsauto", 90),
];

describe("需求1 横向对比：单文件 算法×采样率 网格", () => {
  it("固定 scene，行=algo 列=downsample，每格单文件真实值", () => {
    const grid = buildScenarioGrid(cases, "feather_64_64_10", "avgRenderFps");
    expect(grid.algos).toEqual(["exp", "gau"]);
    expect(grid.downsamples).toEqual(["ds8", "dsauto"]);
    expect(grid.cells["exp"]["ds8"].value).toBe(200);
    expect(grid.cells["exp"]["dsauto"].value).toBe(260);
    expect(grid.cells["gau"]["ds8"].value).toBe(180);
    // 全网格 best/worst（FPS 越高越好）
    expect(grid.cells["exp"]["dsauto"].isBest).toBe(true); // 260 最高
    expect(grid.cells["gau"]["ds8"].isWorst).toBe(true); // 180 最低
  });

  it("listScenes 去重排序", () => {
    expect(listScenes(cases)).toEqual(["feather_64_64_10", "radial_34"]);
  });
});

describe("需求2 纵向对比：固定 算法+采样率 的跨文件对比", () => {
  it("固定 exp+ds8，纵向列出不同 scene", () => {
    const v = buildVerticalCompare(cases, "exp", "ds8", "avgRenderFps");
    expect(v.rows.map((r) => r.scene)).toEqual(["feather_64_64_10", "radial_34"]);
    expect(v.rows.find((r) => r.scene === "feather_64_64_10")!.value).toBe(200);
    expect(v.rows.find((r) => r.scene === "radial_34")!.value).toBe(100);
    // best/worst
    expect(v.rows.find((r) => r.scene === "feather_64_64_10")!.isBest).toBe(true);
    expect(v.rows.find((r) => r.scene === "radial_34")!.isWorst).toBe(true);
  });

  it("listAlgoDsCombos 列出组合", () => {
    const combos = listAlgoDsCombos(cases);
    expect(combos).toContainEqual({ algo: "exp", downsample: "ds8" });
    expect(combos).toContainEqual({ algo: "gau", downsample: "dsauto" });
  });
});
