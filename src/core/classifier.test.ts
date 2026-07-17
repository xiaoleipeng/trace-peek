import { describe, it, expect } from "vitest";
import {
  parseFilename,
  autoClassify,
  previewParse,
  DEFAULT_CLASSIFIER_CONFIG,
  UNCLASSIFIED_ID,
} from "./classifier";
import type { FileEntry, ParsedDims } from "./types";

const emptyDims: ParsedDims = {
  scene: null,
  algo: null,
  downsample: null,
  matched: false,
  raw: "",
};

function entry(name: string): FileEntry {
  return { id: name, name, parsedDims: emptyDims };
}

describe("parseFilename（按 '-' 分隔）", () => {
  it("从右取两段：downsample、algo，其余为 scene", () => {
    const d = parseFilename("feather_64_64_10-exp-ds8.trace", DEFAULT_CLASSIFIER_CONFIG);
    expect(d.matched).toBe(true);
    expect(d.scene).toBe("feather_64_64_10");
    expect(d.algo).toBe("exp");
    expect(d.downsample).toBe("ds8");
  });

  it("scene 含分隔符也能正确切分（从右取两段）", () => {
    const d = parseFilename("linear_feather_anim-gau-dsauto.trace", DEFAULT_CLASSIFIER_CONFIG);
    expect(d.scene).toBe("linear_feather_anim");
    expect(d.algo).toBe("gau");
    expect(d.downsample).toBe("dsauto");
  });

  it("不依赖枚举：任意 algo/downsample 值都可解析", () => {
    const d = parseFilename("myscene-foo-bar.trace", DEFAULT_CLASSIFIER_CONFIG);
    expect(d.matched).toBe(true);
    expect(d.scene).toBe("myscene");
    expect(d.algo).toBe("foo");
    expect(d.downsample).toBe("bar");
  });

  it("段数不足 3 → 不匹配", () => {
    const d = parseFilename("onlyone.trace", DEFAULT_CLASSIFIER_CONFIG);
    expect(d.matched).toBe(false);
    const d2 = parseFilename("scene-algo.trace", DEFAULT_CLASSIFIER_CONFIG);
    expect(d2.matched).toBe(false);
  });
});

describe("autoClassify — 三种维度分组", () => {
  const names = [
    "feather_64_64_10-exp-ds8.trace",
    "feather_64_64_10-exp-dsauto.trace",
    "feather_64_64_10-gau-ds8.trace",
    "radial_34-stk-dsauto.trace",
    "garbage.log",
  ];
  const entries = names.map(entry);

  it("按 scene 分组（同文件/同 case 归一组）", () => {
    const s = autoClassify(entries, { delimiter: "-", groupBy: ["scene"] });
    const feather = s.categories.find((c) => c.label === "feather_64_64_10")!;
    expect(feather.fileIds).toHaveLength(3);
    const radial = s.categories.find((c) => c.label === "radial_34")!;
    expect(radial.fileIds).toHaveLength(1);
  });

  it("按 downsample 分组（不同采样率）", () => {
    const s = autoClassify(entries, { delimiter: "-", groupBy: ["downsample"] });
    expect(s.categories.find((c) => c.label === "ds8")!.fileIds).toHaveLength(2);
    expect(s.categories.find((c) => c.label === "dsauto")!.fileIds).toHaveLength(2);
  });

  it("按 algo 分组（不同算法）", () => {
    const s = autoClassify(entries, { delimiter: "-", groupBy: ["algo"] });
    expect(s.categories.find((c) => c.label === "exp")!.fileIds).toHaveLength(2);
    expect(s.categories.find((c) => c.label === "gau")!.fileIds).toHaveLength(1);
    expect(s.categories.find((c) => c.label === "stk")!.fileIds).toHaveLength(1);
  });

  it("不匹配文件落入未分类桶", () => {
    const s = autoClassify(entries, { delimiter: "-", groupBy: ["scene"] });
    expect(
      s.categories.find((c) => c.id === UNCLASSIFIED_ID)!.fileIds,
    ).toEqual(["garbage.log"]);
  });
});

describe("previewParse — 自定义规则预览", () => {
  it("自定义分隔符（下划线）", () => {
    const rows = previewParse(["scene_exp_ds8"], { delimiter: "_", groupBy: ["scene"] });
    expect(rows[0].dims.matched).toBe(true);
    expect(rows[0].dims.scene).toBe("scene");
    expect(rows[0].dims.algo).toBe("exp");
    expect(rows[0].dims.downsample).toBe("ds8");
  });

  it("自定义命名分组正则", () => {
    const pattern = /^(?<downsample>ds\d+)-(?<algo>\w+)-(?<scene>.+)$/;
    const rows = previewParse(["ds8-exp-feather_64"], { pattern, groupBy: ["scene"] });
    expect(rows[0].dims.matched).toBe(true);
    expect(rows[0].dims.scene).toBe("feather_64");
    expect(rows[0].dims.algo).toBe("exp");
    expect(rows[0].dims.downsample).toBe("ds8");
  });

  it("不匹配返回 matched=false", () => {
    const rows = previewParse(["nope"], { delimiter: "-", groupBy: ["scene"] });
    expect(rows[0].dims.matched).toBe(false);
  });
});
