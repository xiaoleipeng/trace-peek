import { useMemo, useState } from "react";
import type { AnalysisReport, FunctionSelector, Interval } from "../core/types";
import { selectFunctions, listCalls } from "../core/drilldown";
import { DEFAULT_FRAME_BOUNDARY } from "../core/types";
import { fmtDuration } from "./format";

interface Props {
  reports: AnalysisReport[];
  intervalsById: Map<string, Interval[]>;
  frameBoundary?: string;
}

/** 指定函数下钻：函数表（exact/wildcard/multi）+ 逐次调用明细。 */
export function FunctionDrilldown({
  reports,
  intervalsById,
  frameBoundary = DEFAULT_FRAME_BOUNDARY,
}: Props) {
  const [mode, setMode] = useState<FunctionSelector["mode"]>("wildcard");
  const [query, setQuery] = useState("");
  const [detailName, setDetailName] = useState<string | null>(null);

  const matched = useMemo(() => {
    if (!query.trim()) return [];
    const sel: FunctionSelector =
      mode === "multi"
        ? { mode, query: query.split(",").map((s) => s.trim()).filter(Boolean) }
        : { mode, query: query.trim() };
    // 合并同名函数（跨文件）用于展示
    const raw = selectFunctions(reports, sel);
    const byName = new Map<string, { name: string; count: number; self: bigint }>();
    for (const f of raw) {
      const e = byName.get(f.name) ?? { name: f.name, count: 0, self: 0n };
      e.count += f.count;
      e.self += f.selfTimeNs;
      byName.set(f.name, e);
    }
    return [...byName.values()].sort((a, b) => Number(b.self - a.self));
  }, [reports, mode, query]);

  const calls = useMemo(() => {
    if (!detailName) return [];
    return listCalls(intervalsById, detailName, frameBoundary).sort(
      (a, b) => Number(b.durationNs - a.durationNs),
    );
  }, [detailName, intervalsById, frameBoundary]);

  return (
    <div className="function-drilldown">
      <h3>指定函数统计</h3>
      <div className="drilldown-controls">
        <select value={mode} onChange={(e) => setMode(e.target.value as FunctionSelector["mode"])}>
          <option value="exact">精确</option>
          <option value="wildcard">通配符</option>
          <option value="multi">多选(逗号分隔)</option>
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={mode === "wildcard" ? "如 lv_draw_*" : "函数名"}
        />
      </div>

      <table>
        <thead>
          <tr>
            <th>函数</th>
            <th>调用次数</th>
            <th>self 合计</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {matched.map((f) => (
            <tr key={f.name}>
              <td>{f.name}</td>
              <td>{f.count}</td>
              <td>{fmtDuration(f.self)}</td>
              <td>
                <button onClick={() => setDetailName(f.name)}>明细</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {detailName && (
        <div className="call-detail">
          <h4>{detailName} 逐次调用（按耗时降序，前 200）</h4>
          <table>
            <thead>
              <tr>
                <th>文件</th>
                <th>帧</th>
                <th>起点(ns)</th>
                <th>耗时</th>
              </tr>
            </thead>
            <tbody>
              {calls.slice(0, 200).map((c, i) => (
                <tr key={i}>
                  <td title={c.fileId}>{c.fileId}</td>
                  <td>{c.frameIndex === null ? "空闲" : c.frameIndex}</td>
                  <td>{c.startNs.toString()}</td>
                  <td>{fmtDuration(c.durationNs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
