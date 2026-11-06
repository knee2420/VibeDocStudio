import React, { useEffect } from "react";
import {
  flattenResourceItems,
  getCheckedResourceItems,
  useResourceStore,
} from "@/entities/resource";
import { useKnowledgeDeckStore } from "@/entities/knowledge-deck";
import { selectActiveProject, useProjectStore } from "@/entities/vdoc-project";

import { ResourceManagerHeader } from "./ResourceManagerHeader";
import { HoverResourcePeekCard } from "./HoverResourcePeekCard";
import { RmBridgeToolbar } from "./sections/RmBridgeToolbar";
import { RmIngestionBar } from "./sections/RmIngestionBar";
import { RmSourceTreeSection } from "./sections/RmSourceTreeSection";
import { RmKnowledgeDeckSection } from "./sections/RmKnowledgeDeckSection";

export const ResourceManagerWidget: React.FC = () => {
  const activeProject = useProjectStore(selectActiveProject);
  const projectId = activeProject?.projectId || "default_project";

  const loadSession = useResourceStore((s) => s.loadSession);
  const items = useResourceStore((s) => s.items);

  const loadDecks = useKnowledgeDeckStore((s) => s.loadDecks);
  const decks = useKnowledgeDeckStore((s) => s.decks);

  useEffect(() => {
    void loadSession(projectId);
    void loadDecks(projectId);
  }, [projectId, loadSession, loadDecks]);

  const allItems = flattenResourceItems(items).filter((it) => !it.children || it.children.length === 0);
  const checkedSources = getCheckedResourceItems(items);
  const checkedDecks = decks.filter((d) => d.isChecked);

  return (
    <div
      data-testid="resource-manager-widget"
      className="flex-1 flex flex-col h-full bg-white select-none overflow-hidden min-h-0 relative"
    >
      {/* 1. 상단 프레임 헤더 (도킹/이동 컨트롤러 및 종합 카운터) */}
      <ResourceManagerHeader
        checkedCount={checkedSources.length + checkedDecks.length}
        totalCount={allItems.length + decks.length}
      />

      {/* 2. 대용량 소스 인입 바 (통합 Ingestion Hub) */}
      <RmIngestionBar />

      {/* 3. 본체 영역: 듀얼 아코디언 (Raw Resource Explorer ↕ Knowledge Deck) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <RmSourceTreeSection />
        <RmKnowledgeDeckSection />
      </div>

      {/* 4. 하단 양방향 주입 액션 툴바 */}
      <RmBridgeToolbar />

      {/* 5. 원본 뷰어는 스튜디오 최상단 ResourcePreviewHost 가 그린다 (RM 이 닫혀 있어도 인용으로 열리게) */}

      {/* 6. Ctrl + 호버 시 커서 옆에 뜨는 퀵 피크 카드 */}
      <HoverResourcePeekCard />
    </div>
  );
};
