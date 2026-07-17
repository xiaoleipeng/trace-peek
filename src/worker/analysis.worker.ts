/// <reference lib="webworker" />
import { analyzeText } from "../core/analyzeFile";
import type { AnalysisReport, Interval } from "../core/types";

/** 主线程 → Worker 请求。 */
export interface ParseRequest {
  type: "parse";
  fileId: string;
  text: string;
  frameBoundary: string;
}

/** Worker → 主线程响应。bigint 无法结构化克隆，需序列化为字符串。 */
export type WorkerResponse =
  | { type: "parsed"; fileId: string; reportJson: string }
  | { type: "error"; fileId: string; message: string };

/** 把含 bigint 的报告序列化（bigint → 字符串）。 */
export function serializeReport(report: AnalysisReport, intervals: Interval[]): string {
  return JSON.stringify({ report, intervals }, (_k, v) =>
    typeof v === "bigint" ? { __bigint__: v.toString() } : v,
  );
}

self.onmessage = (e: MessageEvent<ParseRequest>) => {
  const msg = e.data;
  if (msg.type !== "parse") return;
  try {
    const { report, intervals } = analyzeText(msg.text, msg.fileId, msg.frameBoundary);
    const reportJson = serializeReport(report, intervals);
    const res: WorkerResponse = { type: "parsed", fileId: msg.fileId, reportJson };
    (self as unknown as Worker).postMessage(res);
  } catch (err) {
    const res: WorkerResponse = {
      type: "error",
      fileId: msg.fileId,
      message: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(res);
  }
};
