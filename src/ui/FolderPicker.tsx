import { useRef, useState } from "react";
import type { UiFileEntry } from "./types";

interface FolderPickerProps {
  onFilesSelected: (entries: UiFileEntry[], dirHandle?: FileSystemDirectoryHandle) => void;
  accept?: string; // 默认 ".trace"
}

interface LoadProgress {
  files: number;
  bytes: number;
}

const emptyDims = {
  scene: null,
  algo: null,
  downsample: null,
  matched: false,
  raw: "",
};

// File System Access API 的最小类型声明（Chromium 专有）。
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: {
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export function FolderPicker({ onFilesSelected, accept = ".trace" }: FolderPickerProps) {
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const supportsFSA = typeof window !== "undefined" && !!window.showDirectoryPicker;

  const buildEntry = (name: string, extra: Partial<UiFileEntry>): UiFileEntry => ({
    id: name,
    name,
    parsedDims: emptyDims,
    ...extra,
  });

  const pickViaFSA = async () => {
    if (!window.showDirectoryPicker) return;
    try {
      const dir = await window.showDirectoryPicker({ mode: "read" });
      const entries: UiFileEntry[] = [];
      let files = 0;
      let bytes = 0;
      setProgress({ files: 0, bytes: 0 });
      // @ts-expect-error values() 为异步迭代器
      for await (const handle of dir.values()) {
        if (handle.kind !== "file") continue;
        if (!handle.name.endsWith(accept)) continue;
        const file = await (handle as FileSystemFileHandle).getFile();
        files += 1;
        bytes += file.size;
        setProgress({ files, bytes });
        entries.push(
          buildEntry(handle.name, { handle: handle as FileSystemFileHandle, file }),
        );
      }
      setProgress(null);
      onFilesSelected(entries, dir);
    } catch (err) {
      // 用户取消或权限问题：静默复位
      setProgress(null);
      // eslint-disable-next-line no-console
      console.warn("目录选择取消/失败", err);
    }
  };

  const pickViaInput = (fileList: FileList | null) => {
    if (!fileList) return;
    const entries: UiFileEntry[] = [];
    let files = 0;
    let bytes = 0;
    for (const file of Array.from(fileList)) {
      if (!file.name.endsWith(accept)) continue;
      files += 1;
      bytes += file.size;
      entries.push(buildEntry(file.name, { file }));
    }
    setProgress({ files, bytes });
    setProgress(null);
    onFilesSelected(entries);
  };

  return (
    <div className="folder-picker">
      {supportsFSA ? (
        <button onClick={pickViaFSA}>选择文件夹</button>
      ) : (
        <>
          <button onClick={() => { setUsingFallback(true); inputRef.current?.click(); }}>
            选择文件夹
          </button>
          <input
            ref={inputRef}
            type="file"
            // @ts-expect-error 非标准属性
            webkitdirectory=""
            directory=""
            multiple
            style={{ display: "none" }}
            onChange={(e) => pickViaInput(e.target.files)}
          />
        </>
      )}
      {(usingFallback || !supportsFSA) && (
        <p className="hint">
          当前浏览器使用兼容模式读取文件夹：无法持久化目录句柄，下次需重新选择文件夹。
        </p>
      )}
      {progress && (
        <p className="progress">
          已读取 {progress.files} 个文件（{(progress.bytes / 1024 / 1024).toFixed(1)} MB）…
        </p>
      )}
    </div>
  );
}
