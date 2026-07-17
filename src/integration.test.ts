import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { analyzeText } from "./core/analyzeFile";
import { autoClassify, DEFAULT_CLASSIFIER_CONFIG } from "./core/classifier";
import { toCaseMetrics, buildPivot, type CaseMetrics } from "./core/caseAnalysis";
import { buildGroupedChart } from "./core/groupCompare";
import { exportCasesJSON, exportCasesCSV, exportPivotCSV } from "./core/exporters";
import type { FileEntry } from "./core/types";

// profiler_an 位于 frameworks/graphics/animengine/tools/profiler_an，
// 样例目录在其上两级的 profile/。
const PROFILE_DIR = join(__dirname, "..", "..", "..", "profile");

const emptyDims = {
  scene: null,
  algo: null,
  downsample: null,
  matched: false,
  raw: "",
};

const hasSamples = existsSync(PROFILE_DIR);

describe.skipIf(!hasSamples)("集成测试 — 真实样例文件夹", () => {
  const traceFiles = hasSamples
    ? readdirSync(PROFILE_DIR).filter((f) => f.endsWith(".trace"))
    : [];

  it("样例目录含多个 .trace 文件", () => {
    expect(traceFiles.length).toBeGreaterThan(0);
  });

  it("单文件解析：事件数非零，且首尾存在悬空标记", () => {
    const name = "feather_64_64_10-exp-ds8.trace";
    if (!traceFiles.includes(name)) return;
    const text = readFileSync(join(PROFILE_DIR, name), "utf8");
    const { report } = analyzeText(text, name);
    expect(report.totalEvents).toBeGreaterThan(0);
    expect(report.diagnostics.danglingEnd).toBeGreaterThanOrEqual(1);
    expect(report.diagnostics.danglingBegin).toBeGreaterThanOrEqual(1);
    expect(report.frames!.frameCount).toBeGreaterThan(0);
  });

  it("端到端：加载 → 分类 → 逐文件 case 指标 → 配对透视 → 导出（不平均）", () => {
    const subset = traceFiles.slice(0, 18);
    const entries: FileEntry[] = subset.map((n) => ({
      id: n,
      name: n,
      parsedDims: emptyDims,
    }));

    // 按 scene 自动分类（同文件归组）
    const state = autoClassify(entries, {
      ...DEFAULT_CLASSIFIER_CONFIG,
      groupBy: ["scene"],
    });

    // 解析全部并抽取逐文件 case 指标
    const cases: CaseMetrics[] = [];
    for (const n of subset) {
      const text = readFileSync(join(PROFILE_DIR, n), "utf8");
      const { report } = analyzeText(text, n);
      cases.push(toCaseMetrics(report, state.entries[n]));
    }
    expect(cases.length).toBe(subset.length);

    // 逐文件 case 的维度必须已正确解析（回归：曾因合并覆盖导致 dims 变空、图表全空）
    expect(cases.every((c) => c.dims.matched)).toBe(true);

    // 分组对比图表：至少有一个系列存在非 null 数据（回归：dims 变空会导致全 null）
    const grouped = buildGroupedChart(cases, "algo", { kind: "frame", key: "avgRenderFps" });
    const anyValue = grouped.series.some((s) => s.data.some((v) => v !== null));
    expect(anyValue).toBe(true);

    // 配对透视：按采样率对比，每格为单个文件真实值
    const pivot = buildPivot(cases, "downsample", "avgRenderFps");
    // 每个单元格必定对应一个具体文件（或为空），绝不是多文件平均
    for (const row of pivot.rows) {
      for (const col of pivot.columns) {
        const cell = row.cells[col];
        if (cell) expect(cell.fileId === null || typeof cell.fileId === "string").toBe(true);
      }
    }

    // 导出并校验
    const json = exportCasesJSON(cases);
    expect(() => JSON.parse(json)).not.toThrow();
    const casesCsv = exportCasesCSV(cases);
    expect(casesCsv.split("\n").length).toBe(cases.length + 1); // 含表头
    const pivotCsv = exportPivotCSV(pivot);
    expect(pivotCsv.split("\n").length).toBe(pivot.rows.length + 1);
  });
});
