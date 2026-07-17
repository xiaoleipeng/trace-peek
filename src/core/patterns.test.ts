import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { wildcardToRegExp, compileUserRegExp, escapeRegExp } from "./patterns";

describe("wildcardToRegExp", () => {
  it("lv_draw_* 匹配前缀", () => {
    const re = wildcardToRegExp("lv_draw_*");
    expect(re.test("lv_draw_rect")).toBe(true);
    expect(re.test("lv_draw_add_task")).toBe(true);
    expect(re.test("vg_lite_draw")).toBe(false);
    expect(re.source).toBe("^lv_draw_.*$");
  });

  it("转义正则元字符，避免注入", () => {
    // 点号应被当作字面量而非任意字符
    const re = wildcardToRegExp("a.b");
    expect(re.test("a.b")).toBe(true);
    expect(re.test("axb")).toBe(false);
  });

  it("中间与多个通配符", () => {
    const re = wildcardToRegExp("*draw*");
    expect(re.test("lv_draw_rect")).toBe(true);
    expect(re.test("draw")).toBe(true);
    expect(re.test("nope")).toBe(false);
  });

  it("属性 19：任意输入都不抛异常且首尾锚定", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const re = wildcardToRegExp(s);
        expect(re.source.startsWith("^")).toBe(true);
        expect(re.source.endsWith("$")).toBe(true);
        // 执行匹配也不应抛异常
        expect(() => re.test("anything")).not.toThrow();
      }),
    );
  });

  it("escapeRegExp 转义所有元字符", () => {
    const s = ".*+?^${}()|[]\\";
    const escaped = escapeRegExp(s);
    const re = new RegExp(`^${escaped}$`);
    expect(re.test(s)).toBe(true);
  });
});

describe("compileUserRegExp", () => {
  it("合法正则返回 ok", () => {
    const r = compileUserRegExp("^lv_.*$");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.re.test("lv_draw")).toBe(true);
  });

  it("非法正则返回校验错误而非抛异常", () => {
    const r = compileUserRegExp("(unclosed");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.error).toBe("string");
  });

  it("属性 20：任意字符串输入要么合法要么错误，绝不抛异常", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(() => compileUserRegExp(s)).not.toThrow();
        const r = compileUserRegExp(s);
        expect(typeof r.ok).toBe("boolean");
      }),
    );
  });
});
