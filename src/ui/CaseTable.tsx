import type { CaseMetrics } from "../core/caseAnalysis";
import { fmtNumber } from "./format";

interface Props {
  cases: CaseMetrics[];
}

/**
 * 每文件（每个测试 case）一行的独立指标表。指标各自独立，绝不跨文件平均。
 */
export function CaseTable({ cases }: Props) {
  return (
    <div className="case-table">
      <h3>逐文件指标（每个 .trace = 一个独立测试 case）</h3>
      <table>
        <thead>
          <tr>
            <th>文件</th>
            <th>场景</th>
            <th>算法</th>
            <th>采样率</th>
            <th>帧数(有效/原始)</th>
            <th>渲染FPS</th>
            <th>刷新率FPS</th>
            <th>平均帧(ms)</th>
            <th>P90帧(ms)</th>
            <th>最大帧(ms)</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.fileId}>
              <td title={c.fileId}>{c.fileId}</td>
              <td>{c.dims.scene ?? "—"}</td>
              <td>{c.dims.algo ?? "—"}</td>
              <td>{c.dims.downsample ?? "—"}</td>
              <td title={c.removedFrameCount > 0 ? `剔除 ${c.removedFrameCount} 个超大帧` : ""}>
                {c.frameCount}/{c.rawFrameCount}
                {c.removedFrameCount > 0 && (
                  <span className="removed-badge"> -{c.removedFrameCount}</span>
                )}
              </td>
              <td>{fmtNumber(c.avgRenderFps, 1)}</td>
              <td>{c.avgDisplayFps === null ? "—" : fmtNumber(c.avgDisplayFps, 1)}</td>
              <td>{fmtNumber(c.avgFrameMs, 3)}</td>
              <td>{fmtNumber(c.p90FrameMs, 3)}</td>
              <td>{fmtNumber(c.maxFrameMs, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
