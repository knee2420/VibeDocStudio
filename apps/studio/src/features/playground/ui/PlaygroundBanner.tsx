import React, { useState } from "react";
import { ArrowUpRight, Check, Columns2, EyeOff, FlaskConical, List } from "lucide-react";

import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useActiveDiffStore } from "@/features/document-diff";

import { playgroundActions } from "../model/playgroundActions";
import { usePlaygroundDocIds, usePlaygroundVariants } from "../model/playgroundDocs";
import { usePlaygroundSettings } from "../model/usePlaygroundSettings";

/**
 * 플레이그라운드 문서를 열었을 때 캔버스 위에 늘 보이는 띠 — 지금 프로젝트가 아니라 안전지대라는 걸 잊지 않게.
 * 원본에서 복사해 왔으면 원본으로 바로 가는 칩을 둔다.
 */
export const PlaygroundBanner: React.FC = () => {
  const doc = useStudioDocumentStore(selectActiveDocument);
  const docs = useStudioDocumentStore((s) => s.docs);
  const ids = usePlaygroundDocIds();
  const exclude = usePlaygroundSettings((s) => s.excludeFromBackdata);
  const variants = usePlaygroundVariants();
  const activeDiff = useActiveDiffStore((s) => s.activeDiff);
  const closeDiff = useActiveDiffStore((s) => s.closeDiff);
  const [busy, setBusy] = useState(false);
  if (!doc || !ids.has(doc.docId)) return null;

  const from = doc.origin?.copiedFrom;
  const sourceAlive = from ? docs.some((d) => d.docId === from.docId) : false;
  const variant = [...variants.values()].flat().find((v) => v.doc.docId === doc.docId);
  const source = from ? docs.find((d) => d.docId === from.docId) : undefined;
  const targetName = variant?.sourcePageId
    ? (source?.pages.find((p) => p.pageId === variant.sourcePageId)?.pageLabel ?? from?.title ?? "")
    : (from?.title ?? "");
  const isComparing = activeDiff?.diffId === `playground-compare-${doc.docId}`;

  const adopt = async () => {
    if (!variant) return;
    if (!window.confirm(`${variant.label} 내용으로 원본 '${targetName}'을(를) 바꿀까요?
바꾸기 전 원본은 자동 보관돼서 되돌릴 수 있어요.`)) return;
    setBusy(true);
    try {
      await playgroundActions.adoptVariant(doc.docId, `${targetName} ${variant.label}`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "채택하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="playground-banner"
      className="h-8 shrink-0 px-3 flex items-center gap-2 border-b border-[#e6e6e8] bg-[#f7f7f8] text-[11.5px] text-[#18181b]"
    >
      <FlaskConical className="w-3.5 h-3.5 shrink-0 text-[var(--vds-accent-bright)]" />
      <span className="font-semibold shrink-0">플레이그라운드</span>
      <span className="text-[#6e6e73] truncate min-w-0">여기서 한 작업은 프로젝트에 영향을 주지 않아요</span>
      {from && (
        <button
          type="button"
          disabled={!sourceAlive}
          onClick={() => playgroundActions.open(from.docId)}
          title={sourceAlive ? "원본 문서 열기" : "원본 문서를 찾을 수 없어요"}
          className="ml-1 inline-flex items-center gap-1 h-5 px-1.5 rounded border border-[#e6e6e8] bg-white hover:bg-[#efeff1] text-[#18181b] cursor-pointer disabled:opacity-50 disabled:cursor-default min-w-0 transition"
        >
          <span className="truncate max-w-[180px]">
            {variant ? `${variant.label} · ` : ""}원본: {from.title}
            {from.pageIds?.length ? ` · ${from.pageIds.length}쪽` : ""}
          </span>
          <ArrowUpRight className="w-3 h-3 shrink-0 text-[#6e6e73]" />
        </button>
      )}
      {from && sourceAlive && (
        <button
          type="button"
          data-testid="playground-compare-btn"
          onClick={() => {
            if (isComparing) closeDiff();
            else playgroundActions.compareWithSource(doc.docId, { label: variant?.label ?? doc.title, targetName });
          }}
          title="원본과 이 실험 버전을 좌우 · 겹쳐 비교 (Figma Compare)"
          className={`inline-flex items-center gap-1 h-5 px-2 rounded border font-medium cursor-pointer shrink-0 transition ${
            isComparing
              ? "border-[#18181b] bg-[#18181b] text-white"
              : "border-[#e6e6e8] bg-white hover:bg-[#efeff1] text-[#18181b]"
          }`}
        >
          <Columns2 className="w-3 h-3" />
          {isComparing ? "비교 닫기" : "원본과 비교"}
        </button>
      )}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {exclude && (
          <span className="inline-flex items-center gap-1 text-[#6e6e73]" title="이 공간의 대화 · 작업은 프로젝트 백데이터로 쓰지 않아요">
            <EyeOff className="w-3 h-3" />
            백데이터 제외
          </span>
        )}
        {variant && sourceAlive && (
          <button
            type="button"
            data-testid="playground-adopt-btn"
            disabled={busy}
            onClick={() => void adopt()}
            title="원본을 이 버전 내용으로 바꾸기 (바꾸기 전 원본은 자동 보관)"
            className="inline-flex items-center gap-1 h-5 px-2.5 rounded bg-[var(--vds-accent)] hover:bg-[var(--vds-accent-hover)] text-white font-medium cursor-pointer disabled:opacity-50 transition"
          >
            <Check className="w-3 h-3" />
            {busy ? "채택 중…" : "이 버전 채택"}
          </button>
        )}
        <button
          type="button"
          onClick={playgroundActions.showList}
          className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[#6e6e73] hover:bg-[#efeff1] hover:text-[#18181b] cursor-pointer transition"
        >
          <List className="w-3 h-3" />
          목록
        </button>
      </div>
    </div>
  );
};
