import { useMemo, useState } from "react";
import type { Interval } from "../core/types";
import { buildCallTree, type CallTreeNode } from "../core/callTree";
import { fmtDuration } from "./format";

interface Props {
  intervals: Interval[];
  filterTerms?: string[]; // 命中的函数名关键词（子串，小写）
}

/** 保留命中节点及其祖先路径；无命中关键词时返回原树。 */
function filterTree(nodes: CallTreeNode[], terms: string[]): CallTreeNode[] {
  if (terms.length === 0) return nodes;
  const hit = (name: string) => terms.some((t) => name.toLowerCase().includes(t));
  const prune = (node: CallTreeNode): CallTreeNode | null => {
    const kids = node.children
      .map(prune)
      .filter((c): c is CallTreeNode => c !== null);
    if (hit(node.name) || kids.length > 0) {
      return { ...node, children: kids };
    }
    return null;
  };
  return nodes.map(prune).filter((c): c is CallTreeNode => c !== null);
}

function TreeRow({
  node,
  rootTotal,
  depth,
}: {
  node: CallTreeNode;
  rootTotal: number;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasKids = node.children.length > 0;
  const totalPct = rootTotal > 0 ? (Number(node.totalNs) / rootTotal) * 100 : 0;
  const selfPct = rootTotal > 0 ? (Number(node.selfNs) / rootTotal) * 100 : 0;
  return (
    <>
      <tr>
        <td>
          <span style={{ paddingLeft: depth * 16 }}>
            {hasKids ? (
              <button className="tree-toggle" onClick={() => setOpen((o) => !o)}>
                {open ? "▾" : "▸"}
              </button>
            ) : (
              <span className="tree-leaf">•</span>
            )}
            {node.name}
          </span>
        </td>
        <td>{node.count}</td>
        <td>{fmtDuration(node.totalNs)}</td>
        <td>{totalPct.toFixed(1)}%</td>
        <td className="self-col">{fmtDuration(node.selfNs)}</td>
        <td className="self-col">{selfPct.toFixed(1)}%</td>
      </tr>
      {open &&
        node.children.map((c, i) => (
          <TreeRow key={`${c.name}:${i}`} node={c} rootTotal={rootTotal} depth={depth + 1} />
        ))}
    </>
  );
}

/**
 * 调用树表：展示每个节点的 total / self / 占比 / 调用次数。
 * self 列高亮——那才是"该函数自己烧掉的时间"，用于定位热点。
 */
export function CallTreeTable({ intervals, filterTerms = [] }: Props) {
  const allRoots = useMemo(() => buildCallTree(intervals), [intervals]);
  const roots = useMemo(() => filterTree(allRoots, filterTerms), [allRoots, filterTerms]);
  // 占比基于全树 total，保证筛选后占比仍相对整体有意义
  const rootTotal = useMemo(
    () => allRoots.reduce((s, r) => s + Number(r.totalNs), 0),
    [allRoots],
  );

  return (
    <div className="calltree-table">
      <table>
        <thead>
          <tr>
            <th>调用树（按 total 降序）</th>
            <th>次数</th>
            <th>total</th>
            <th>total%</th>
            <th className="self-col">self</th>
            <th className="self-col">self%</th>
          </tr>
        </thead>
        <tbody>
          {roots.map((r, i) => (
            <TreeRow key={`${r.name}:${i}`} node={r} rootTotal={rootTotal} depth={0} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
