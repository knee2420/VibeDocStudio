import React, { useEffect } from "react";
import {
  flattenResourceItems,
  getCheckedResourceItems,
  useResourceStore,
} from "@/entities/resource";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";

import { ResourceManagerHeader } from "./ResourceManagerHeader";
import { ResourceViewerDrawer } from "./ResourceViewerDrawer";
import { HoverResourcePeekCard } from "./HoverResourcePeekCard";
import { RmBridgeToolbar } from "./sections/RmBridgeToolbar";
import { RmIngestionBar } from "./sections/RmIngestionBar";
import { RmSourceTreeSection } from "./sections/RmSourceTreeSection";

export const ResourceManagerWidget: React.FC = () => {
  const activeProject = useProjectStore(selectActiveProject);
  const projectId = activeProject?.projectId || "default_project";

  const loadSession = useResourceStore((s) => s.loadSession);
  const items = useResourceStore((s) => s.items);
  const previewItem = useResourceStore((s) => s.previewItem);
  const closePreview = useResourceStore((s) => s.closePreview);

  useEffect(() => {
    void loadSession(projectId);
  }, [projectId, loadSession]);

  const allItems = flattenResourceItems(items).filter((it) => !it.children || it.children.length === 0);
  const checkedSources = getCheckedResourceItems(items);

  return (
    <div
      data-testid="resource-manager-widget"
      className="flex-1 flex flex-col h-full bg-white select-none overflow-hidden min-h-0 relative"
    >
      {/* 1. 상단 프레임 헤더 (도킹/이동 컨트롤러 및 카운터) */}
      <ResourceManagerHeader
        checkedCount={checkedSources.length}
        totalCount={allItems.length}
      />

      {/* 2. 대용량 소스 덤핑 바 */}
      <RmIngestionBar />

      {/* 3. 본체 영역 (소스 트리 & 선택기) */}
      <RmSourceTreeSection />

      {/* 4. 하단 양방향 주입 액션 툴바 */}
      <RmBridgeToolbar />

      {/* 5. Heptabase 스타일 우측 튀어나오는 문서 뷰어 패널 */}
      {previewItem && (
        <ResourceViewerDrawer
          item={previewItem}
          onClose={closePreview}
        />
      )}

      {/* 6. Ctrl + 호버 시 커서 옆에 뜨는 퀵 피크 카드 */}
      <HoverResourcePeekCard />
    </div>
  );
};

