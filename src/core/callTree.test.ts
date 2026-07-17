import { describe, it, expect } from "vitest";
import { buildIntervals } from "./buildIntervals";
import { buildCallTree, flattenFlame } from "./callTree";
import { ev } from "./testutil";

describe("buildCallTree", () => {
  it("self time 正确分解，顶层 total 最大但 self 小", () => {
    // top(0..100) { a(10..40)=30, b(50..90)=40 }, top self=100-70=30
    const events = [
      ev("B", "top", 0),
      ev("B", "a", 10),
      ev("E", "a", 40),
      ev("B", "b", 50),
      ev("E", "b", 90),
      ev("E", "top", 100),
    ];
    const tree = buildCallTree(buildIntervals(events).intervals);
    expect(tree).toHaveLength(1);
    const top = tree[0];
    expect(top.name).toBe("top");
    expect(top.totalNs).toBe(100n);
    expect(top.selfNs).toBe(30n); // 100 - (30+40)
    // 子节点 a、b 都是叶子，self == total
    const a = top.children.find((c) => c.name === "a")!;
    const b = top.children.find((c) => c.name === "b")!;
    expect(a.selfNs).toBe(30n);
    expect(b.selfNs).toBe(40n);
  });

  it("同名多次调用在同路径下合并并累加 count", () => {
    const events = [
      ev("B", "root", 0),
      ev("B", "leaf", 1),
      ev("E", "leaf", 3),
      ev("B", "leaf", 4),
      ev("E", "leaf", 9),
      ev("E", "root", 10),
    ];
    const tree = buildCallTree(buildIntervals(events).intervals);
    const leaf = tree[0].children.find((c) => c.name === "leaf")!;
    expect(leaf.count).toBe(2);
    expect(leaf.totalNs).toBe(7n); // 2 + 5
    expect(leaf.selfNs).toBe(7n);
  });

  it("flattenFlame：子矩形落在父矩形范围内", () => {
    const events = [
      ev("B", "top", 0),
      ev("B", "a", 10),
      ev("E", "a", 40),
      ev("E", "top", 100),
    ];
    const rects = flattenFlame(buildCallTree(buildIntervals(events).intervals));
    const top = rects.find((r) => r.name === "top")!;
    const a = rects.find((r) => r.name === "a")!;
    expect(top.depth).toBe(0);
    expect(a.depth).toBe(1);
    // a 的偏移在 top 的 [start, start+total) 内
    expect(a.startNs >= top.startNs).toBe(true);
    expect(a.startNs + a.totalNs <= top.startNs + top.totalNs).toBe(true);
  });
});
