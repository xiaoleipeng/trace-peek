import type { AnalysisReport, Interval, TraceEvent } from "./types";
import { DEFAULT_FRAME_BOUNDARY } from "./types";
import { parseLine, isHeaderOrBlank } from "./parseLine";
import { buildIntervals, newDiagnostics } from "./buildIntervals";
import { aggregate } from "./aggregate";
import { analyzeFrames } from "./analyzeFrames";

export interface AnalyzeFileResult {
  report: AnalysisReport;
  intervals: Interval[]; // 保留供 drilldown 逐次调用使用
}

/**
 * 单文件端到端分析：逐行解析 → 栈状态机配对 → 聚合 → 帧分析。
 * 空文件 / 全头部文件产出空报告（不影响其他文件）。
 */
export function analyzeText(
  text: string,
  source: string,
  frameBoundary: string = DEFAULT_FRAME_BOUNDARY,
): AnalyzeFileResult {
  const diag = newDiagnostics();
  const events: TraceEvent[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 忽略 split 产生的末尾空串
    if (i === lines.length - 1 && line === "") continue;
    diag.totalLines += 1;
    if (isHeaderOrBlank(line)) {
      diag.skippedHeaderLines += 1;
      continue;
    }
    const ev = parseLine(line, i + 1);
    if (ev === null) {
      diag.malformedLines.push(i + 1);
      continue;
    }
    diag.parsedEvents += 1;
    events.push(ev);
  }

  const result = buildIntervals(events, diag);
  const report = aggregate(result, { source });
  report.frames = analyzeFrames(result, frameBoundary);
  return { report, intervals: result.intervals };
}
