import React from "react";

import { OutlinePreviewSidebar } from "@/widgets/outline-preview-sidebar";
import { SlotInspectorDrawer } from "@/widgets/slot-inspector-drawer";
import { StudioTopRibbon } from "@/widgets/studio-top-ribbon";
import { VDocPageCanvas } from "@/widgets/vdoc-page-canvas";

export const StudioPage: React.FC = () => {
  return (
    <div className="h-screen w-screen flex flex-col bg-[#f4f5f7] text-slate-900 overflow-hidden select-none">
      <StudioTopRibbon />

      <div className="flex-1 flex overflow-hidden relative">
        <OutlinePreviewSidebar />
        <VDocPageCanvas />
        <SlotInspectorDrawer />
      </div>
    </div>
  );
};

