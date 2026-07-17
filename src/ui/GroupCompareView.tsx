import { useMemo, useState } from "react";
import { CASE_METRIC_LABELS, type CaseMetricKey, type CaseMetrics } from "../core/caseAnalysis";
import { listFunctionNames, type FnAgg, type MetricSpec } from "../core/groupCompare";
import { buildCellDetail, type CellDetail } from "../core/cellDetail";
import type { AnalysisReport, Interval } from "../core/types";
import { GroupCompareChart } from "./GroupCompareChart";
import { CellDetailModal } from "./CellDetailModal";

interface Props {
  cases: CaseMetrics[];
  reportsById: Map<string, AnalysisReport>;
  intervalsById: Map<string, Interval[]>;
  outlierMethod?: "none" | "percentile" | "iqr" | "mad";
}

const FRAME_METRICS: CaseMetricKey[] = [
  "avgRenderFps",
  "avgDisplayFps",
  "avgFrameMs",
  "p90FrameMs",
  "maxFrameMs",
];

/**
 * 三张分组柱状图，一次性展示所有文件：
 *  图1 不同算法（seriesDim=algo）
 *  图2 不同采样率（seriesDim=downsample）
 *  图3 不同文件（seriesDim=scene）
 * 指标可选帧级（帧率等）或某函数 self 耗时（如 blur、finish）。
 */
export function GroupCompareView({
  cases,
  reportsById,
  intervalsById,
  outlierMethod = "iqr",
}: Props) {
  const fnNames = useMemo(() => listFunctionNames(cases), [cases]);
  const [detail, setDetail] = useState<CellDetail | null>(null);

  const [metricKind, setMetricKind] = useState<"frame" | "fnSelf">("frame");
  const [frameKey, setFrameKey] = useState<CaseMetricKey>("avgRenderFps");
  const [fnQuery, setFnQuery] = useState<string>("blur");
  const [fnAgg, setFnAgg] = useState<FnAgg>("perCall");

  const metric: MetricSpec =
    metricKind === "frame"
      ? { kind: "frame", key: frameKey }
      : { kind: "fnSelf", fn: fnQuery, agg: fnAgg };

  const handleBarClick = (fileId: string) => {
    setDetail(
      buildCellDetail(
        fileId,
        metric,
        reportsById.get(fileId),
        intervalsById.get(fileId),
        outlierMethod,
      ),
    );
  };

  return (
    <div className="group-compare-view">
      <div className="group-metric-picker">
        <label>
          <input
            type="radio"
            checked={metricKind === "frame"}
            onChange={() => setMetricKind("frame")}
          />
          帧级指标
        </label>
        {metricKind === "frame" && (
          <select value={frameKey} onChange={(e) => setFrameKey(e.target.value as CaseMetricKey)}>
            {FRAME_METRICS.map((k) => (
              <option key={k} value={k}>
                {CASE_METRIC_LABELS[k]}
              </option>
            ))}
          </select>
        )}
        <label>
          <input
            type="radio"
            checked={metricKind === "fnSelf"}
            onChange={() => setMetricKind("fnSelf")}
          />
          函数 self 耗时
        </label>
        {metricKind === "fnSelf" && (
          <>
            <input
              list="fn-names"
              value={fnQuery}
              onChange={(e) => setFnQuery(e.target.value)}
              placeholder="如 blur / finish"
            />
            <datalist id="fn-names">
              {fnNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <select value={fnAgg} onChange={(e) => setFnAgg(e.target.value as FnAgg)}>
              <option value="perCall">每次调用平均（推荐，跨文件可比）</option>
              <option value="perFrame">每帧平均</option>
              <option value="total">累计总和（受帧数影响，慎用）</option>
            </select>
          </>
        )}
      </div>

      {metricKind === "fnSelf" && (
        <p className="dashboard-note">
          注意：<b>累计</b>口径受帧数/调用次数影响，不同文件帧数不同则不可直接比较；
          跨算法对比请用 <b>每次调用平均</b>（单次开销）或 <b>每帧平均</b>。若结果与理论不符
          （如 stk 反而慢于 gau），先切到"每次调用平均"排除帧数差异，再看是否为原始 trace 抖动。
        </p>
      )}

      <p className="pivot-hint">提示：点击任意柱子可展开该文件的每一条原始数据，便于核对正确性。</p>

      <GroupCompareChart
        title="图1 · 不同算法对比（同文件·同采样率下 exp/gau/stk）"
        cases={cases}
        seriesDim="algo"
        metric={metric}
        onBarClick={handleBarClick}
      />
      <GroupCompareChart
        title="图2 · 不同采样率对比（同文件·同算法下 ds8/dsauto）"
        cases={cases}
        seriesDim="downsample"
        metric={metric}
        onBarClick={handleBarClick}
      />
      <GroupCompareChart
        title="图3 · 不同文件对比（同算法·同采样率下各 scene，按文件名自然排序）"
        cases={cases}
        seriesDim="scene"
        metric={metric}
        onBarClick={handleBarClick}
      />

      {detail && <CellDetailModal detail={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
