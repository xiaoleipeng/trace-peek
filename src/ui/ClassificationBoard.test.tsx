import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClassificationBoard } from "./ClassificationBoard";
import { autoClassify, DEFAULT_CLASSIFIER_CONFIG } from "../core/classifier";
import type { FileEntry } from "../core/types";

const emptyDims = {
  scene: null,
  algo: null,
  downsample: null,
  matched: false,
  raw: "",
};

function makeState() {
  const entries: FileEntry[] = [
    { id: "a-exp-ds8.trace", name: "a-exp-ds8.trace", parsedDims: emptyDims },
    { id: "b-exp-dsauto.trace", name: "b-exp-dsauto.trace", parsedDims: emptyDims },
  ];
  return autoClassify(entries, DEFAULT_CLASSIFIER_CONFIG);
}

describe("ClassificationBoard", () => {
  it("渲染各分类列与文件 chip", () => {
    const state = makeState();
    render(<ClassificationBoard state={state} onChange={() => {}} />);
    expect(screen.getByText("a-exp-ds8.trace")).toBeInTheDocument();
    expect(screen.getByText("b-exp-dsauto.trace")).toBeInTheDocument();
    expect(screen.getByText(/未分类/)).toBeInTheDocument();
  });

  it("新建分组触发 onChange 且新增自定义分类", () => {
    const state = makeState();
    const onChange = vi.fn();
    render(<ClassificationBoard state={state} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("新建分组名"), {
      target: { value: "我的组" },
    });
    fireEvent.click(screen.getByText("新建分组"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.categories.some((c: { label: string }) => c.label === "我的组")).toBe(true);
  });
});
