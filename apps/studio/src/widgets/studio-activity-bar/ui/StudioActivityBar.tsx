import React from "react";
import { BookOpen, FolderTree, GitBranch, HelpCircle, Settings } from "lucide-react";

import { useAiStagingStore } from "@/entities/ai-staging";
import { useWorkspaceLayoutStore, type ActivityBarTab } from "@/entities/workspace-layout";
import { StudioAgentSettingsButton } from "@/features/agent-settings";

const NAV_ITEMS: Array<{ id: ActivityBarTab; label: string; icon: React.ReactNode; testId: string }> = [
  {
    id: "explorer",
    label: "프로젝트 아웃라이너 (Explorer)",
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
    id: "template-hub",
    label: "서식·템플릿 허브 (Template Hub)",
    icon: <BookOpen className="w-5 h-5" />,
    testId: "activity-tab-template-hub",
  },
];

const iconButton = (active: boolean) =>
  `relative w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition ${
    active ? "bg-slate-800 text-white shadow-xs" : "hover:bg-slate-800/60 hover:text-slate-200"
  }`;

export const StudioActivityBar: React.FC = () => {
  const activeTab = useWorkspaceLayoutStore((s) => s.activeActivityTab);
  const leftSidebarOpen = useWorkspaceLayoutStore((s) => s.leftSidebarOpen);
  const toggleActivityTab = useWorkspaceLayoutStore((s) => s.toggleActivityTab);
  const shortcutHelpOpen = useWorkspaceLayoutStore((s) => s.shortcutHelpOpen);
  const setShortcutHelpOpen = useWorkspaceLayoutStore((s) => s.setShortcutHelpOpen);
  const stagingCount = useAiStagingStore((s) => s.queue.length);

  return (
    <aside
      aria-label="글로벌 도구 모드 전환 액티비티 바"
      data-testid="studio-activity-bar"
      className="w-12 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-2 shrink-0 z-30 select-none text-slate-400 justify-between"
    >
      <div className="w-full flex flex-col items-center space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = leftSidebarOpen && activeTab === item.id;
          const badge = item.id === "source-control" ? stagingCount : 0;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={item.testId}
              onClick={() => toggleActivityTab(item.id)}
              title={item.label}
              className={iconButton(isActive)}
            >
              {isActive && <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#248567] rounded-r" />}
              {item.icon}
              {badge > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-slate-950 font-mono font-bold text-[9px] flex items-center justify-center">
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
