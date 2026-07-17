import type { FrameReport, Interval, ParseResult } from "./types";
import { DEFAULT_FRAME_BOUNDARY } from "./types";
import { maxBig, meanNumber, percentileSorted, NS_PER_MS, NS_PER_SEC } from "./stats";

/**
 * 从已配对的帧边界区间推导每帧耗时与两种帧率。
 *
 * "帧" = name == boundaryEvent 且已成功配对的 Interval。
 * 未配对的边界帧（开头悬空 E / EOF 未闭合 B）不会出现在 intervals 中，
 * 因此天然被排除，不重复计数（正确性属性 16）。
 *
 * 两种帧率（属性 17）：
 *  - avgRenderFps  = 1e9 / mean(frameDurationsNs)          渲染耗时视角
 *  - avgDisplayFps = 1e9 / mean(相邻 frameStartsNs 间隔)   实际刷新率视角；帧数<2 时 null
 */
export function analyzeFrames(
  result: ParseResult,
  boundaryEvent: string = DEFAULT_FRAME_BOUNDARY,
): FrameReport {
  const frames: Interval[] = result.intervals
    .filter((i) => i.name === boundaryEvent)
    .sort((a, b) => Number(a.startNs - b.startNs));

  const frameDurationsNs = frames.map((f) => f.durationNs);
  const frameStartsNs = frames.map((f) => f.startNs);
  const frameCount = frames.length;

  const durationsMs = frameDurationsNs.map((d) => Number(d) / NS_PER_MS);
  const sortedMs = [...durationsMs].sort((a, b) => a - b);
  const avgFrameMs = meanNumber(durationsMs);
  const p90FrameMs = percentileSorted(sortedMs, 90);
  const maxFrameMs =
    frameCount > 0 ? Number(maxBig(frameDurationsNs)) / NS_PER_MS : 0;

  // 渲染耗时视角 FPS
  const avgDurationNs =
    frameCount > 0 ? meanNumber(frameDurationsNs.map(Number)) : 0;
  const avgRenderFps = avgDurationNs > 0 ? NS_PER_SEC / avgDurationNs : 0;

  // 实际刷新率视角 FPS：相邻帧起点间隔
  let avgDisplayFps: number | null = null;
  if (frameCount >= 2) {
    const periods: number[] = [];
    for (let i = 1; i < frameStartsNs.length; i++) {
      periods.push(Number(frameStartsNs[i] - frameStartsNs[i - 1]));
    }
    const meanPeriod = meanNumber(periods);
    avgDisplayFps = meanPeriod > 0 ? NS_PER_SEC / meanPeriod : null;
  }

  return {
    boundaryEvent,
    frameCount,
    frameDurationsNs,
    frameStartsNs,
    avgFrameMs,
    p90FrameMs,
    maxFrameMs,
    avgRenderFps,
    avgDisplayFps,
  };
}
