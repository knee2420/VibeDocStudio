import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { useStudioDocumentStore } from "../model/useStudioDocumentStore";

/**
 * 저장 충돌 알림 — 다른 탭 · 다른 곳에서 먼저 저장된 문서는 덮어쓰지 않고 멈춘다(409).
 * "다시 불러오기"는 서버 판을 받아 오고, 저장하지 못한 이 탭의 변경은 버린다.
 */
export const SaveConflictPill: React.FC = () => {
  // 셀렉터는 같은 값이면 같은 참조를 돌려줘야 한다 (배열을 새로 만들면 무한 렌더) — 문자열 키로 고른다
  const conflictKey = useStudioDocumentStore((s) =>
    Object.entries(s.saveState)
      .filter(([, st]) => st === "conflict")
      .map(([id]) => id)
      .join("\u0000")
  );
  const conflicted = conflictKey ? conflictKey.split("\u0000") : [];
  const docs = useStudioDocumentStore((s) => s.docs);
  const reloadDoc = useStudioDocumentStore((s) => s.reloadDoc);
  if (conflicted.length === 0) return null;
  const titles = conflicted.map((id) => docs.find((d) => d.docId === id)?.title ?? id).join(", ");
  return (
    <button
      type="button"
      data-testid="save-conflict-pill"
      onClick={() => {
        if (window.confirm(`'${titles}' 이(가) 다른 곳에서 먼저 저장되었습니다.\n서버 판으로 다시 불러올까요? (이 탭에서 저장하지 못한 변경은 사라집니다)`)) {
          conflicted.forEach((id) => void reloadDoc(id));
        }
      }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-300 bg-rose-50 text-rose-700 text-[11px] font-bold cursor-pointer hover:bg-rose-100"
      title={`저장 충돌: ${titles}`}
    >
      <AlertTriangle className="w-3 h-3" />
      저장 충돌
      <RefreshCw className="w-3 h-3" />
    </button>
  );
};
