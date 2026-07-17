import type { Interval } from "./types";

/**
 * 聚合调用树节点。
 *
 * 关键点：带调用关系的 trace 里，顶层函数 total 天然最大（包含所有子调用），
 * 因此按 total 排序无意义。真正有意义的是：
 *  - selfNs：函数自身独占时间（total 减去直接子节点 total）——找热点叶子函数。
 *  - 调用树 / 火焰图：按父子关系展示"时间去向"。
 *
 * 本模块把同一调用路径下的多次调用**按 name 合并**为一个树节点，
 * 累加 totalNs / selfNs / count，得到"聚合调用树"（类似火焰图的数据源）。
 */
export interface CallTreeNode {
  name: string;
  totalNs: bigint; // 含子节点的总耗时（同路径多次调用累加）
  selfNs: bigint; // 自身独占耗时
  count: number; // 该路径下被调用次数
  depth: number;
  children: CallTreeNode[];
}

interface MutNode {
  name: string;
  totalNs: bigint;
  selfNs: bigint;
  count: number;
  depth: number;
  childrenByName: Map<string, MutNode>;
}

function newMut(name: string, depth: number): MutNode {
  return {
    name,
    totalNs: 0n,
    selfNs: 0n,
    count: 0,
    depth,
    childrenByName: new Map(),
  };
}

/**
 * 由 interval 列表构建聚合调用树（可能有多个顶层根）。
 *
 * 做法：
 *  1. 用 id→interval 建索引，用 parentId 关联出每个实例的直接子节点。
 *  2. 从各顶层实例(parentId==null)出发递归，把相同路径上的同名调用合并进树节点。
 *  3. 每个节点 selfNs = totalNs - Σ直接子节点 totalNs。
 */
export function buildCallTree(intervals: Interval[]): CallTreeNode[] {
  // 建立父 → 直接子实例映射
  const childrenOf = new Map<number, Interval[]>();
  const roots: Interval[] = [];
  for (const iv of intervals) {
    if (iv.parentId === null) {
      roots.push(iv);
    } else {
      let arr = childrenOf.get(iv.parentId);
      if (!arr) {
        arr = [];
        childrenOf.set(iv.parentId, arr);
      }
      arr.push(iv);
    }
  }

  const rootMuts = new Map<string, MutNode>();

  const mergeInstance = (iv: Interval, into: Map<string, MutNode>, depth: number) => {
    let node = into.get(iv.name);
    if (!node) {
      node = newMut(iv.name, depth);
      into.set(iv.name, node);
    }
    node.totalNs += iv.durationNs;
    node.count += 1;
    // self = 本实例 duration - 直接子实例 duration 之和
    const kids = childrenOf.get(iv.id) ?? [];
    let childSum = 0n;
    for (const k of kids) childSum += k.durationNs;
    let self = iv.durationNs - childSum;
    if (self < 0n) self = 0n;
    node.selfNs += self;
    for (const k of kids) mergeInstance(k, node.childrenByName, depth + 1);
  };

  for (const r of roots) mergeInstance(r, rootMuts, 0);

  const freeze = (m: MutNode): CallTreeNode => {
    const children = [...m.childrenByName.values()]
      .map(freeze)
      .sort((a, b) => Number(b.totalNs - a.totalNs));
    return {
      name: m.name,
      totalNs: m.totalNs,
      selfNs: m.selfNs,
      count: m.count,
      depth: m.depth,
      children,
    };
  };

  return [...rootMuts.values()]
    .map(freeze)
    .sort((a, b) => Number(b.totalNs - a.totalNs));
}

/**
 * 火焰图数据：把调用树摊平为带层级与横向偏移的矩形条。
 * x 轴按 totalNs 布局（子节点在父节点范围内），y 轴为深度。
 */
export interface FlameRect {
  name: string;
  depth: number;
  startNs: bigint; // 该矩形在火焰图上的起始偏移（纯布局用途，非真实时间戳）
  totalNs: bigint;
  selfNs: bigint;
  count: number;
}

export function flattenFlame(roots: CallTreeNode[]): FlameRect[] {
  const rects: FlameRect[] = [];
  const walk = (node: CallTreeNode, offsetNs: bigint) => {
    rects.push({
      name: node.name,
      depth: node.depth,
      startNs: offsetNs,
      totalNs: node.totalNs,
      selfNs: node.selfNs,
      count: node.count,
    });
    let childOffset = offsetNs;
    for (const c of node.children) {
      walk(c, childOffset);
      childOffset += c.totalNs;
    }
  };
  let rootOffset = 0n;
  for (const r of roots) {
    walk(r, rootOffset);
    rootOffset += r.totalNs;
  }
  return rects;
}
