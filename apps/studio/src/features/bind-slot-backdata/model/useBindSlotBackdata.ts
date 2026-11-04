import { useState } from "react";

import { addBackdataChunks, toggleSlotBackdataRef } from "@vibe/vdoc-schema";

import { useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";
import { errorMessage } from "@/shared/lib";

import { backdataApi } from "../api/backdataApi";

/** 슬롯 ↔ 백데이터 연결 토글. */
export function useToggleSlotBackdata() {
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);
  return (slotId: string, chunkId: string) =>
    updateCurrentDoc((doc) => toggleSlotBackdataRef(doc, slotId, chunkId));
}

/**
 * 원천 자료 조각을 서버에 등록(청크 분할)하고, 돌아온 청크를 문서 보관함에 넣어 슬롯에 연결한다.
 * 서버가 실패하면 문서를 건드리지 않고 오류를 보여준다.
 */
export function useRegisterBackdataForm(targetSlotId: string | null) {
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);
  const setBackdataFormOpen = useWorkspaceLayoutStore((s) => s.setBackdataFormOpen);

  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = Boolean(title.trim() && excerpt.trim()) && !isSubmitting;

  const submit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const { chunks } = await backdataApi.importRawBackdata({
        source_title: title.trim(),
        source_type: "markdown",
        raw_text: excerpt.trim(),
        tags: ["수동임포트", "백데이터"],
      });
      updateCurrentDoc((doc) => addBackdataChunks(doc, chunks, targetSlotId), {
        history: true,
        label: `백데이터 ${chunks.length}건 등록`,
      });
      setTitle("");
      setExcerpt("");
      setBackdataFormOpen(false);
    } catch (err) {
      setError(errorMessage(err, "백데이터를 등록하지 못했습니다."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    title,
    setTitle,
    excerpt,
    setExcerpt,
    isSubmitting,
    error,
    canSubmit,
    submit,
    cancel: () => setBackdataFormOpen(false),
  };
}
