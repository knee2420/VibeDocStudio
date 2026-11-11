import React, { useEffect, useMemo, useState } from "react";
import { FileText, FolderInput, Search, X } from "lucide-react";

import { documentApi, type DocumentSummary } from "@/entities/vdoc-document";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";
import { errorMessage as toMessage } from "@/shared/lib";

import { documentLifecycle } from "../model/documentLifecycle";

export interface DocumentImportDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 문서 불러오기 — 서버에 있는 문서 전부를 보여 주고, 고른 문서를 열어 이 프로젝트에 넣는다.
 * 이 프로젝트에 이미 있는 문서는 "열기", 다른 곳에서 생긴 문서(PDF · .vdoc 가져오기 · 다른 프로젝트)는 "불러오기".
 */
export const DocumentImportDialog: React.FC<DocumentImportDialogProps> = ({ open, onClose }) => {
  const [items, setItems] = useState<DocumentSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const projectDocIds = useProjectStore((s) => selectActiveProject(s)?.docIds ?? []);

  useEffect(() => {
    if (!open) return;
    setItems(null);
    setError(null);
    documentApi
      .list()
      .then((list) => setItems([...list].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))))
      .catch((err) => setError(toMessage(err, "문서 목록을 받지 못했습니다.")));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((d) => !q || d.title.toLowerCase().includes(q) || d.docId.toLowerCase().includes(q));
  }, [items, query]);

  if (!open) return null;

  const pick = async (docId: string) => {
    setBusyId(docId);
    try {
      await documentLifecycle().importDocument(docId);
      onClose();
    } catch (err) {
      setError(toMessage(err, "문서를 불러오지 못했습니다."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/30" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="문서 불러오기"
        data-testid="document-import-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[560px] max-h-[70vh] flex flex-col rounded-xl bg-white shadow-2xl border border-slate-200"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <FolderInput className="w-4 h-4 text-emerald-600" />
            문서 불러오기
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400" title="닫기 (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-2 border-b border-slate-100">
          <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목 · id 로 찾기"
              className="flex-1 text-xs outline-none"
            />
          </div>
        </div>
        {error && <div className="mx-4 mt-2 rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{error}</div>}
        <div className="flex-1 overflow-y-auto py-1">
          {items === null && !error && <div className="px-4 py-6 text-center text-xs text-slate-400">불러오는 중…</div>}
          {items !== null && visible.length === 0 && <div className="px-4 py-6 text-center text-xs text-slate-400">문서가 없습니다.</div>}
          {visible.map((d) => {
            const inProject = projectDocIds.includes(d.docId);
            return (
              <button
                key={d.docId}
                type="button"
                data-testid={`import-doc-${d.docId}`}
                disabled={busyId !== null}
                onClick={() => void pick(d.docId)}
                className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 disabled:opacity-60"
              >
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-slate-800">{d.title || d.docId}</div>
                  <div className="truncate text-[10.5px] text-slate-400">
                    {d.docId} · {d.pageCount}쪽 · {(d.updatedAt || "").slice(0, 16).replace("T", " ")}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    inProject ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  }`}
                >
                  {busyId === d.docId ? "여는 중…" : inProject ? "열기" : "불러오기"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
