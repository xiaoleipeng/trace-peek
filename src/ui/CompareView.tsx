import { useMemo, useState } from "react";
import {
  CASE_METRIC_LABELS,
  type CaseMetricKey,
  type CaseMetrics,
} from "../core/caseAnalysis";
import {
  buildScenarioGrid,
  buildVerticalCompare,
  listScenes,
  listAlgoDsCombos,
} from "../core/compareViews";
import { fmtNumber } from "./format";

interface Props {
  cases: CaseMetrics[];
}

type Mode = "horizontal" | "vertical";

const METRIC_KEYS: CaseMetricKey[] = [
  "avgRenderFps",
  "avgDisplayFps",
  "avgFrameMs",
  "p90FrameMs",
  "maxFrameMs",
];

/**
 * 两种对比：
 * - 横向：固定同一文件(scene)，看 算法×采样率 网格差异（需求 1）。
 * - 纵向：固定同算法+同采样率，看不同文件(scene) 差异（需求 2）。
 */
export function CompareView({ cases }: Props) {
  const [mode, setMode] = useState<Mode>("horizontal");
  const [metric, setMetric] = useState<CaseMetricKey>("avgRenderFps");

  const scenes = useMemo(() => listScenes(cases), [cases]);
  const combos = useMemo(() => listAlgoDsCombos(cases), [cases]);

  const [scene, setScene] = useState<string>("");
  const [comboIdx, setComboIdx] = useState(0);

  const activeScene = scene || scenes[0] || "";
  const activeCombo = combos[comboIdx] ?? combos[0];

  const grid = useMemo(
    () => (activeScene ? buildScenarioGrid(cases, activeScene, metric) : null),
    [cases, activeScene, metric],
  );
  const vertical = useMemo(
    () =>
      activeCombo
        ? buildVerticalCompare(cases, activeCombo.algo, activeCombo.downsample, metric)
        : null,
    [cases, activeCombo, metric],
  );

  return (
    <div className="compare-view">
      <div className="compare-controls">
        <div className="mode-tabs">
          <button
            className={mode === "horizontal" ? "active" : ""}
            onClick={() => setMode("horizontal")}
          >
            横向：同文件 · 算法×采样率
          </button>
          <button
            className={mode === "vertical" ? "active" : ""}
            onClick={() => setMode("vertical")}
          >
            纵向：同算法+采样率 · 跨文件
          </button>
        </div>
        <label>
          指标
          <select value={metric} onChange={(e) => setMetric(e.target.value as CaseMetricKey)}>
            {METRIC_KEYS.map((k) => (
              <option key={k} value={k}>
                {CASE_METRIC_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {mode === "horizontal" ? (
          <label>
            文件(scene)
            <select value={activeScene} onChange={(e) => setScene(e.target.value)}>
              {scenes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            算法+采样率
            <select value={comboIdx} onChange={(e) => setComboIdx(Number(e.target.value))}>
              {combos.map((c, i) => (
                <option key={`${c.algo}|${c.downsample}`} value={i}>
                  {c.algo} · {c.downsample}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {mode === "horizontal" && grid && (
        <table className="pivot-table">
          <thead>
            <tr>
              <th>算法＼采样率</th>
              {grid.downsamples.map((d) => (
                <th key={d}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.algos.map((a) => (
              <tr key={a}>
                <td>{a}</td>
                {grid.downsamples.map((d) => {
                  const cell = grid.cells[a][d];
                  const cls = cell.isBest ? "cell-best" : cell.isWorst ? "cell-worst" : "";
                  return (
                    <td key={d} className={cls} title={cell.fileId ?? ""}>
                      {cell.value === null ? "—" : fmtNumber(cell.value, 2)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {mode === "vertical" && vertical && (
        <table className="pivot-table">
          <thead>
            <tr>
              <th>文件(scene)</th>
              <th>{CASE_METRIC_LABELS[metric]}</th>
            </tr>
          </thead>
          <tbody>
            {vertical.rows.map((r) => {
              const cls = r.isBest ? "cell-best" : r.isWorst ? "cell-worst" : "";
              return (
                <tr key={r.fileId}>
                  <td title={r.fileId}>{r.scene}</td>
                  <td className={cls}>{r.value === null ? "—" : fmtNumber(r.value, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="pivot-hint">
        每格为单个文件真实值（{(mode === "horizontal" ? grid : vertical)?.higherIsBetter
          ? "越高越好"
          : "越低越好"}
        ，绿=最优 红=最差）。
      </p>
    </div>
  );
}
