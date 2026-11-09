import type { VDocDocument } from "@vibe/vdoc-schema";

import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { downloadJsonFile, readTextFile } from "@/shared/lib";

function parseVDoc(text: string): VDocDocument {
  let parsed: Partial<VDocDocument>;
  try {
    parsed = JSON.parse(text) as Partial<VDocDocument>;
  } catch {
    throw new Error("유효한 .vdoc (JSON) 문서 파일이 아닙니다.");
  }
  if (!parsed.docId || !Array.isArray(parsed.pages) || !parsed.slots) {
    throw new Error("유효한 .vdoc (JSON) 문서 구조가 아닙니다.");
  }
  return parsed as VDocDocument;
}

/** 활성 문서를 `.vdoc` 로 내보내고, `.vdoc` 파일을 새 작업 문서로 연다. */
export function useExportImportVdoc() {
  const activeDoc = useStudioDocumentStore(selectActiveDocument);
  const addDocument = useStudioDocumentStore((s) => s.addDocument);

  return {
    exportCurrentVDoc: () => {
      if (activeDoc) downloadJsonFile(`${activeDoc.title.replace(/\s+/g, "_")}.vdoc`, activeDoc);
    },
    /** 실패하면 사용자에게 보여줄 문장을 담은 오류를 던진다. */
    importVDocFile: async (file: File) => addDocument(parseVDoc(await readTextFile(file))),
  };
}
