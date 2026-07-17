import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AnalysisReport,
  ClassificationState,
  GroupDimension,
  Interval,
} from "../core/types";
import { DEFAULT_FRAME_BOUNDARY } from "../core/types";
import { autoClassify, DEFAULT_CLASSIFIER_CONFIG } from "../core/classifier";
import type { ClassifierConfig } from "../core/types";
import {
  toCaseMetrics,
  DEFAULT_FRAME_OUTLIER,
  type CaseMetrics,
  type FrameOutlierConfig,
} from "../core/caseAnalysis";
import { WorkerPool, type ParsedCache } from "../worker/WorkerPool";
import type { AppPhase, UiFileEntry } from "./types";
import { FolderPicker } from "./FolderPicker";
import { ClassificationBoard } from "./ClassificationBoard";
import { ClassifierConfigPanel } from "./ClassifierConfigPanel";
import { Dashboard } from "./Dashboard";
import { CaseTable } from "./CaseTable";
import { CompareView } from "./CompareView";
import { GroupCompareView } from "./GroupCompareView";
import { FunctionDrilldown } from "./FunctionDrilldown";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { ExportPanel } from "./ExportPanel";
import { saveClassification } from "./persistence";

const GROUP_OPTIONS: { value: GroupDimension; label: string }[] = [
  { value: "scene", label: "同文件(scene)" },
  { value: "downsample", label: "采样率(downsample)" },
  { value: "algo", label: "算法(algo)" },
];

export function App() {
  const [phase, setPhase] = useState<AppPhase>("Idle");
  const [entries, setEntries] = useState<UiFileEntry[]>([]);
  const [groupBy, setGroupBy] = useState<GroupDimension>("scene");
  // 分类规则（分隔符/正则）；默认按 '-' 拆。groupBy 单独管理。
  const [classifierBase, setClassifierBase] = useState<Omit<ClassifierConfig, "groupBy">>({
    delimiter: DEFAULT_CLASSIFIER_CONFIG.delimiter,
  });
  const [state, setState] = useState<ClassificationState | null>(null);
  const [cache, setCache] = useState<ParsedCache>(new Map());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [frameOutlier, setFrameOutlier] = useState<FrameOutlierConfig>(DEFAULT_FRAME_OUTLIER);
  const [error, setError] = useState<string | null>(null);

  const reportsById = useMemo(() => {
    const m = new Map<string, AnalysisReport>();
    for (const [id, e] of cache) m.set(id, e.report);
    return m;
  }, [cache]);

  const intervalsById = useMemo(() => {
    const m = new Map<string, Interval[]>();
    for (const [id, e] of cache) m.set(id, e.intervals);
    return m;
  }, [cache]);

  // 每个文件是独立 case，抽取其独立指标（不做任何跨文件平均）。
  const cases: CaseMetrics[] = useMemo(() => {
    if (!state) return [];
    const out: CaseMetrics[] = [];
    for (const [id, e] of cache) {
      const entry = state.entries[id];
      if (entry) out.push(toCaseMetrics(e.report, entry, frameOutlier));
    }
    return out;
  }, [state, cache, frameOutlier]);

  // 用给定文件集 + 基础规则 + 分组维度做分类，并保留浏览器句柄/File 字段。
  const classifyWith = useCallback(
    (
      files: UiFileEntry[],
      base: Omit<ClassifierConfig, "groupBy">,
      dim: GroupDimension,
    ): ClassificationState => {
      const cfg: ClassifierConfig = { ...base, groupBy: [dim] };
      const classified = autoClassify(files, cfg);
      for (const e of files) {
        const existing = classified.entries[e.id];
        if (existing)
          classified.entries[e.id] = {
            ...e,
            ...existing,
            handle: e.handle,
            file: e.file,
          } as UiFileEntry;
      }
      return classified;
    },
    [],
  );

  const reclassify = useCallback(
    (dim: GroupDimension) => {
      if (entries.length === 0) return;
      setState(classifyWith(entries, classifierBase, dim));
    },
    [entries, classifierBase, classifyWith],
  );

  // 应用自定义分类规则（分隔符/正则）后重新分类
  const applyClassifierConfig = useCallback(
    (cfg: ClassifierConfig) => {
      if (entries.length === 0) return;
      const base = { delimiter: cfg.delimiter, pattern: cfg.pattern };
      setClassifierBase(base);
      setState(classifyWith(entries, base, groupBy));
    },
    [entries, groupBy, classifyWith],
  );

  const handleFilesSelected = useCallback(
    async (selected: UiFileEntry[]) => {
      setError(null);
      if (selected.length === 0) {
        setError("未找到任何 .trace 文件。");
        return;
      }
      setEntries(selected);
      setPhase("Loading");

      setState(classifyWith(selected, classifierBase, groupBy));
      setPhase("Parsing");

      const files = await Promise.all(
        selected.map(async (e) => ({
          fileId: e.id,
          text: e.file ? await e.file.text() : "",
        })),
      );
      const pool = new WorkerPool();
      const c = await pool.parseAll(files, DEFAULT_FRAME_BOUNDARY, (done, total) =>
        setProgress({ done, total }),
      );
      setCache(c);
      setProgress(null);
      setPhase("Reviewing");
    },
    [groupBy, classifierBase, classifyWith],
  );

  const handleGroupByChange = useCallback(
    (dim: GroupDimension) => {
      setGroupBy(dim);
      reclassify(dim);
    },
    [reclassify],
  );

  useEffect(() => {
    if (state) saveClassification(state);
  }, [state]);

  return (
    <div className="app">
      <header>
        <h1>Trace 性能分析工具</h1>
        <span className="phase-badge">{phase}</span>
      </header>

      <section className="step step-pick">
        <FolderPicker onFilesSelected={handleFilesSelected} />
        {error && <p className="error">{error}</p>}
        {progress && (
          <p className="progress">
            解析中 {progress.done}/{progress.total} …
          </p>
        )}
      </section>

      {state && (
        <section className="step step-classify">
          <h2>分类（可拖拽调整）</h2>
          <ClassifierConfigPanel
            fileNames={entries.map((e) => e.name)}
            groupBy={groupBy}
            onApply={applyClassifierConfig}
          />
          <div className="groupby-selector">
            分类维度：
            {GROUP_OPTIONS.map((o) => (
              <label key={o.value}>
                <input
                  type="radio"
                  name="groupby"
                  checked={groupBy === o.value}
                  onChange={() => handleGroupByChange(o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
          <ClassificationBoard state={state} onChange={setState} />
        </section>
      )}

      {cache.size > 0 && (
        <>
          <section className="step step-filter">
            <label className="frame-outlier-toggle">
              <input
                type="checkbox"
                checked={frameOutlier.enabled}
                onChange={(e) =>
                  setFrameOutlier({ ...frameOutlier, enabled: e.target.checked })
                }
              />
              自动剔除超大帧（避免个别卡顿帧拉偏帧率统计）
            </label>
            <select
              value={frameOutlier.method}
              disabled={!frameOutlier.enabled}
              onChange={(e) =>
                setFrameOutlier({
                  ...frameOutlier,
                  method: e.target.value as FrameOutlierConfig["method"],
                })
              }
            >
              <option value="iqr">IQR</option>
              <option value="percentile">P99</option>
              <option value="mad">MAD</option>
            </select>
          </section>

          <section className="step step-cases">
            <h2>逐文件指标（每个 .trace = 独立 case，帧率已按上方设置剔除超大帧）</h2>
            <CaseTable cases={cases} />
          </section>

          <section className="step step-group-compare">
            <h2>分组对比图表（一次性展示所有文件，每根柱为单个文件真实值）</h2>
            <GroupCompareView
              cases={cases}
              reportsById={reportsById}
              intervalsById={intervalsById}
              outlierMethod={frameOutlier.enabled ? frameOutlier.method : "none"}
            />
          </section>

          <section className="step step-compare">
            <h2>对比明细表（横向 / 纵向，可读具体数值）</h2>
            <CompareView cases={cases} />
          </section>

          <section className="step step-dashboard">
            <h2>单文件详细分析（self 热点 / 火焰图 / 调用树）</h2>
            <Dashboard reportsById={reportsById} intervalsById={intervalsById} />
          </section>

          <section className="step step-drilldown">
            <FunctionDrilldown
              reports={[...reportsById.values()]}
              intervalsById={intervalsById}
            />
          </section>

          <section className="step step-diagnostics">
            <DiagnosticsPanel reportsById={reportsById} />
          </section>

          <section className="step step-export">
            <ExportPanel cases={cases} />
          </section>
        </>
      )}
    </div>
  );
}
