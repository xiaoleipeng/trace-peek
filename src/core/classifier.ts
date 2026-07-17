import type {
  Category,
  ClassificationState,
  ClassifierConfig,
  FileEntry,
  GroupDimension,
  ParsedDims,
} from "./types";

export const UNCLASSIFIED_ID = "__unclassified__";

export const DEFAULT_CLASSIFIER_CONFIG: ClassifierConfig = {
  // 默认按分隔符拆分；pattern 为可选的高级覆盖。
  delimiter: "-",
  groupBy: ["scene"],
};

/** 去掉 .trace 扩展名。 */
function stripExtension(name: string): string {
  return name.replace(/\.trace$/i, "");
}

/**
 * 按分隔符解析文件名维度。
 *
 * 约定：文件名形如  <scene><delim><algo><delim><downsample>.trace
 * 其中最后两个分隔符切出 algo 与 downsample，其余（可能含分隔符）全部归为 scene。
 * 例：
 *   feather_64_64_10-exp-ds8   -> scene=feather_64_64_10, algo=exp, downsample=ds8
 *   feather_martini-gau-dsauto -> scene=feather_martini,   algo=gau, downsample=dsauto
 *
 * 从右侧取两段，兼容 scene 自身包含分隔符的情况。
 * 段数不足 3 时 matched=false（缺失维度置 null），落入"未分类"。
 *
 * 若提供了 cfg.pattern（带命名分组 scene/algo/downsample），优先用正则。
 */
export function parseFilename(name: string, cfg: ClassifierConfig): ParsedDims {
  const raw = stripExtension(name);

  // 高级覆盖：命名分组正则
  if (cfg.pattern) {
    const m = cfg.pattern.exec(raw);
    if (m === null) {
      return { scene: null, algo: null, downsample: null, matched: false, raw };
    }
    const g = m.groups ?? {};
    return {
      scene: g.scene ?? null,
      algo: g.algo ?? null,
      downsample: g.downsample ?? null,
      matched: true,
      raw,
    };
  }

  // 默认：按分隔符从右取两段
  const delim = cfg.delimiter ?? "-";
  const parts = raw.split(delim);
  if (parts.length < 3) {
    return { scene: null, algo: null, downsample: null, matched: false, raw };
  }
  const downsample = parts[parts.length - 1];
  const algo = parts[parts.length - 2];
  const scene = parts.slice(0, parts.length - 2).join(delim);
  return { scene, algo, downsample, matched: true, raw };
}

/** 单个维度取值（缺失显示为 "?"）。 */
export function dimValue(dims: ParsedDims, dim: GroupDimension): string {
  return dims[dim] ?? "?";
}

/** 预览：对一批文件名按给定配置解析，返回每个文件的维度结果（供 UI 实时预览）。 */
export function previewParse(
  names: string[],
  cfg: ClassifierConfig,
): { name: string; dims: ParsedDims }[] {
  return names.map((name) => ({ name, dims: parseFilename(name, cfg) }));
}

/** 按选定维度组合出分组键/展示标签。 */
function joinDims(dims: ParsedDims, groupBy: GroupDimension[]): string {
  return groupBy.map((d) => dimValue(dims, d)).join(" / ");
}

/**
 * 按文件名自动分类，产出初始 ClassificationState。
 * 分类只用于「组织/展示」文件，不做任何跨文件数值平均。
 * 不匹配的文件落入固定的"未分类"桶。
 */
export function autoClassify(
  entries: FileEntry[],
  cfg: ClassifierConfig = DEFAULT_CLASSIFIER_CONFIG,
): ClassificationState {
  const catByKey = new Map<string, Category>();
  const unclassified: Category = {
    id: UNCLASSIFIED_ID,
    label: "未分类",
    dims: {},
    fileIds: [],
    isUnclassified: true,
  };

  const entryMap: Record<string, FileEntry> = {};

  for (const e0 of entries) {
    const parsedDims = parseFilename(e0.name, cfg);
    const e: FileEntry = { ...e0, parsedDims };
    entryMap[e.id] = e;

    if (!parsedDims.matched) {
      unclassified.fileIds.push(e.id);
      continue;
    }
    const key = joinDims(parsedDims, cfg.groupBy);
    let cat = catByKey.get(key);
    if (!cat) {
      const dims: Partial<ParsedDims> = {};
      for (const d of cfg.groupBy) dims[d] = parsedDims[d];
      cat = { id: `cat:${key}`, label: key, dims, fileIds: [] };
      catByKey.set(key, cat);
    }
    cat.fileIds.push(e.id);
  }

  const categories = [...catByKey.values()];
  categories.push(unclassified);

  return {
    entries: entryMap,
    categories,
    groupBy: cfg.groupBy,
    classifierConfig: cfg,
  };
}
