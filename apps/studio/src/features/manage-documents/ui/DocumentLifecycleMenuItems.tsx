import React, { useState } from "react";
import { Copy, PencilLine, Trash2 } from "lucide-react";

import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { errorMessage as toMessage } from "@/shared/lib";
import { PagedDocumentIcon, ScrollDocumentIcon } from "@/shared/ui";

import { documentLifecycle } from "../model/documentLifecycle";

export interface DocumentLifecycleMenuItemsProps {
  onActionDone?: () => void;
}

const itemClass =
  "w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800 flex items-center justify-between text-slate-200 cursor-pointer transition";

/** 파일 메뉴의 문서 생애 항목 — 새 문서(A4 · 블로그) · 이름 바꾸기 · 복제 · 삭제. */
export const DocumentLifecycleMenuItems: React.FC<DocumentLifecycleMenuItemsProps> = ({ onActionDone }) => {
  const [error, setError] = useState<string | null>(null);
  const activeTitle = useStudioDocumentStore((s) => selectActiveDocument(s)?.title ?? "");
  const { createDocument, renameActiveDocument, duplicateActiveDocument, deleteActiveDocument } = documentLifecycle();

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    try {
      await action();
      onActionDone?.();
    } catch (err) {
      setError(toMessage(err, fallback));
    }
  };

  const create = (surface: "paged" | "scroll") => {
    const title = window.prompt(surface === "scroll" ? "새 블로그 글 제목" : "새 문서 제목", surface === "scroll" ? "새 글" : "새 문서");
    if (title === null) return;
    void run(() => createDocument({ title: title.trim() || "새 문서", surface }), "문서를 만들지 못했습니다.");
  };

  return (
    <div className="flex flex-col space-y-0.5">
      {error && (
        <div
          role="alert"
          onClick={() => setError(null)}
          className="mx-1 my-0.5 px-2 py-1 rounded bg-rose-950/80 text-rose-300 border border-rose-800 text-[11px] cursor-pointer"
        >
          {error}
        </div>
      )}
      <button type="button" data-testid="file-menu-new-doc-btn" className={itemClass} onClick={() => create("paged")}>
        <span className="flex items-center gap-2">
          <PagedDocumentIcon className="w-3.5 h-3.5 text-sky-400" />새 문서 (A4)
        </span>
      </button>
      <button type="button" data-testid="file-menu-new-blog-btn" className={itemClass} onClick={() => create("scroll")}>
        <span className="flex items-center gap-2">
          <ScrollDocumentIcon className="w-3.5 h-3.5 text-emerald-400" />새 블로그 글 (이음매 없는 한 단)
        </span>
      </button>
      <button
        type="button"
        data-testid="file-menu-rename-doc-btn"
        className={itemClass}
        disabled={!activeTitle}
        onClick={() => {
          const title = window.prompt("문서 이름", activeTitle);
          if (title?.trim()) void run(() => renameActiveDocument(title), "이름을 바꾸지 못했습니다.");
        }}
      >
        <span className="flex items-center gap-2">
          <PencilLine className="w-3.5 h-3.5 text-sky-400" />이름 바꾸기
        </span>
      </button>
      <button
        type="button"
        data-testid="file-menu-duplicate-doc-btn"
        className={itemClass}
        disabled={!activeTitle}
        onClick={() => void run(duplicateActiveDocument, "복제하지 못했습니다.")}
      >
        <span className="flex items-center gap-2">
          <Copy className="w-3.5 h-3.5 text-sky-400" />복제
        </span>
      </button>
      <button
        type="button"
        data-testid="file-menu-delete-doc-btn"
        className={itemClass}
        disabled={!activeTitle}
        onClick={() => {
          if (window.confirm(`「${activeTitle}」 문서를 지웁니다. 되돌릴 수 없습니다.`)) {
            void run(deleteActiveDocument, "지우지 못했습니다.");
          }
        }}
      >
        <span className="flex items-center gap-2 text-rose-300">
          <Trash2 className="w-3.5 h-3.5" />문서 삭제
        </span>
      </button>
    </div>
  );
};
