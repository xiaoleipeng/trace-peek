import type { AnalysisReport, Interval } from "../core/types";

/** 反序列化 Worker 返回的 JSON（还原 bigint）。 */
export function reviveReport(json: string): {
  report: AnalysisReport;
  intervals: Interval[];
} {
  return JSON.parse(json, (_k, v) => {
    if (v && typeof v === "object" && "__bigint__" in v) {
      return BigInt((v as { __bigint__: string }).__bigint__);
    }
    return v;
  });
}
