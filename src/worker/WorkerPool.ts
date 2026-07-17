import type { AnalysisReport, Interval } from "../core/types";
import { analyzeText } from "../core/analyzeFile";
import type { ParseRequest, WorkerResponse } from "./analysis.worker";
import { reviveReport } from "./serde";

export interface ParsedEntry {
  report: AnalysisReport;
  intervals: Interval[];
}

/** 解析缓存：fileId → 解析结果（每文件只解析一次）。 */
export type ParsedCache = Map<string, ParsedEntry>;

export interface FileInput {
  fileId: string;
  text: string;
}

export type ProgressCb = (done: number, total: number) => void;

/**
 * Web Worker 池：并行解析文件，每文件只解析一次，结果写入返回的 Map。
 * Worker 数量上限为 navigator.hardwareConcurrency。
 *
 * 若运行环境不支持 Worker（如测试 / Node），自动回退到主线程同步解析，
 * 保证行为一致、便于测试。
 */
export class WorkerPool {
  private readonly size: number;

  constructor(size?: number) {
    const hw =
      typeof navigator !== "undefined" && navigator.hardwareConcurrency
        ? navigator.hardwareConcurrency
        : 4;
    this.size = Math.max(1, size ?? hw);
  }

  private supportsWorker(): boolean {
    return typeof Worker !== "undefined" && typeof URL !== "undefined";
  }

  async parseAll(
    files: FileInput[],
    frameBoundary: string,
    onProgress?: ProgressCb,
  ): Promise<ParsedCache> {
    const cache: ParsedCache = new Map();
    const total = files.length;
    let done = 0;

    if (!this.supportsWorker()) {
      // 主线程回退
      for (const f of files) {
        const { report, intervals } = analyzeText(f.text, f.fileId, frameBoundary);
        cache.set(f.fileId, { report, intervals });
        onProgress?.(++done, total);
      }
      return cache;
    }

    // 并行调度：维护 size 个 Worker，做任务分发与背压。
    let cursor = 0;
    const workers: Worker[] = [];
    const spawn = () =>
      new Worker(new URL("./analysis.worker.ts", import.meta.url), {
        type: "module",
      });

    await new Promise<void>((resolve, reject) => {
      const launch = (w: Worker) => {
        if (cursor >= files.length) {
          w.terminate();
          if (done >= total) resolve();
          return;
        }
        const f = files[cursor++];
        const req: ParseRequest = {
          type: "parse",
          fileId: f.fileId,
          text: f.text,
          frameBoundary,
        };
        w.postMessage(req);
      };

      const onMsg = (w: Worker) => (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.type === "parsed") {
          cache.set(msg.fileId, reviveReport(msg.reportJson));
        } else {
          // 出错：记录但不中断整体（该文件缺失结果）
          // eslint-disable-next-line no-console
          console.error(`解析失败 ${msg.fileId}: ${msg.message}`);
        }
        onProgress?.(++done, total);
        launch(w);
      };

      const n = Math.min(this.size, Math.max(1, files.length));
      for (let i = 0; i < n; i++) {
        const w = spawn();
        w.onmessage = onMsg(w);
        w.onerror = (err) => reject(err);
        workers.push(w);
        launch(w);
      }

      if (files.length === 0) resolve();
    });

    return cache;
  }
}
