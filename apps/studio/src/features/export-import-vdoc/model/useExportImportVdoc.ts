import React from "react";

import type { VDocDocument } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";

export function useExportImportVdoc(options?: {
  onImportError?: (message: string) => void;
}) {
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);
  const upsertDocument = useStudioDocumentStore((s) => s.upsertDocument);

  const activeDoc = docs.find((d) => d.docId === activeDocId) || docs[0];

  const exportCurrentVDoc = () => {
    if (!activeDoc) return;
    const blob = new Blob([JSON.stringify(activeDoc, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeDoc.title.replace(/\s+/g, "_")}.vdoc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importVDocFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as VDocDocument;
        if (parsed.docId && parsed.pages && parsed.slots) {
          upsertDocument(parsed);
        } else {
          options?.onImportError?.("유효한 .vdoc (JSON) 문서 구조가 아닙니다.");
        }
      } catch {
        options?.onImportError?.("유효한 .vdoc (JSON) 문서 파일이 아닙니다.");
      }
    };
    reader.readAsText(file);
  };

  return {
    exportCurrentVDoc,
    importVDocFile,
  };
}

