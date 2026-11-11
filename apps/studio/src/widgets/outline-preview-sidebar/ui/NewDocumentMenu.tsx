import React, { useEffect, useRef } from "react";
import { FolderInput } from "lucide-react";

import { PagedDocumentIcon, ScrollDocumentIcon } from "@/shared/ui";

export interface NewDocumentMenuProps {
  anchor: { top: number; left: number } | null;
  onCreatePaged: () => void;
  onCreateScroll: () => void;
  onImportDocuments: () => void;
  onClose: () => void;
}

type OptionId = "paged" | "scroll" | "import";

const NEW_DOCUMENT_OPTIONS: ReadonlyArray<{
  id: OptionId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconTone: string;
}> = [
  {
    id: "paged",
    label: "새 문서 (A4)",
    description: "인쇄 · 페이지 단위 일반 문서",
    icon: PagedDocumentIcon,
    iconTone: "text-sky-600",
  },
  {
    id: "scroll",
    label: "새 블로그 글",
    description: "이음매 없는 한 단 스크롤 글",
    icon: ScrollDocumentIcon,
    iconTone: "text-emerald-600",
  },
  {
    id: "import",
    label: "문서 불러오기",
    description: "서버에 있는 문서 열기 · 이 프로젝트에 넣기",
    icon: FolderInput,
    iconTone: "text-slate-600",
  },
];

/**
 * 프로젝트 루트의 `새 문서` 아이콘 클릭 시 열리는 3옵션 팝오버 메뉴.
 * 아웃라이너 트리의 `overflow` 클리핑을 피하기 위해 `fixed` 뷰포트 좌표로 띄운다.
 */
export const NewDocumentMenu: React.FC<NewDocumentMenuProps> = ({
  anchor,
  onCreatePaged,
  onCreateScroll,
  onImportDocuments,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      // 트리거 버튼 재클릭은 버튼 쪽 토글 핸들러가 처리한다.
      if (menuRef.current?.contains(target) || target?.closest?.("[data-new-doc-trigger]")) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;

  const handlers: Record<OptionId, () => void> = {
    paged: onCreatePaged,
    scroll: onCreateScroll,
    import: onImportDocuments,
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      data-new-doc-menu=""
      data-testid="new-doc-source-menu"
      style={{ top: `${anchor.top}px`, left: `${anchor.left}px` }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[110] w-60 rounded-xl bg-white border border-slate-200 shadow-xl p-1.5 text-xs space-y-1"
    >
      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">새 문서 만들기</div>
      {NEW_DOCUMENT_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            type="button"
            role="menuitem"
            data-testid={`new-doc-option-${opt.id}`}
            onClick={() => {
              onClose();
              handlers[opt.id]();
            }}
            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-emerald-50 text-slate-700 hover:text-emerald-950 flex items-start gap-2 cursor-pointer transition-colors"
          >
            <Icon className={`w-3.5 h-3.5 ${opt.iconTone} shrink-0 mt-0.5`} />
            <div className="min-w-0">
              <div className="font-semibold text-[11px]">{opt.label}</div>
              <div className="text-[10px] text-slate-500 leading-snug">{opt.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

