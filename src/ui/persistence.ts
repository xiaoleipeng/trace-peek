import type { ClassificationState } from "../core/types";

const LS_KEY = "trace-analyzer:classification";

/**
 * 分类结果持久化到 localStorage（正则以 source+flags 序列化，避免 RegExp 丢失）。
 * 目录句柄的持久化（IndexedDB）仅在 Chromium 可用，此处提供接口占位。
 */
export function saveClassification(state: ClassificationState): void {
  try {
    const cfg = state.classifierConfig;
    const serializable = {
      entries: state.entries,
      categories: state.categories,
      groupBy: state.groupBy,
      classifierConfig: {
        delimiter: cfg.delimiter ?? "-",
        pattern: cfg.pattern
          ? { source: cfg.pattern.source, flags: cfg.pattern.flags }
          : null,
        groupBy: cfg.groupBy,
      },
    };
    localStorage.setItem(LS_KEY, JSON.stringify(serializable));
  } catch {
    // 隐私模式或配额限制：静默忽略
  }
}

export function loadClassification(): ClassificationState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    const cc = o.classifierConfig ?? {};
    const pattern = cc.pattern
      ? new RegExp(cc.pattern.source, cc.pattern.flags)
      : undefined;
    return {
      entries: o.entries,
      categories: o.categories,
      groupBy: o.groupBy,
      classifierConfig: {
        delimiter: cc.delimiter ?? "-",
        pattern,
        groupBy: cc.groupBy,
      },
    };
  } catch {
    return null;
  }
}

export function clearClassification(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

/* ---------------- 目录句柄持久化（IndexedDB，Chromium） ---------------- */

const DB_NAME = "trace-analyzer";
const STORE = "handles";
const HANDLE_KEY = "lastDir";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* 回退方案不支持句柄持久化 */
  }
}

export async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}
