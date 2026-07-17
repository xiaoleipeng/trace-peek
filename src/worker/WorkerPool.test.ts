import { describe, it, expect } from "vitest";
import { WorkerPool } from "./WorkerPool";

const FB = "_lv_display_refr_timer";

const sample = [
  "# tracer: nop",
  "LVGL-1 [0] 1.000000000: tracing_mark_write: B|1|a",
  "LVGL-1 [0] 1.000001000: tracing_mark_write: B|1|b",
  "LVGL-1 [0] 1.000002000: tracing_mark_write: E|1|b",
  "LVGL-1 [0] 1.000003000: tracing_mark_write: E|1|a",
].join("\n");

describe("WorkerPool（主线程回退路径）", () => {
  it("parseAll 每文件解析一次并写入缓存，上报进度", async () => {
    const pool = new WorkerPool(2);
    const progresses: Array<[number, number]> = [];
    const cache = await pool.parseAll(
      [
        { fileId: "f1", text: sample },
        { fileId: "f2", text: sample },
      ],
      FB,
      (done, total) => progresses.push([done, total]),
    );
    expect(cache.size).toBe(2);
    const r1 = cache.get("f1")!;
    expect(r1.report.totalEvents).toBe(4);
    expect(r1.report.functions.find((f) => f.name === "a")).toBeTruthy();
    // 进度最终到达 total
    expect(progresses[progresses.length - 1]).toEqual([2, 2]);
  });

  it("空输入返回空缓存", async () => {
    const pool = new WorkerPool(2);
    const cache = await pool.parseAll([], FB);
    expect(cache.size).toBe(0);
  });
});
