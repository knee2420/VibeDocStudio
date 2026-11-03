import React from "react";

import {
  GlobalUndoToastHost,
  useGlobalStudioShortcuts,
} from "@/features/command-bus";
import { useWorkspaceUrlSync } from "@/features/workspace-persistence";
import { OutlinePreviewSidebar } from "@/widgets/outline-preview-sidebar";
import { SlotInspectorDrawer } from "@/widgets/slot-inspector-drawer";
import { StudioActivityBar } from "@/widgets/studio-activity-bar";
import { StudioTopRibbon } from "@/widgets/studio-top-ribbon";
import { VDocPageCanvas } from "@/widgets/vdoc-page-canvas";

export const StudioPage: React.FC = () => {
  useWorkspaceUrlSync();
  useGlobalStudioShortcuts();

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f4f5f7] text-slate-900 overflow-hidden select-none">
      <StudioTopRibbon />

      <div className="flex-1 flex overflow-hidden relative">
        <StudioActivityBar />
        <OutlinePreviewSidebar />
        <VDocPageCanvas />
        <SlotInspectorDrawer />
      </div>

      <GlobalUndoToastHost />
    </div>
  );
};
