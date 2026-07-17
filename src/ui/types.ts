import type { FileEntry } from "../core/types";

/** UI 层扩展的文件条目：附带浏览器句柄 / File 对象与原始文本。 */
export interface UiFileEntry extends FileEntry {
  handle?: FileSystemFileHandle;
  file?: File;
}

/** 应用运行状态机。 */
export type AppPhase =
  | "Idle"
  | "Loading"
  | "AutoClassified"
  | "Parsing"
  | "Reviewing"
  | "Analyzing"
  | "Exported";
