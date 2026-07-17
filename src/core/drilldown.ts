import type {
  AnalysisReport,
  CallDetail,
  FunctionSelector,
  FunctionStats,
  Interval,
} from "./types";
import { wildcardToRegExp } from "./patterns";

/**
 * 按选择器筛选函数统计（exact / wildcard / multi）。
 * 通配符经 wildcardToRegExp 安全转换为锚定正则。
 */
export function selectFunctions(
  reports: AnalysisReport[],
  sel: FunctionSelector,
): FunctionStats[] {
  const all = reports.flatMap((r) => r.functions);

  let predicate: (name: string) => boolean;
  switch (sel.mode) {
    case "exact": {
      const q = String(sel.query);
      predicate = (name) => name === q;
      break;
    }
    case "wildcard": {
      const re = wildcardToRegExp(String(sel.query));
      predicate = (name) => re.test(name);
      break;
    }
    case "multi": {
      const set = new Set(
        Array.isArray(sel.query) ? sel.query : [sel.query],
      );
      predicate = (name) => set.has(name);
      break;
    }
    default:
      predicate = () => false;
  }

  return all.filter((f) => predicate(f.name));
}

/**
 * 把某函数的每一次调用列出（含所属帧序号）。
 *
 * frameIndex 归属（属性 21）：调用 c 归属第 k 帧，当且仅当
 * c.startNs ∈ [frame_k.startNs, frame_k.endNs)；不落入任何帧边界区间则 null。
 *
 * 注：AnalysisReport 只保留聚合 FunctionStats，逐次调用需要 intervals。
 * 因此本函数要求调用方提供 intervalsById（fileId -> intervals）。
 */
export function listCalls(
  intervalsById: Map<string, Interval[]>,
  name: string,
  frameBoundary: string,
): CallDetail[] {
  const out: CallDetail[] = [];

  for (const [fileId, intervals] of intervalsById) {
    // 该文件的帧边界区间，按 startNs 升序，供二分归属。
    const frames = intervals
      .filter((i) => i.name === frameBoundary)
      .sort((a, b) => Number(a.startNs - b.startNs));

    const attribute = (startNs: bigint): number | null => {
      // 线性/二分查找 startNs 落入哪个 [start,end)
      let lo = 0;
      let hi = frames.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const f = frames[mid];
        if (startNs < f.startNs) hi = mid - 1;
        else if (startNs >= f.endNs) lo = mid + 1;
        else return mid;
      }
      return null;
    };

    for (const iv of intervals) {
      if (iv.name !== name) continue;
      out.push({
        fileId,
        frameIndex: attribute(iv.startNs),
        startNs: iv.startNs,
        durationNs: iv.durationNs,
      });
    }
  }

  return out;
}
