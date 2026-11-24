import React, { useState } from "react";
import { Check, FlaskConical, Trash2 } from "lucide-react";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { playgroundActions, type PlaygroundVariant } from "@/features/playground";
import { errorMessage } from "@/shared/lib";

const INDENT_PX = 18;

const ago = (iso: string | undefined) => {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(min)) return "";
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h}시간 전` : `${Math.round(h / 24)}일 전`;
};

/**
 * 원본 쪽 · 문서 행 바로 아래에 붙는 다른 버전들 (v2, v3 …).
 * 누르면 그 버전을 열고, 올리면 "채택"(원본을 이 버전 내용으로 바꾸기) · 지우기.
 * 버전은 플레이그라운드에 있어 고르기 전까지 원본 · 프로젝트 데이터와 섞이지 않는다.
 */
export const VariantRows: React.FC<{ variants: PlaygroundVariant[]; level: number; targetName: string }> = ({ variants, level, targetName }) => {
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (docId: string, task: () => Promise<unknown>) => {
    setBusy(docId);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(errorMessage(err, "처리하지 못했어요."));
    } finally {
      setBusy(null);
    }
  };

  const padding = 4 + level * INDENT_PX;
  return (
    <>
      {variants.map((v) => {
        const active = activeDocId === v.doc.docId;
        return (
          <div
            key={v.doc.docId}
            role="treeitem"
            data-testid={`variant-row-${v.doc.docId}`}
            style={{ paddingLeft: padding }}
            className={`fig-row group ${active ? "!bg-indigo-50 ring-1 ring-indigo-300" : ""}`}
            onClick={() => playgroundActions.open(v.doc.docId)}
            title={`${v.label} · ${v.doc.title} — 누르면 이 버전을 열어요`}
          >
            <span className="fig-row-chevron" />
            <FlaskConical className="w-3.5 h-3.5 mr-1.5 shrink-0 text-indigo-600" />
            <span className="shrink-0 mr-1.5 text-[10.5px] font-semibold text-indigo-700">{v.label}</span>
            <span className="fig-row-label text-black/60">{v.doc.title}</span>
            <span className="ml-1 shrink-0 text-[10px] text-black/35 group-hover:hidden">{ago(v.doc.updatedAt)}</span>
            <div className="hidden group-hover:flex items-center shrink-0 ml-1">
              <button
                type="button"
                data-testid={`adopt-variant-btn-${v.doc.docId}`}
                disabled={busy !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!window.confirm(`${v.label} 내용으로 원본 '${targetName}'을(를) 바꿀까요?\n바꾸기 전 원본은 자동 보관돼서 되돌릴 수 있어요.`)) return;
                  void run(v.doc.docId, () => playgroundActions.adoptVariant(v.doc.docId, `${targetName} ${v.label}`));
                }}
                title="채택 — 원본을 이 버전 내용으로 바꾸기"
                className="h-5 px-1.5 rounded text-[10.5px] font-semibold text-indigo-800 hover:bg-indigo-100 inline-flex items-center gap-0.5 cursor-pointer"
              >
                <Check className="w-3 h-3" />
                채택
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!window.confirm(`${v.label} '${v.doc.title}'을(를) 지울까요? 원본은 그대로예요.`)) return;
                  void run(v.doc.docId, () => playgroundActions.remove(v.doc.docId));
                }}
                title="이 버전 지우기"
                className="fig-icon-btn fig-danger"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
      {error && (
        <div style={{ paddingLeft: padding + 20 }} className="pr-2 py-1 text-[11px] text-red-600">
          {error}
        </div>
      )}
    </>
  );
};
