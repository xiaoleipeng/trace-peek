import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { Category, ClassificationState } from "../core/types";
import {
  moveFile,
  createCustomCategory,
  deleteCategory,
  renameCategory,
} from "./classificationState";

interface Props {
  state: ClassificationState;
  onChange: (next: ClassificationState) => void;
}

function FileChip({ fileId }: { fileId: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: fileId,
  });
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="file-chip"
      {...listeners}
      {...attributes}
      title={fileId}
    >
      {fileId}
    </div>
  );
}

function CategoryColumn({
  cat,
  onRename,
  onDelete,
}: {
  cat: Category;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cat.id });
  return (
    <div ref={setNodeRef} className={`category-col${isOver ? " over" : ""}`}>
      <div className="category-head">
        <span
          className="category-label"
          onDoubleClick={() => {
            const next = prompt("重命名分组", cat.label);
            if (next) onRename(cat.id, next);
          }}
        >
          {cat.label} ({cat.fileIds.length})
        </span>
        {cat.isCustom && (
          <button className="del" onClick={() => onDelete(cat.id)} title="删除分组">
            ×
          </button>
        )}
      </div>
      <div className="category-body">
        {cat.fileIds.map((fid) => (
          <FileChip key={fid} fileId={fid} />
        ))}
      </div>
    </div>
  );
}

export function ClassificationBoard({ state, onChange }: Props) {
  const [newLabel, setNewLabel] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const fileId = String(e.active.id);
    const toCat = e.over ? String(e.over.id) : null;
    if (toCat) onChange(moveFile(state, fileId, toCat));
  };

  return (
    <div className="classification-board">
      <div className="board-toolbar">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="新建分组名"
        />
        <button
          onClick={() => {
            if (newLabel.trim()) {
              onChange(createCustomCategory(state, newLabel.trim()));
              setNewLabel("");
            }
          }}
        >
          新建分组
        </button>
      </div>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="board-columns">
          {state.categories.map((cat) => (
            <CategoryColumn
              key={cat.id}
              cat={cat}
              onRename={(id, label) => onChange(renameCategory(state, id, label))}
              onDelete={(id) => onChange(deleteCategory(state, id))}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
