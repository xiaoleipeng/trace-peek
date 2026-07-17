/**
 * 用户提供的模式（通配符、正则）一律视为不可信输入，做安全处理：
 * 绝不 eval，非法输入不抛出未捕获异常。
 */

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

/** 转义正则元字符。 */
export function escapeRegExp(s: string): string {
  return s.replace(REGEX_META, "\\$&");
}

/**
 * 把通配符模式安全转换为锚定正则：
 * 先转义所有正则元字符，再把（原始的）`*` 映射为 `.*`，最后首尾锚定。
 * 例："lv_draw_*" -> /^lv_draw_.*$/
 * 正确性属性 19。
 */
export function wildcardToRegExp(pattern: string): RegExp {
  // 按 `*` 切分，对每一段单独转义，段间用 `.*` 连接，最后首尾锚定。
  // 这样 `*` 不会被转义，其余元字符全部被转义。
  const body = pattern
    .split("*")
    .map((seg) => escapeRegExp(seg))
    .join(".*");
  return new RegExp(`^${body}$`);
}

export type CompileResult =
  | { ok: true; re: RegExp }
  | { ok: false; error: string };

/**
 * 安全编译用户自定义正则：非法时返回校验错误而非抛异常（属性 20）。
 */
export function compileUserRegExp(src: string): CompileResult {
  try {
    const re = new RegExp(src);
    return { ok: true, re };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
