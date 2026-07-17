import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  moveFile,
  moveToUnclassified,
  createCustomCategory,
  deleteCategory,
  renameCategory,
  checkPartition,
} from "./classificationState";
import { autoClassify, UNCLASSIFIED_ID, DEFAULT_CLASSIFIER_CONFIG } from "../core/classifier";
import type { ClassificationState, FileEntry, ParsedDims } from "../core/types";

const emptyDims: ParsedDims = {
  scene: null,
  algo: null,
  downsample: null,
  matched: false,
  raw: "",
};

function makeState(names: string[]): ClassificationState {
  const entries: FileEntry[] = names.map((n) => ({
    id: n,
    name: n,
    parsedDims: emptyDims,
  }));
  // 显式按 downsample 分组，产出 ds8/dsauto 两类，便于验证拖拽迁移。
  return autoClassify(entries, { ...DEFAULT_CLASSIFIER_CONFIG, groupBy: ["downsample"] });
}

describe("classificationState — 基本行为", () => {
  it("moveFile 后文件唯一归属目标分类", () => {
    let s = makeState([
      "a-exp-ds8.trace",
      "b-exp-dsauto.trace",
    ]);
    const ds8 = s.categories.find((c) => c.label === "ds8")!;
    const dsauto = s.categories.find((c) => c.label === "dsauto")!;
    s = moveFile(s, "a-exp-ds8.trace", dsauto.id);
    const ds8After = s.categories.find((c) => c.id === ds8.id)!;
    const dsautoAfter = s.categories.find((c) => c.id === dsauto.id)!;
    expect(ds8After.fileIds).not.toContain("a-exp-ds8.trace");
    expect(dsautoAfter.fileIds).toContain("a-exp-ds8.trace");
  });

  it("moveToUnclassified 把文件移到未分类桶", () => {
    let s = makeState(["a-exp-ds8.trace"]);
    s = moveToUnclassified(s, "a-exp-ds8.trace");
    const u = s.categories.find((c) => c.id === UNCLASSIFIED_ID)!;
    expect(u.fileIds).toContain("a-exp-ds8.trace");
  });

  it("createCustomCategory + move 进自定义组", () => {
    let s = makeState(["a-exp-ds8.trace"]);
    s = createCustomCategory(s, "我的组");
    const custom = s.categories.find((c) => c.label === "我的组")!;
    s = moveFile(s, "a-exp-ds8.trace", custom.id);
    expect(s.categories.find((c) => c.id === custom.id)!.fileIds).toContain(
      "a-exp-ds8.trace",
    );
  });

  it("deleteCategory 把文件回落到未分类桶", () => {
    let s = makeState(["a-exp-ds8.trace"]);
    s = createCustomCategory(s, "临时");
    const custom = s.categories.find((c) => c.label === "临时")!;
    s = moveFile(s, "a-exp-ds8.trace", custom.id);
    s = deleteCategory(s, custom.id);
    expect(s.categories.find((c) => c.id === custom.id)).toBeUndefined();
    const u = s.categories.find((c) => c.id === UNCLASSIFIED_ID)!;
    expect(u.fileIds).toContain("a-exp-ds8.trace");
  });

  it("renameCategory 改标签", () => {
    let s = makeState(["a-exp-ds8.trace"]);
    const ds8 = s.categories.find((c) => c.label === "ds8")!;
    s = renameCategory(s, ds8.id, "下采样8");
    expect(s.categories.find((c) => c.id === ds8.id)!.label).toBe("下采样8");
  });
});

describe("classificationState — 属性测试", () => {
  const names = [
    "feather_64_64_10-exp-ds8.trace",
    "feather_64_64_10-exp-dsauto.trace",
    "radial_34-gau-ds8.trace",
    "stroke_feather-stk-dsauto.trace",
    "garbage.log",
  ];

  type Op =
    | { kind: "move"; fileIdx: number; catIdx: number }
    | { kind: "unclassify"; fileIdx: number }
    | { kind: "createAndMove"; fileIdx: number };

  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.record({
      kind: fc.constant("move" as const),
      fileIdx: fc.integer({ min: 0, max: names.length - 1 }),
      catIdx: fc.integer({ min: 0, max: 5 }),
    }),
    fc.record({
      kind: fc.constant("unclassify" as const),
      fileIdx: fc.integer({ min: 0, max: names.length - 1 }),
    }),
    fc.record({
      kind: fc.constant("createAndMove" as const),
      fileIdx: fc.integer({ min: 0, max: names.length - 1 }),
    }),
  );

  it("属性 14：任意拖拽操作序列后仍保持划分完备（唯一归属、覆盖、不相交）", () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 30 }), (ops) => {
        let s = makeState(names);
        for (const op of ops) {
          const fileId = names[op.fileIdx];
          if (op.kind === "move") {
            const cat = s.categories[op.catIdx % s.categories.length];
            s = moveFile(s, fileId, cat.id);
          } else if (op.kind === "unclassify") {
            s = moveToUnclassified(s, fileId);
          } else {
            s = createCustomCategory(s, "g");
            const cat = s.categories[s.categories.length - 1];
            s = moveFile(s, fileId, cat.id);
          }
          const { complete, disjoint } = checkPartition(s);
          expect(complete).toBe(true);
          expect(disjoint).toBe(true);
        }
      }),
    );
  });

  it("属性 15：拖拽不改变外部解析缓存（此处以 entries 不变间接验证）", () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 20 }), (ops) => {
        const s0 = makeState(names);
        const entriesBefore = JSON.stringify(Object.keys(s0.entries).sort());
        let s = s0;
        for (const op of ops) {
          const fileId = names[op.fileIdx];
          if (op.kind === "move") {
            s = moveFile(s, fileId, s.categories[op.catIdx % s.categories.length].id);
          } else if (op.kind === "unclassify") {
            s = moveToUnclassified(s, fileId);
          }
        }
        // entries（文件集合，对应缓存键集合）不因拖拽变化
        expect(JSON.stringify(Object.keys(s.entries).sort())).toBe(entriesBefore);
      }),
    );
  });
});
