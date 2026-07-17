/**
 * 分析核心的公共类型定义。
 *
 * 约定：所有纳秒时间戳/耗时一律用 `bigint` 表示以保留精度，
 * 仅在图表/导出边界才转换为 number（µs/ms）。
 * 本文件（及整个 core/）不得 import 任何 React 或浏览器专有 API。
 */

/** 单条 trace 事件（parseLine 的产物）。 */
export interface TraceEvent {
  task: string; // 如 "LVGL-1"
  cpu: number; // 如 0
  timestampNs: bigint; // "秒.纳秒" 转换后的整数纳秒
  phase: "B" | "E"; // Begin / End
  markerId: number; // "B|1|name" 中的 1
  name: string; // 事件/函数名
  lineNo: number; // 1 起始的源行号，用于诊断
}

/** 一段已配对的调用区间（buildIntervals 的产物）。 */
export interface Interval {
  id: number; // 该次调用的唯一实例 id（用于重建调用树）
  parentId: number | null; // 父调用实例 id（顶层为 null）
  name: string;
  startNs: bigint;
  endNs: bigint;
  durationNs: bigint; // endNs - startNs，恒 >= 0
  depth: number; // B 标记时刻的嵌套深度，0 = 顶层
  parentName: string | null;
  childrenNs: bigint; // 直接子项耗时累加，用于自身耗时分解
}

/** 解析期结构性异常计数。 */
export interface Diagnostics {
  totalLines: number;
  parsedEvents: number;
  skippedHeaderLines: number;
  malformedLines: number[]; // 行号列表
  danglingBegin: number; // EOF 处仍打开的 B（截断尾部）
  danglingEnd: number; // 没有对应打开 B 的 E（中途开始）
  mismatchedNames: number; // E 名称 != 栈顶名称
  negativeDurations: number; // E 时间戳早于 B（时钟异常），被钳制为 0
  stackDepthCapHits: number; // 触达栈深上限的次数（病态输入保护）
}

/** buildIntervals 的返回。 */
export interface ParseResult {
  intervals: Interval[];
  diagnostics: Diagnostics;
}

/** 单个函数（按 name 聚合）的统计。 */
export interface FunctionStats {
  name: string;
  count: number;
  totalTimeNs: bigint; // 各次耗时之和（含子项的墙钟时间）
  selfTimeNs: bigint; // totalTimeNs 减去直接子项耗时
  minNs: bigint;
  maxNs: bigint;
  avgNs: number;
  p50Ns: number;
  p90Ns: number;
  p99Ns: number;
}

/** 每帧耗时与帧率。 */
export interface FrameReport {
  boundaryEvent: string; // 默认 "_lv_display_refr_timer"
  frameCount: number;
  frameDurationsNs: bigint[]; // 各已配对帧边界区间的渲染耗时
  frameStartsNs: bigint[]; // 各已配对帧边界的 startNs（用于帧周期/刷新率）
  avgFrameMs: number;
  p90FrameMs: number;
  maxFrameMs: number;
  avgRenderFps: number; // 渲染耗时视角：1e9 / mean(frameDurationsNs)
  avgDisplayFps: number | null; // 实际刷新率视角：1e9 / mean(相邻 start 间隔)；帧数<2 时 null
}

/** 单文件的完整分析报告。 */
export interface AnalysisReport {
  source: string; // fileId / 文件名
  wallClockNs: bigint; // 末事件时间戳 - 首事件时间戳
  totalEvents: number;
  functions: FunctionStats[]; // 每个不同 name 一条
  frames?: FrameReport;
  diagnostics: Diagnostics;
}

/* ------------------------- 分类与筛选相关类型 ------------------------- */

export type GroupDimension = "scene" | "algo" | "downsample";

/** 文件名解析出的维度。 */
export interface ParsedDims {
  scene: string | null;
  algo: string | null; // "exp" | "gau" | "stk"
  downsample: string | null; // "ds8" | "dsauto"
  matched: boolean; // 是否完全匹配配置正则
  raw: string; // 去扩展名后的原始文件名
}

export interface ClassifierConfig {
  /** 分隔符解析：文件名按该分隔符从右取 algo/downsample，其余为 scene。默认 "-"。 */
  delimiter?: string;
  /** 高级覆盖：带命名分组 (scene/algo/downsample) 的正则；提供时优先于 delimiter。 */
  pattern?: RegExp;
  groupBy: GroupDimension[];
}

/** 统计层（值级）异常剔除配置。 */
export interface AnomalyFilterConfig {
  dropIncompleteFrames: boolean; // 启发式：丢弃已配对但疑似被截断的首/末帧，默认 true
  warmupFrames: number; // 丢弃前 N 帧预热，默认 1
  method: "none" | "percentile" | "iqr" | "mad"; // 默认 "none"
}

export interface RemovedSample {
  value: number;
  reason: string;
}

export interface AnomalyReport {
  method: string;
  originalCount: number;
  removedCount: number;
  keptCount: number;
  removedSamples: RemovedSample[];
  avgBefore: number;
  avgAfter: number;
}

/* ------------------------- 分类汇总 / 对比 ------------------------- */

export interface CategorySummary {
  categoryId: string;
  label: string;
  fileIds: string[];
  functions: FunctionStats[]; // 该分类内所有文件按 name 再聚合
  frames?: FrameReport; // 该分类合并后的帧统计
  sampleCount: number;
  anomaly?: AnomalyReport;
}

export interface MetricRow {
  key: string; // 函数名或 "FPS"/"avgFrameMs" 等
  valuesByCategory: Record<string, number>;
  bestCategory: string;
  worstCategory: string;
}

export interface ComparisonMatrix {
  dimension: GroupDimension | "custom";
  categories: string[]; // 列：各分类 label
  metrics: MetricRow[]; // 行：per-function 或 per-frame 指标
}

/* ------------------------- 函数下钻 ------------------------- */

export interface FunctionSelector {
  mode: "exact" | "wildcard" | "multi";
  query: string | string[];
}

export interface CallDetail {
  fileId: string;
  frameIndex: number | null; // 该调用落在第几帧（不落入任何帧边界区间则 null）
  startNs: bigint;
  durationNs: bigint;
}

/* ------------------------- GUI 层：文件与分类状态 ------------------------- */

/** 一个被选中的 trace 文件。core 层只依赖其纯数据部分。 */
export interface FileEntry {
  id: string; // 稳定 id（如文件名）
  name: string; // "feather_64_64_10-exp-ds8.trace"
  parsedDims: ParsedDims; // 文件名解析结果
  // handle?/file? 等浏览器专有字段在 UI 层扩展，不在 core 依赖。
}

/** 一个分类分组。 */
export interface Category {
  id: string;
  label: string;
  dims: Partial<ParsedDims>;
  fileIds: string[];
  isUnclassified?: boolean;
  isCustom?: boolean;
}

/** 分类总状态（可持久化）。 */
export interface ClassificationState {
  entries: Record<string, FileEntry>;
  categories: Category[];
  groupBy: GroupDimension[];
  classifierConfig: ClassifierConfig;
}

/* ------------------------- 常量 ------------------------- */

/** 默认帧边界事件名。 */
export const DEFAULT_FRAME_BOUNDARY = "_lv_display_refr_timer";

/** 默认文件名分类正则：scene 非贪婪捕获，algo/downsample 为已知枚举。 */
export const DEFAULT_CLASSIFIER_PATTERN =
  /^(?<scene>.+?)-(?<algo>exp|gau|stk)-(?<downsample>ds8|dsauto)$/;

/** buildIntervals 默认栈深上限，防病态输入耗尽内存。 */
export const DEFAULT_MAX_STACK_DEPTH = 4096;
