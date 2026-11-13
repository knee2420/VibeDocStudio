import React, { useMemo } from "react";
import { BookOpen, FolderTree, GitBranch, HelpCircle, LayoutGrid, Library, Settings } from "lucide-react";

import { getBlockSlotIds, type StagedSlotHtmlChange } from "@vibe/vdoc-schema";

import { useAiStagingStore } from "@/entities/ai-staging";
import { selectActiveDocument, useStudioDocumentStore } from "@/entities/vdoc-document";
import { useWorkspaceLayoutStore, type ActivityBarTab } from "@/entities/workspace-layout";
import { StudioAgentSettingsButton } from "@/features/agent-settings";

const NAV_ITEMS: Array<{ id: ActivityBarTab; label: string; icon: React.ReactNode; testId: string }> = [
  {
    id: "explorer",
    label: "Layers · 프로젝트 아웃라이너 (Explorer)",
    icon: <FolderTree className="w-5 h-5" />,
    testId: "activity-tab-explorer",
  },
  {
    id: "source-control",
    label: "Staged AI 변경안 검토 & 되돌리기 이력",
    icon: <GitBranch className="w-5 h-5" />,
    testId: "activity-tab-source-control",
  },
  {
    id: "assets",
    label: "에셋 (Assets)",
    icon: <LayoutGrid className="w-5 h-5" />,
    testId: "activity-tab-assets",
  },
  {
    id: "reference",
    label: "레퍼런스 (Reference)",
    icon: <Library className="w-5 h-5" />,
    testId: "activity-tab-reference",
  },
  {
    id: "template-hub",
    label: "서식·템플릿 허브 (Template Hub)",
    icon: <BookOpen className="w-5 h-5" />,
    testId: "activity-tab-template-hub",
  },
];

const iconButton = (active: boolean) =>
  `relative w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition ${
    active ? "bg-slate-200/90 text-slate-900" : "text-slate-500 hover:bg-slate-200/60 hover:text-slate-900"
  }`;

export const StudioActivityBar: React.FC = () => {
  const activeTab = useWorkspaceLayoutStore((s) => s.activeActivityTab);
  const leftSidebarOpen = useWorkspaceLayoutStore((s) => s.leftSidebarOpen);
  const toggleActivityTab = useWorkspaceLayoutStore((s) => s.toggleActivityTab);
  const shortcutHelpOpen = useWorkspaceLayoutStore((s) => s.shortcutHelpOpen);
  const setShortcutHelpOpen = useWorkspaceLayoutStore((s) => s.setShortcutHelpOpen);
  const stagingQueue = useAiStagingStore((s) => s.queue);
  const activeDoc = useStudioDocumentStore(selectActiveDocument);
  const committedPageIds = useStudioDocumentStore((s) => s.committedPageIds);

  const sourceControlCount = useMemo(() => {
    if (!activeDoc) return stagingQueue.length;
    const stagedSlotIds = new Set(
      stagingQueue
        .filter((d): d is StagedSlotHtmlChange => d.targetKind === "slot-html")
        .map((d) => d.payload.slotId),
    );
    let pageChanges = 0;
    for (const page of activeDoc.pages) {
      const isAddedPage = page.pageLabel.includes("새 페이지") && !committedPageIds.has(page.pageId);
      if (isAddedPage) {
        pageChanges++;
        continue;
      }
      const blockSlots = page.blocks.flatMap((b) => getBlockSlotIds(b));
      const allSlotIds = [
        ...blockSlots,
        ...(page.headerSlotId ? [page.headerSlotId] : []),
        ...(page.footerSlotId ? [page.footerSlotId] : []),
      ];
      if (allSlotIds.some((sid) => Boolean(activeDoc.slots[sid]?.isEdited) || stagedSlotIds.has(sid))) {
        pageChanges++;
      }
    }
    return Math.max(pageChanges, stagingQueue.length);
  }, [activeDoc, committedPageIds, stagingQueue]);

  return (
    <aside
      aria-label="글로벌 도구 모드 전환 액티비티 바"
      data-testid="studio-activity-bar"
      className="w-11 bg-[#f6f6f6] border-r border-slate-200/80 flex flex-col items-center py-2 shrink-0 z-30 select-none text-slate-500 justify-between"
    >
      <div className="w-full flex flex-col items-center space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = leftSidebarOpen && activeTab === item.id;
          const badge = item.id === "source-control" ? sourceControlCount : 0;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={item.testId}
              onClick={() => toggleActivityTab(item.id)}
              title={item.label}
              className={iconButton(isActive)}
            >
              {isActive && <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#0d99ff] rounded-r" />}
              {item.icon}
              {badge > 0 && (
                <span
                  data-testid="source-control-badge"
                  className="absolute bottom-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-[#0078d4] text-white font-sans font-semibold text-[9.5px] leading-none flex items-center justify-center border border-[#f6f6f6] shadow-2xs"
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="w-full flex flex-col items-center space-y-1">
        <button
          type="button"
          data-testid="activity-help-btn"
          onClick={() => setShortcutHelpOpen(!shortcutHelpOpen)}
          title="단축키 및 조작 치트시트 (?)"
          className={iconButton(shortcutHelpOpen)}
        >
          <HelpCircle className="w-5 h-5" />
        </button>

        {/* 설정은 사이드바 패널이 아니라 에이전트 · LLM 설정 모달을 연다. */}
        <span data-testid="activity-tab-settings" title="스튜디오 & AI 설정">
          <StudioAgentSettingsButton className={iconButton(false)}>
            <Settings className="w-5 h-5" />
          </StudioAgentSettingsButton>
        </span>
      </div>
    </aside>
  );
};
