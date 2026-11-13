import React from "react";
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

const SOURCE_ICONS: Record<TemplateSourceKind, React.ComponentType<{ className?: string }>> = {
  blank: FilePlus2,
  pdf: FileUp,
  url: Globe,
  catalog: Layers,
};

/**
 * 옵시디언 스타일 '+' 새 탭 화면: 중앙 빈 캔버스에 '페이지 추가 출처' 선택지를 띄워 새 페이지를 바로 추가한다.
 */
export const NewTabPagePicker: React.FC = () => {
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId || s.docs[0]?.docId || "");
  const closeTab = useStudioDocumentStore((s) => s.closeTab);

  const templateInsert = useInsertTemplatePages(
    (docId, sourceDoc, pageIds, label) => {
      pageMutations.importTemplatePages(docId, sourceDoc, pageIds, { label });
      closeTab("new-tab");
    },
    {
      onReservePdfPlaceholders: (docId, count, label) => {
        const ids = pageMutations.reservePdfPlaceholderPages(docId, count, label);
        closeTab("new-tab");
        return ids;
      },
    }
  );

  const pick = (kind: TemplateSourceKind) => {
    if (!activeDocId) return;
    if (kind === "blank") {
      const pageCount =
        useStudioDocumentStore.getState().docs.find((d) => d.docId === activeDocId)?.pages.length ?? 0;
      templateInsert.insertBasicPage(activeDocId, `새 페이지 ${pageCount + 1}`);
      closeTab("new-tab");
    } else if (kind === "pdf") {
      templateInsert.triggerPdfPick(activeDocId);
    } else if (kind === "url") {
      templateInsert.openUrlImport(activeDocId);
    } else {
      void templateInsert.openCatalogBrowser(activeDocId);
    }
  };

  return (
    <main
      data-testid="new-tab-page-picker"
      className="flex-1 flex items-center justify-center bg-[#f4f5f7] p-8 overflow-y-auto"
    >
      <input
        ref={templateInsert.pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void templateInsert.handlePdfFileSelected(file);
        }}
      />

      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200/90 shadow-sm p-5 space-y-2">
        <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          페이지 추가 출처
        </div>

        {TEMPLATE_SOURCE_REGISTRY.map((src) => {
          const Icon = SOURCE_ICONS[src.kind];
          return (
            <button
              key={src.kind}
              type="button"
              data-testid={`new-tab-source-${src.kind}`}
              onClick={() => pick(src.kind)}
              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-emerald-50 text-slate-700 hover:text-emerald-950 flex items-start gap-3 cursor-pointer transition-colors border border-transparent hover:border-emerald-200/70"
            >
              <Icon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-semibold text-xs">{src.label}</div>
                <div className="text-[11px] text-slate-500 leading-snug mt-0.5">{src.description}</div>
              </div>
            </button>
          );
        })}
      </div>

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
    </main>
  );
};

