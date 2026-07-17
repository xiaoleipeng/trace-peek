import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { parseLine, isHeaderOrBlank } from "./parseLine";

describe("parseLine", () => {
  it("跳过头部行、空行", () => {
    expect(parseLine("# tracer: nop", 1)).toBeNull();
    expect(parseLine("#", 2)).toBeNull();
    expect(parseLine("", 3)).toBeNull();
    expect(parseLine("   ", 4)).toBeNull();
  });

  it("解析合法的 B 行", () => {
    const ev = parseLine(
      "   LVGL-1 [0] 85.880882456: tracing_mark_write: B|1|event_cb",
      10,
    );
    expect(ev).not.toBeNull();
    expect(ev!.task).toBe("LVGL-1");
    expect(ev!.cpu).toBe(0);
    expect(ev!.phase).toBe("B");
    expect(ev!.markerId).toBe(1);
    expect(ev!.name).toBe("event_cb");
    expect(ev!.lineNo).toBe(10);
    expect(ev!.timestampNs).toBe(85_880_882_456n);
  });

  it("解析合法的 E 行", () => {
    const ev = parseLine(
      "   LVGL-1 [0] 85.880890877: tracing_mark_write: E|1|event_cb",
      11,
    );
    expect(ev!.phase).toBe("E");
    expect(ev!.timestampNs).toBe(85_880_890_877n);
  });

  it("时间戳纳秒对齐（补零）", () => {
    // 85.5 秒 = 85_500_000_000 ns
    const ev = parseLine("X [1] 85.5: tracing_mark_write: B|1|foo", 1);
    expect(ev!.timestampNs).toBe(85_500_000_000n);
    expect(ev!.cpu).toBe(1);
  });

  it("保留函数名中的下划线与特殊片段", () => {
    const ev = parseLine(
      "LVGL-1 [0] 1.000000001: tracing_mark_write: B|1|lv_draw_vg_lite_apply_hardware_mask_clip",
      1,
    );
    expect(ev!.name).toBe("lv_draw_vg_lite_apply_hardware_mask_clip");
    expect(ev!.timestampNs).toBe(1_000_000_001n);
  });

  it("对格式错误行返回 null", () => {
    expect(parseLine("this is not a trace line", 1)).toBeNull();
    expect(
      parseLine("LVGL-1 [0] 85.88: tracing_mark_write: X|1|bad_phase", 1),
    ).toBeNull();
    // 截断行（尾部被切断）
    expect(
      parseLine("LVGL-1 [0] 85.897582301: tracing_mark_write: E", 1),
    ).toBeNull();
  });

  it("isHeaderOrBlank 正确识别", () => {
    expect(isHeaderOrBlank("# tracer")).toBe(true);
    expect(isHeaderOrBlank("")).toBe(true);
    expect(isHeaderOrBlank("  ")).toBe(true);
    expect(isHeaderOrBlank("LVGL-1 [0] 1.0: tracing_mark_write: B|1|x")).toBe(
      false,
    );
  });

  // 正确性属性 12：解析器纯性 / 确定性
  it("属性 12：相同输入行始终产出相同输出（确定性）", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const a = parseLine(s, 1);
        const b = parseLine(s, 1);
        expect(a).toStrictEqual(b);
      }),
    );
  });

  it("属性 12：对随机构造的合法行稳定解析", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9999 }),
        fc.integer({ min: 0, max: 999_999_999 }),
        fc.constantFrom("B", "E"),
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((n) => /^[A-Za-z0-9_]+$/.test(n)),
        (sec, nanos, phase, name) => {
          const nanoStr = String(nanos).padStart(9, "0");
          const line = `LVGL-1 [0] ${sec}.${nanoStr}: tracing_mark_write: ${phase}|1|${name}`;
          const ev = parseLine(line, 1);
          expect(ev).not.toBeNull();
          expect(ev!.phase).toBe(phase);
          expect(ev!.name).toBe(name);
          expect(ev!.timestampNs).toBe(BigInt(sec) * 1_000_000_000n + BigInt(nanos));
        },
      ),
    );
  });
});
