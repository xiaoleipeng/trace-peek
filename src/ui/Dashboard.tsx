import { useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { AnalysisReport, FunctionStats, Interval } from "../core/types";
import { fmtFps } from "./format";
import { FlameChart } from "./FlameChart";
import { CallTreeTable } from "./CallTreeTable";

interface Props {
  reportsById: Map<string, AnalysisReport>;
  intervalsById: Map<string, Interval[]>;
}

const NS_PER_MS = 1_000_000;
const NS_PER_US = 1_000;

/** 把逗号/空格分隔的关键词解析为小写子串数组。 */
function parseFilterTerms(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 函数名是否命中任一关键词（子串匹配，需求 4）。 */
function matchFn(name: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const lower = name.toLowerCase();
  return terms.some((t) => lower.includes(t));
}

function selfHotspotOption(fns: FunctionStats[], topN = 20) {
  const top = fns.slice(0, topN);
  return {
    title: { text: `自身耗时(self)热点 Top ${topN}` },
    tooltip: {
      trigger: "axis",
      formatter: (ps: { name: string; value: number }[]) =>
        `${ps[0].name}<br/>self: ${ps[0].value.toFixed(1)} µs`,
    },
    grid: { left: 220, right: 40 },
    xAxis: { type: "value", name: "self µs" },
    yAxis: { type: "category", data: top.map((f) => f.name).reverse() },
    series: [
      {
        type: "bar",
        data: top.map((f) => Number(f.selfTimeNs) / NS_PER_US).reverse(),
        itemStyle: { color: "#ee6666" },
      },
    ],
  };
}

function selfVsTotalOption(fns: FunctionStats[], topN = 12) {
  const top = [...fns]
    .sort((a, b) => Number(b.totalTimeNs - a.totalTimeNs))
    .slice(0, topN);
  return {
    title: { text: "self vs total（顶层 total 大多是子调用汇总）" },
    tooltip: { trigger: "axis" },
    legend: { data: ["self", "total"] },
    grid: { left: 220, right: 40 },
    xAxis: { type: "value", name: "µs" },
    yAxis: { type: "category", data: top.map((f) => f.name).reverse() },
    series: [
      {
        name: "self",
        type: "bar",
        data: top.map((f) => Number(f.selfTimeNs) / NS_PER_US).reverse(),
        itemStyle: { color: "#ee6666" },
      },
      {
        name: "total",
        type: "bar",
        data: top.map((f) => Number(f.totalTimeNs) / NS_PER_US).reverse(),
        itemStyle: { color: "#5470c6" },
      },
    ],
  };
}

function frameDurationOption(report: AnalysisReport | undefined) {
  const durations = report?.frames?.frameDurationsNs ?? [];
  return {
    title: { text: "每帧渲染耗时 (ms)" },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", name: "帧", data: durations.map((_, i) => i) },
    yAxis: { type: "value", name: "ms" },
    series: [
      { type: "line", smooth: true, data: durations.map((d) => Number(d) / NS_PER_MS) },
    ],
  };
}

export function Dashboard({ reportsById, intervalsById }: Props) {
  const ids = useMemo(() => [...reportsById.keys()].sort(), [reportsById]);
  const [selected, setSelected] = useState<string>(ids[0] ?? "");
  const [filterRaw, setFilterRaw] = useState("");

  const activeId = reportsById.has(selected) ? selected : ids[0] ?? "";
  const report = reportsById.get(activeId);
  const intervals = intervalsById.get(activeId) ?? [];

  const terms = useMemo(() => parseFilterTerms(filterRaw), [filterRaw]);

  // 需求 4：按关键词筛选函数（如 blur、finish）
  const filteredFns = useMemo(
    () => (report?.functions ?? []).filter((f) => matchFn(f.name, terms)),
    [report, terms],
  );
  const filteredIntervals = useMemo(
    () => (terms.length === 0 ? intervals : intervals.filter((iv) => matchFn(iv.name, terms))),
    [intervals, terms],
  );

  return (
    <div className="dashboard">
      <div className="dashboard-controls">
        <label>
          选择文件（单个 case）
          <select value={activeId} onChange={(e) => setSelected(e.target.value)}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label>
          只看函数（逗号/空格分隔，如 blur finish）
          <input
            value={filterRaw}
            onChange={(e) => setFilterRaw(e.target.value)}
            placeholder="blur, finish, vg_lite"
            style={{ minWidth: 220 }}
          />
        </label>
        {report?.frames && (
          <span className="dashboard-summary">
            渲染 {fmtFps(report.frames.avgRenderFps)} / 刷新率{" "}
            {fmtFps(report.frames.avgDisplayFps)}，共 {report.frames.frameCount} 帧
          </span>
        )}
      </div>

      <p className="dashboard-note">
        说明：带调用关系的 trace 中，顶层函数 total 天然最大（含全部子调用），排序无意义。
        下面以 <b>self（自身独占耗时）</b> 定位真正热点，并用火焰图/调用树展示时间去向。
        {terms.length > 0 && <b>（已筛选：{terms.join(" / ")}）</b>}
      </p>

      <div className="charts-grid">
        <ReactECharts option={selfHotspotOption(filteredFns)} style={{ height: 380 }} />
        <ReactECharts option={selfVsTotalOption(filteredFns)} style={{ height: 380 }} />
        <ReactECharts option={frameDurationOption(report)} style={{ height: 300 }} />
      </div>

      <div className="flame-wrap">
        <FlameChart intervals={terms.length > 0 ? filteredIntervals : intervals} />
      </div>

      <div className="tree-wrap">
        <CallTreeTable intervals={intervals} filterTerms={terms} />
      </div>
    </div>
  );
}
