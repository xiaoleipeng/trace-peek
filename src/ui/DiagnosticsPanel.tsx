import type { AnalysisReport } from "../core/types";

interface Props {
  reportsById: Map<string, AnalysisReport>;
}

/** 每文件的解析期结构异常计数；异常偏高的文件用颜色标注。 */
export function DiagnosticsPanel({ reportsById }: Props) {
  const rows = [...reportsById.entries()];
  return (
    <div className="diagnostics-panel">
      <h3>解析诊断</h3>
      <table>
        <thead>
          <tr>
            <th>文件</th>
            <th>事件数</th>
            <th>danglingBegin</th>
            <th>danglingEnd</th>
            <th>mismatched</th>
            <th>malformed</th>
            <th>negative</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([id, r]) => {
            const d = r.diagnostics;
            const high =
              d.mismatchedNames > 0 ||
              d.malformedLines.length > 5 ||
              d.negativeDurations > 0;
            return (
              <tr key={id} className={high ? "row-warn" : ""}>
                <td title={id}>{id}</td>
                <td>{r.totalEvents}</td>
                <td>{d.danglingBegin}</td>
                <td>{d.danglingEnd}</td>
                <td className={d.mismatchedNames > 0 ? "cell-warn" : ""}>
                  {d.mismatchedNames}
                </td>
                <td className={d.malformedLines.length > 5 ? "cell-warn" : ""}>
                  {d.malformedLines.length}
                </td>
                <td className={d.negativeDurations > 0 ? "cell-warn" : ""}>
                  {d.negativeDurations}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
