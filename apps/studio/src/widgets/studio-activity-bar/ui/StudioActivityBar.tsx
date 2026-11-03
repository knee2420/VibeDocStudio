import React from "react";
import {
  BookOpen,
  FolderTree,
  GitBranch,
  HelpCircle,
  Settings,
} from "lucide-react";

import {
  ActivityBarTab,
  useWorkspaceSessionStore,
} from "@/entities/workspace-session";

export const StudioActivityBar: React.FC = () => {
  const activeTab = useWorkspaceSessionStore((s) => s.activeActivityTab);
  const leftSidebarOpen = useWorkspaceSessionStore((s) => s.leftSidebarOpen);
  const toggleActivityTab = useWorkspaceSessionStore(
    (s) => s.toggleActivityTab
  );
  const stagingCount = useWorkspaceSessionStore((s) => s.stagingQueue.length);
  const shortcutPopoverOpen = useWorkspaceSessionStore(
    (s) => s.shortcutPopoverOpen
  );
  const setShortcutPopoverOpen = useWorkspaceSessionStore(
    (s) => s.setShortcutPopoverOpen
  );

  const navItems: Array<{
    id: ActivityBarTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    testId: string;
  }> = [
    {
      id: "explorer",
      label: "프로젝트 아웃라이너 (Explorer)",
      icon: <FolderTree className="w-5 h-5" />,
      testId: "activity-tab-explorer",
    },
    {
      id: "source-control",
      label: "Git 소스 제어 & Staged AI 변경안",
      icon: <GitBranch className="w-5 h-5" />,
      badge: stagingCount,
      testId: "activity-tab-source-control",
    },
    {
      id: "template-hub",
      label: "서식·템플릿 허브 (Template Hub)",
      icon: <BookOpen className="w-5 h-5" />,
      testId: "activity-tab-template-hub",
    },
  ];

  return (
    <aside
      aria-label="글로벌 도구 모드 전환 액티비티 바"
      data-testid="studio-activity-bar"
      className="w-12 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-2 shrink-0 z-30 select-none text-slate-400 justify-between"
    >
      {/* Top Group: Activity Navigation */}
      <div className="w-full flex flex-col items-center space-y-1">
        {navItems.map((item) => {
          const isActive = leftSidebarOpen && activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={item.testId}
              onClick={() => toggleActivityTab(item.id)}
              title={item.label}
              className={`relative w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition ${
                isActive
                  ? "bg-slate-800 text-white shadow-xs"
                  : "hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#248567] rounded-r" />
              )}
              {item.icon}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-slate-950 font-mono font-bold text-[9px] flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Group: Settings & Help */}
      <div className="w-full flex flex-col items-center space-y-1">
        <button
          type="button"
          data-testid="activity-help-btn"
          onClick={() => setShortcutPopoverOpen(!shortcutPopoverOpen)}
          title="단축키 및 조작 치트시트 (?)"
          className={`w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition ${
            shortcutPopoverOpen
              ? "bg-slate-800 text-white"
              : "hover:bg-slate-800/60 hover:text-slate-200"
          }`}
        >
          <HelpCircle className="w-5 h-5" />
        </button>

        <button
          type="button"
          data-testid="activity-tab-settings"
          onClick={() => toggleActivityTab("settings")}
          title="스튜디오 & AI 설정"
          className={`relative w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition ${
            leftSidebarOpen && activeTab === "settings"
              ? "bg-slate-800 text-white"
              : "hover:bg-slate-800/60 hover:text-slate-200"
          }`}
        >
          {leftSidebarOpen && activeTab === "settings" && (
            <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#248567] rounded-r" />
          )}
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
};
