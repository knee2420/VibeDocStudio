import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BarChart3, Eye, EyeOff, ListTree, MessageSquareQuote, PanelTop, Sparkles, Trash2, Type, Wand2 } from "lucide-react";

import { isLayerOn, useReferenceStore, type BoundReference } from "@/entities/reference-manager";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { attachToComposer, referenceRef } from "@/features/ai-workspace";

/**
 * 레퍼런스 ⋯ 메뉴 (캔바 템플릿의 "텍스트만 · 색상만 · 요소 적용 · 페이지에 스타일 적용" 자리).
 * 문서 서식에서 레퍼런스가 줄 수 있는 결정은 층위(D1–D6)로 나뉘어 있어, "그 층위만 따라 이 쪽을 다듬기"로 옮겼다.
 * 누르면 AI Composer 에 이 레퍼런스를 붙이고 요청 문장을 채워 둔다 — 보내기 전에 고쳐 쓸 수 있다.
 * 층위 설정(켜고 끄기)은 건드리지 않는 한 번짜리 요청이다.
 */
const APPLY_ONLY: ReadonlyArray<{ layer: string; label: string; what: string; icon: React.ReactNode }> = [
  { layer: "D5", label: "조판만 적용", what: "타이포그래피 · 조판(제목 계층 · 여백 · 표 스타일)", icon: <Type className="w-3.5 h-3.5" /> },
  { layer: "D4", label: "서술 구조만 적용", what: "서술 프레임워크(논증 순서 · 결론-근거 배치)", icon: <ListTree className="w-3.5 h-3.5" /> },
  { layer: "D6", label: "어조 · 장르 규약만 적용", what: "장르 규약(어조 · 종결어미 · 필수 구성)", icon: <MessageSquareQuote className="w-3.5 h-3.5" /> },
  { layer: "D2", label: "근거 보여 주는 방식만 적용", what: "근거 · 데이터 증명 방식(표 · 수치 · 출처 제시)", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { layer: "D1", label: "훑어보기 구성만 적용", what: "스캐너빌리티 · 정보 밀도(요약 · 강조 · 짧은 단락)", icon: <PanelTop className="w-3.5 h-3.5" /> },
];

export const ReferenceItemMenu: React.FC<{
  entry: BoundReference;
  number: number;
  /** ⋯ 버튼 위치 (메뉴는 그 오른쪽 · 아래에 뜬다) */
  anchor: DOMRect;
  onClose: () => void;
  onOpenViewer: () => void;
}> = ({ entry, number, anchor, onClose, onOpenViewer }) => {
  const { refId, item } = entry;
  const report = useReferenceStore((s) => s.layers[refId]);
  const store = useReferenceStore.getState;
  const pageLabel = useStudioDocumentStore((s) => {
    const doc = selectActiveDocument(s);
    return doc?.pages.find((p) => p.pageId === s.activePageId)?.pageLabel ?? "";
  });
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchor.top, left: anchor.right + 6 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const left = anchor.right + 6 + w > window.innerWidth - 8 ? Math.max(8, anchor.left - w - 6) : anchor.right + 6;
    setPos({ top: Math.max(8, Math.min(anchor.top, window.innerHeight - h - 8)), left });
  }, [anchor]);

  // 층위 이름 · 질문을 아직 안 받았으면 받는다 (메뉴의 태그 · 요청 문장에 쓴다)
  useEffect(() => {
    void useReferenceStore.getState().ensureDetail(refId);
  }, [refId]);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const layerName = (id: string) => report?.layers.find((l) => l.id === id)?.name;
  const where = pageLabel ? `지금 쪽('${pageLabel}')` : "지금 쪽";
  // 입력창의 @참조N 은 이번 요청에 붙인 순번이라 패널의 참조 번호와 다를 수 있다 → 제목으로 부른다
  const name = `'${item.title.length > 24 ? `${item.title.slice(0, 24)}…` : item.title}'`;

  const ask = (prompt: string) => {
    attachToComposer([referenceRef(refId)], { prompt });
    onClose();
  };
  const applyOnly = (layer: string, what: string) =>
    ask(`${name}의 ${layerName(layer) ?? what} 규칙만 따라 ${where}을 다듬어 줘. 내용(사실 · 숫자)은 바꾸지 말고, 다른 부분은 지금 그대로 둬.`);
  const applyAll = () => {
    const on = (report?.layers ?? []).filter((l) => isLayerOn(entry, l.id)).map((l) => `${l.id} ${l.name}`);
    ask(`${name}의 스타일을 ${where}에 맞춰 줘${on.length ? ` (${on.join(" · ")})` : ""}. 내용(사실 · 숫자)은 바꾸지 마.`);
  };

  const kindLabel = item.kind === "pdf" ? "PDF" : item.kind === "web" ? "웹" : "이미지";
  const tags = (report?.layers ?? []).filter((l) => isLayerOn(entry, l.id));

  return (
    <div
      ref={ref}
      data-testid="reference-item-menu"
      style={{ top: pos.top, left: pos.left }}
      className="fig-panel fixed z-[70] w-[280px] bg-white rounded-[13px] overflow-hidden shadow-[0_5px_17px_rgba(0,0,0,0.2),0_2px_7px_rgba(0,0,0,0.15),0_0_0_0.5px_rgba(0,0,0,0.12)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-4 pt-3.5 pb-3 border-b border-[var(--fig-border)]">
        <div className="text-[13.5px] font-semibold leading-5 line-clamp-2">{item.title}</div>
        <div className="mt-0.5 text-black/50 truncate">
          참조{number} · {kindLabel}
          {item.pageCount ? ` ${item.pageCount}쪽` : ""}
          {item.sourceName ? ` · ${item.sourceName}` : ""}
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((l) => (
              <span key={l.id} title={l.question} className="px-2 h-5 inline-flex items-center rounded-full border border-[var(--fig-border)] text-[10.5px] text-black/60">
                {l.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="py-1.5">
        {APPLY_ONLY.map((a) => (
          <button
            key={a.layer}
            type="button"
            data-testid={`reference-apply-${a.layer}`}
            onClick={() => applyOnly(a.layer, a.what)}
            title={`${a.what} — AI Composer 에 요청을 채워 둡니다`}
            className="w-full h-8 px-4 flex items-center gap-2.5 text-left hover:bg-[var(--fig-hover)] cursor-default"
          >
            <span className="text-black/60">{a.icon}</span>
            <span className="flex-1">{a.label}</span>
            <span className="text-[10px] font-mono text-black/30">{a.layer}</span>
          </button>
        ))}
        <div className="px-4 pt-1.5 pb-1">
          <button
            type="button"
            data-testid="reference-apply-all"
            onClick={applyAll}
            className="w-full h-8 rounded-[6px] bg-[var(--vds-accent)] hover:bg-[var(--vds-accent-hover)] text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-default"
          >
            <Wand2 className="w-3.5 h-3.5" />이 쪽에 스타일 적용
          </button>
        </div>
      </div>

      <div className="py-1 border-t border-[var(--fig-border)]">
        <button
          type="button"
          data-testid="reference-ask-ai"
          onClick={() => ask(`${name}를 보고 `)}
          className="w-full h-8 px-4 flex items-center gap-2.5 text-left hover:bg-[var(--fig-hover)] cursor-default"
        >
          <Sparkles className="w-3.5 h-3.5 text-violet-600" />이 레퍼런스로 AI와 이야기하기
        </button>
        <button
          type="button"
          onClick={() => {
            onOpenViewer();
            onClose();
          }}
          className="w-full h-8 px-4 flex items-center gap-2.5 text-left hover:bg-[var(--fig-hover)] cursor-default"
        >
          <Eye className="w-3.5 h-3.5 text-black/60" />
          뷰어에서 열기
        </button>
        <button
          type="button"
          onClick={() => {
            void store().setEnabled(refId, !entry.enabled);
            onClose();
          }}
          className="w-full h-8 px-4 flex items-center gap-2.5 text-left hover:bg-[var(--fig-hover)] cursor-default"
        >
          {entry.enabled ? <EyeOff className="w-3.5 h-3.5 text-black/60" /> : <Eye className="w-3.5 h-3.5 text-black/60" />}
          {entry.enabled ? "AI가 참고하지 않게 끄기" : "AI가 참고하게 켜기"}
        </button>
        <button
          type="button"
          onClick={() => {
            void store().unbind(refId);
            onClose();
          }}
          className="w-full h-8 px-4 flex items-center gap-2.5 text-left hover:bg-[var(--fig-hover)] text-[#f24822] cursor-default"
        >
          <Trash2 className="w-3.5 h-3.5" />
          프로젝트에서 연결 해제
        </button>
      </div>
    </div>
  );
};
