import { useMemo, useState } from "react";
import type { ClassifierConfig, GroupDimension } from "../core/types";
import { previewParse } from "../core/classifier";
import { compileUserRegExp } from "../core/patterns";

interface Props {
  fileNames: string[];
  groupBy: GroupDimension;
  /** 应用新规则时回调（已校验），传出可直接用于 autoClassify 的配置。 */
  onApply: (cfg: ClassifierConfig) => void;
}

/**
 * 自定义分类规则配置：
 *  - 简单模式：指定分隔符，从右取两段作为 algo / downsample，其余为 scene。
 *  - 高级模式：填带命名分组 (?<scene>)(?<algo>)(?<downsample>) 的正则。
 * 实时预览每个文件解析成什么；非法正则安全兜底不崩溃。
 */
export function ClassifierConfigPanel({ fileNames, groupBy, onApply }: Props) {
  const [mode, setMode] = useState<"delimiter" | "regex">("delimiter");
  const [delimiter, setDelimiter] = useState("-");
  const [regexSrc, setRegexSrc] = useState(
    "^(?<scene>.+)-(?<algo>[^-]+)-(?<downsample>[^-]+)$",
  );

  // 校验正则
  const regexResult = useMemo(() => compileUserRegExp(regexSrc), [regexSrc]);
  const regexValid = mode === "delimiter" || regexResult.ok;

  // 构建当前配置
  const cfg: ClassifierConfig | null = useMemo(() => {
    if (mode === "delimiter") {
      if (!delimiter) return null;
      return { delimiter, groupBy: [groupBy] };
    }
    if (!regexResult.ok) return null;
    return { pattern: regexResult.re, groupBy: [groupBy] };
  }, [mode, delimiter, regexResult, groupBy]);

  // 预览（取前 12 个文件）
  const preview = useMemo(() => {
    if (!cfg) return [];
    return previewParse(fileNames.slice(0, 12), cfg);
  }, [cfg, fileNames]);

  const matchedCount = useMemo(() => {
    if (!cfg) return 0;
    return previewParse(fileNames, cfg).filter((p) => p.dims.matched).length;
  }, [cfg, fileNames]);

  return (
    <details className="classifier-config">
      <summary>自定义分类规则（文件名不是 xxx-algo-dsxx 时点此调整）</summary>

      <div className="cc-modes">
        <label>
          <input
            type="radio"
            checked={mode === "delimiter"}
            onChange={() => setMode("delimiter")}
          />
          分隔符模式
        </label>
        {mode === "delimiter" && (
          <input
            value={delimiter}
            onChange={(e) => setDelimiter(e.target.value)}
            style={{ width: 60 }}
            placeholder="-"
          />
        )}
        <label>
          <input type="radio" checked={mode === "regex"} onChange={() => setMode("regex")} />
          正则模式（命名分组 scene/algo/downsample）
        </label>
      </div>

      {mode === "regex" && (
        <div className="cc-regex">
          <input
            value={regexSrc}
            onChange={(e) => setRegexSrc(e.target.value)}
            style={{ width: "100%", fontFamily: "monospace" }}
          />
          {!regexResult.ok && (
            <p className="error">正则非法：{regexResult.error}</p>
          )}
        </div>
      )}

      <div className="cc-preview">
        <div className="cc-preview-head">
          预览（前 {preview.length} 个）· 可匹配 {matchedCount}/{fileNames.length}
        </div>
        <table>
          <thead>
            <tr>
              <th>文件</th>
              <th>scene</th>
              <th>algo</th>
              <th>downsample</th>
              <th>匹配</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((p) => (
              <tr key={p.name} className={p.dims.matched ? "" : "row-warn"}>
                <td title={p.name}>{p.name}</td>
                <td>{p.dims.scene ?? "—"}</td>
                <td>{p.dims.algo ?? "—"}</td>
                <td>{p.dims.downsample ?? "—"}</td>
                <td className={p.dims.matched ? "" : "cell-warn"}>
                  {p.dims.matched ? "✓" : "未匹配"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        disabled={!regexValid || !cfg}
        onClick={() => cfg && onApply(cfg)}
      >
        应用该规则重新分类
      </button>
    </details>
  );
}
