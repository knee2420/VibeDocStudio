import React, { useImperativeHandle, useRef, useState } from "react";
import { FilePlus2, FileUp, Globe, Layers } from "lucide-react";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  PagePickerModal,
  TEMPLATE_SOURCE_REGISTRY,
  UrlImportModal,
  useInsertTemplatePages,
  type TemplateSourceKind,
} from "@/features/insert-template-pages";
import { pageMutations } from "@/features/mutate-document-pages";

import { popoverAnchorBelow, usePopoverDismiss } from "../lib/usePopoverDismiss";

export interface AddPageFlowHandle {
  /** `anchorEl` 아래에 `페이지 추가 출처` 메뉴를 연다. 같은 문서로 다시 부르면 닫는다. */
  toggle: (docId: string, anchorEl: HTMLElement) => void;
}

const SOURCE_ICONS: Record<TemplateSourceKind, React.ComponentType<{ className?: string }>> = {
  blank: FilePlus2,
  pdf: FileUp,
  url: Globe,
  catalog: Layers,
};

/** 트리거 버튼에 붙이는 표식 (바깥 클릭 판정에서 뺀다). */
export const ADD_PAGE_TRIGGER_ATTR = { "data-add-page-trigger": "" } as const;

/**
 * 페이지 추가 흐름 전체 (출처 메뉴 · PDF 파일 고르기 · URL 가져오기 · 카탈로그 · 페이지 고르기 모달).
 * 모달 진행 상태가 바뀌어도 아웃라인 트리가 다시 그려지지 않도록 별도 컴포넌트로 둔다.
 */
export const AddPageFlow: React.FC<{ ref?: React.Ref<AddPageFlowHandle> }> = ({ ref }) => {
  const [menu, setMenu] = useState<{ docId: string; top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(menuRef, menu !== null, () => setMenu(null), "[data-add-page-trigger]");

  const templateInsert = useInsertTemplatePages(
    (docId, sourceDoc, pageIds, label) => {
      pageMutations.importTemplatePages(docId, sourceDoc, pageIds, { label });
    },
    { onReservePdfPlaceholders: pageMutations.reservePdfPlaceholderPages }
  );

  useImperativeHandle(
    ref,
    () => ({
      toggle: (docId, anchorEl) =>
        setMenu((prev) => (prev?.docId === docId ? null : { docId, ...popoverAnchorBelow(anchorEl, 250) })),
    }),
    []
  );

  const pick = (kind: TemplateSourceKind, docId: string) => {
    setMenu(null);
    if (kind === "blank") {
      const pageCount = useStudioDocumentStore.getState().docs.find((d) => d.docId === docId)?.pages.length ?? 0;
      templateInsert.insertBasicPage(docId, `새 페이지 ${pageCount + 1}`);
    } else if (kind === "pdf") {
      templateInsert.triggerPdfPick(docId);
    } else if (kind === "url") {
      templateInsert.openUrlImport(docId);
    } else {
      void templateInsert.openCatalogBrowser(docId);
    }
  };

  return (
    <>
      <input
        ref={templateInsert.pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        data-testid="outline-pdf-template-input"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void templateInsert.handlePdfFileSelected(file);
        }}
      />

      {menu && (
        <div
          ref={menuRef}
          data-testid="add-page-source-menu"
          style={{ top: `${menu.top}px`, left: `${menu.left}px` }}
          className="fixed z-[110] w-60 rounded-xl bg-white border border-slate-200 shadow-xl p-1.5 text-xs space-y-1"
        >
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">페이지 추가 출처</div>
          {TEMPLATE_SOURCE_REGISTRY.map((src) => {
            const Icon = SOURCE_ICONS[src.kind];
            return (
              <button
                key={src.kind}
                type="button"
                data-testid={`add-page-source-${src.kind}`}
                onClick={() => pick(src.kind, menu.docId)}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-emerald-50 text-slate-700 hover:text-emerald-950 flex items-start gap-2 cursor-pointer transition-colors"
              >
                <Icon className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-[11px]">{src.label}</div>
                  <div className="text-[10px] text-slate-500 leading-snug">{src.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <UrlImportModal
        key={templateInsert.urlImportTargetDocId ?? "closed"}
        targetDocId={templateInsert.urlImportTargetDocId}
        loading={templateInsert.urlImporting}
        error={templateInsert.error}
        onDismissError={templateInsert.dismissError}
        onSubmit={templateInsert.submitUrlImport}
        onClose={templateInsert.closeModals}
      />

      <PagePickerModal
        pagePicker={templateInsert.pagePicker}
        pdfPreviewPicker={templateInsert.pdfPreviewPicker}
        catalogBrowser={templateInsert.catalogBrowser}
        loadingMessage={templateInsert.loadingMessage}
        error={templateInsert.error}
        suppressErrorModal={Boolean(templateInsert.urlImportTargetDocId)}
        onDismissError={templateInsert.dismissError}
        onSelectCatalog={templateInsert.selectCatalogTemplate}
        onConfirmPages={templateInsert.confirmSelectedPages}
        onConfirmPdfPages={templateInsert.confirmPdfPages}
        onClose={templateInsert.closeModals}
      />
    </>
  );
};
