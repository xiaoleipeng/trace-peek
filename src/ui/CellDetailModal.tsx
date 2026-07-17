import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { CellDetail } from "../core/cellDetail";
import { fmtNumber } from "./format";

interface Props {
  detail: CellDetail;
  onClose: () => void;
}

/**
 * 点击柱状图后弹出：展示该文件该指标的原始数据 + 分布摘要。
 * 默认**只显示有效样本**（异常已剔除、不出现）；可勾选"显示异常样本"用于核对。
 */
export function CellDetailModal({ detail, onClose }: Props) {
  const [showOutliers, setShowOutliers] = useState(false);

  // 默认隐藏异常样本；勾选后才显示全部
  const shown = useMemo(
    () => (showOutliers ? detail.samples : detail.samples.filter((s) => !s.isOutlier)),
    [detail.samples, showOutliers],
  );

  const markLineData: { yAxis: number; name: string }[] = [
    { yAxis: detail.p50Ms, name: "P50" },
    { yAxis: detail.meanMs, name: "均值" },
  ];
  if (showOutliers && detail.upperBound !== null) {
    markLineData.push({ yAxis: detail.upperBound, name: "异常上界" });
  }

  const option = {
    title: { text: `${detail.metricLabel}（${detail.unit}）` },
    tooltip: { trigger: "axis" },
    grid: { top: 50, bottom: 40, left: 50, right: 20 },
    xAxis: {
      type: "category",
      data: shown.map((s) => s.index),
      name: "样本",
    },
    yAxis: { type: "value", name: detail.unit },
    series: [
      {
        type: "bar",
        data: shown.map((s) => ({
          value: s.valueMs,
          itemStyle: { color: s.isOutlier ? "#e5533d" : "#5470c6" },
        })),
        markLine: { silent: true, symbol: "none", data: markLineData },
      },
    ],
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{detail.fileId}</h3>
          <button onClick={onClose}>×</button>
        </div>

        <div className="modal-summary">
          <span>
            有效样本 <b>{detail.count}</b>
          </span>
          {detail.outlierCount > 0 && (
            <span className="outlier-tag">
              已剔除异常 <b>{detail.outlierCount}</b>
            </span>
          )}
          <span>
            均值 <b>{fmtNumber(detail.meanMs, 3)}</b>
          </span>
          <span>
            P50 <b>{fmtNumber(detail.p50Ms, 3)}</b>
          </span>
          <span>
            P90 <b>{fmtNumber(detail.p90Ms, 3)}</b>
          </span>
          <span>
            最大(有效) <b>{fmtNumber(detail.maxMs, 3)}</b>
          </span>
          <span>（单位 {detail.unit}）</span>
        </div>

        {detail.outlierCount > 0 && (
          <label className="show-outliers">
            <input
              type="checkbox"
              checked={showOutliers}
              onChange={(e) => setShowOutliers(e.target.checked)}
            />
            显示已剔除的 {detail.outlierCount} 个异常样本（仅用于核对，不计入统计）
          </label>
        )}
        {detail.note && <p className="modal-note">⚠ {detail.note}</p>}

        {shown.length > 0 ? (
          <ReactECharts option={option} style={{ height: 280 }} notMerge />
        ) : (
          <p>无有效数据。</p>
        )}

        <details className="modal-raw">
          <summary>
            {showOutliers ? "原始数值列表（含异常，红色标记）" : "有效数值列表"}（
            {shown.length}）
          </summary>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>标签</th>
                <th>{detail.unit}</th>
                {showOutliers && <th>状态</th>}
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.index} className={s.isOutlier ? "row-warn" : ""}>
                  <td>{s.index}</td>
                  <td>{s.label}</td>
                  <td>{fmtNumber(s.valueMs, 4)}</td>
                  {showOutliers && (
                    <td className={s.isOutlier ? "cell-warn" : ""}>
                      {s.isOutlier ? "异常(剔除)" : "有效"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}
