import React from "react";

import { useResourceStore } from "@/entities/resource";

import { ResourceViewerDrawer } from "./ResourceViewerDrawer";

/**
 * 원본 뷰어 자리 — 스튜디오 맨 위에 한 번 놓는다.
 * RM 패널이 닫혀 있어도 인용 · 근거를 누르면 원본이 그 자리(페이지 · 영역 · 줄)로 열린다.
 */
export const ResourcePreviewHost: React.FC = () => {
  const item = useResourceStore((s) => s.previewItem);
  const focus = useResourceStore((s) => s.previewFocus);
  const close = useResourceStore((s) => s.closePreview);
  if (!item) return null;
  return <ResourceViewerDrawer key={item.id} item={item} focus={focus} onClose={close} />;
};
