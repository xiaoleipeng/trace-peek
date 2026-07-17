import type { Category, ClassificationState } from "../core/types";
import { UNCLASSIFIED_ID } from "../core/classifier";

/**
 * 纯状态迁移函数集合。所有函数返回新的 ClassificationState（不可变更新），
 * 保证不变式：
 *  - 每个 fileId 恰属于一个 Category（含未分类桶）；
 *  - categories 的 fileIds 并集覆盖全部 entries、两两不相交；
 *  - 拖拽只改变 fileIds 归属，不涉及解析缓存（ParsedCache 由外层持有、不在此变动）。
 */

function cloneCategories(cats: Category[]): Category[] {
  return cats.map((c) => ({ ...c, fileIds: [...c.fileIds] }));
}

/** 从所有分类中移除某 fileId。 */
function removeFileEverywhere(cats: Category[], fileId: string): void {
  for (const c of cats) {
    const idx = c.fileIds.indexOf(fileId);
    if (idx >= 0) c.fileIds.splice(idx, 1);
  }
}

/** 把文件移动到目标分类（先从原处移除，保证唯一归属）。 */
export function moveFile(
  state: ClassificationState,
  fileId: string,
  toCategoryId: string,
): ClassificationState {
  const categories = cloneCategories(state.categories);
  const target = categories.find((c) => c.id === toCategoryId);
  if (!target) return state;
  removeFileEverywhere(categories, fileId);
  if (!target.fileIds.includes(fileId)) target.fileIds.push(fileId);
  return { ...state, categories };
}

/** 把文件拖回未分类桶。 */
export function moveToUnclassified(
  state: ClassificationState,
  fileId: string,
): ClassificationState {
  return moveFile(state, fileId, UNCLASSIFIED_ID);
}

let customSeq = 0;

/** 新建自定义分组。 */
export function createCustomCategory(
  state: ClassificationState,
  label: string,
): ClassificationState {
  const id = `custom:${Date.now()}:${customSeq++}`;
  const cat: Category = { id, label, dims: {}, fileIds: [], isCustom: true };
  return { ...state, categories: [...cloneCategories(state.categories), cat] };
}

/** 重命名分组。 */
export function renameCategory(
  state: ClassificationState,
  categoryId: string,
  label: string,
): ClassificationState {
  const categories = cloneCategories(state.categories).map((c) =>
    c.id === categoryId ? { ...c, label } : c,
  );
  return { ...state, categories };
}

/**
 * 删除分组（其中文件回落到未分类桶，避免丢失，维持完备性）。
 * 未分类桶本身不可删除。
 */
export function deleteCategory(
  state: ClassificationState,
  categoryId: string,
): ClassificationState {
  const target = state.categories.find((c) => c.id === categoryId);
  if (!target || target.isUnclassified) return state;

  const categories = cloneCategories(state.categories);
  let unclassified = categories.find((c) => c.id === UNCLASSIFIED_ID);
  if (!unclassified) {
    unclassified = {
      id: UNCLASSIFIED_ID,
      label: "未分类",
      dims: {},
      fileIds: [],
      isUnclassified: true,
    };
    categories.push(unclassified);
  }
  const removed = categories.find((c) => c.id === categoryId)!;
  unclassified.fileIds.push(...removed.fileIds);
  return {
    ...state,
    categories: categories.filter((c) => c.id !== categoryId),
  };
}

/** 校验划分完备性（供测试与运行期断言）。 */
export function checkPartition(state: ClassificationState): {
  complete: boolean;
  disjoint: boolean;
} {
  const allIds = Object.keys(state.entries).sort();
  const seen = new Set<string>();
  let disjoint = true;
  for (const c of state.categories) {
    for (const fid of c.fileIds) {
      if (seen.has(fid)) disjoint = false;
      seen.add(fid);
    }
  }
  const covered = [...seen].sort();
  const complete =
    covered.length === allIds.length &&
    covered.every((v, i) => v === allIds[i]);
  return { complete, disjoint };
}
