import React from "react";
import { blockIcon } from "@vibe/slot-canvas";

export interface AssetWireframeThumbProps {
  kind: string;
  large?: boolean;
  iconName?: string;
}

/** 피그마 에셋 스타일의 미니 와이어프레임 썸네일 */
export const AssetWireframeThumb: React.FC<AssetWireframeThumbProps> = ({ kind, large, iconName }) => {
  const pad = large ? "p-4" : "p-2.5";
  switch (kind) {
    case "image":
      return (
        <div
          className={`w-full h-full ${pad} flex items-center justify-center`}
          style={{
            backgroundImage:
              "linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)",
            backgroundSize: large ? "16px 16px" : "10px 10px",
            backgroundPosition: large ? "0 0, 0 8px, 8px -8px, -8px 0" : "0 0, 0 5px, 5px -5px, -5px 0",
          }}
        />
      );
    case "columns-grid":
      return (
        <div className={`w-full h-full ${pad} flex items-center justify-center`}>
          <div className="w-full h-full bg-white rounded border border-slate-200/80 p-1.5 grid grid-cols-2 gap-1.5 shadow-2xs">
            <div className="bg-slate-200/80 rounded-xs" />
            <div className="bg-slate-200/80 rounded-xs" />
          </div>
        </div>
      );
    case "structured-table":
      return (
        <div className={`w-full h-full ${pad} flex items-center justify-center`}>
          <div className="w-full h-full bg-white rounded border border-slate-200/80 p-1.5 flex flex-col gap-1 shadow-2xs">
            <div className="h-2 bg-slate-500/70 rounded-xs" />
            <div className="flex-1 grid grid-cols-3 gap-1">
              <div className="bg-slate-200/80 rounded-xs" />
              <div className="bg-slate-200/80 rounded-xs" />
              <div className="bg-slate-200/80 rounded-xs" />
              <div className="bg-slate-100 rounded-xs" />
              <div className="bg-slate-100 rounded-xs" />
              <div className="bg-slate-100 rounded-xs" />
            </div>
          </div>
        </div>
      );
    case "hero":
      return (
        <div className={`w-full h-full ${pad} flex items-center justify-center`}>
          <div className="w-full h-full bg-white rounded border border-slate-200/80 p-1.5 flex flex-col gap-1.5 shadow-2xs">
            <div className="h-2/5 bg-slate-600/80 rounded-xs" />
            <div className="grid grid-cols-3 gap-1 flex-1">
              <div className="bg-slate-200/80 rounded-xs" />
              <div className="bg-slate-200/80 rounded-xs" />
              <div className="bg-slate-200/80 rounded-xs" />
            </div>
          </div>
        </div>
      );
    case "fillable-group":
      return (
        <div className={`w-full h-full ${pad} flex items-center justify-center`}>
          <div className="w-full h-full bg-white rounded border border-slate-200/80 p-1.5 flex flex-col justify-center gap-1.5 shadow-2xs">
            <div className="h-2 w-2/3 bg-slate-300 rounded-xs" />
            <div className="h-2.5 w-full bg-slate-100 border border-slate-200 rounded-xs" />
            <div className="h-2.5 w-full bg-slate-100 border border-slate-200 rounded-xs" />
          </div>
        </div>
      );
    case "link-card":
      return (
        <div className={`w-full h-full ${pad} flex items-center justify-center`}>
          <div className="w-full bg-white rounded border border-slate-200/80 p-1.5 flex items-center gap-1.5 shadow-2xs">
            <div className="w-4 h-4 rounded-xs bg-slate-500/70 shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-1.5 w-3/4 bg-slate-400 rounded-xs" />
              <div className="h-1.5 w-1/2 bg-slate-200 rounded-xs" />
            </div>
          </div>
        </div>
      );
    case "divider":
      return (
        <div className={`w-full h-full ${pad} flex items-center justify-center`}>
          <div className="w-full h-0.5 bg-slate-400 rounded-full" />
        </div>
      );
    case "section-block":
      return (
        <div className={`w-full h-full ${pad} flex items-center justify-center`}>
          <div className="w-full h-full bg-white rounded border border-slate-200/80 p-1.5 flex flex-col gap-1 shadow-2xs">
            <div className="h-2 w-1/2 bg-slate-600/75 rounded-xs" />
            <div className="h-1.5 w-full bg-slate-200 rounded-xs" />
            <div className="h-1.5 w-5/6 bg-slate-200 rounded-xs" />
            <div className="h-1.5 w-2/3 bg-slate-200 rounded-xs" />
          </div>
        </div>
      );
    case "text":
      return (
        <div className={`w-full h-full ${pad} flex items-center justify-center`}>
          <div className="w-full h-full bg-white rounded border border-slate-200/80 p-1.5 flex flex-col justify-center gap-1 shadow-2xs">
            <div className="h-2 w-2/3 bg-slate-500/75 rounded-xs" />
            <div className="h-1.5 w-full bg-slate-200 rounded-xs" />
            <div className="h-1.5 w-4/5 bg-slate-200 rounded-xs" />
          </div>
        </div>
      );
    default: {
      if (iconName) {
        const Icon = blockIcon(iconName);
        return (
          <div className={`w-full h-full ${pad} flex items-center justify-center`}>
            <div className="w-full h-full bg-white rounded border border-slate-200/80 p-1.5 flex flex-col items-center justify-center gap-1 shadow-2xs">
              <Icon className={`${large ? "w-6 h-6" : "w-4 h-4"} text-slate-500`} />
              <div className="h-1.5 w-2/3 bg-slate-200 rounded-xs" />
            </div>
          </div>
        );
      }
      return (
        <div className={`w-full h-full ${pad} flex items-center justify-center`}>
          <div className="w-full h-full bg-white rounded border border-slate-200/80 p-1.5 flex flex-col justify-center gap-1 shadow-2xs">
            <div className="h-2 w-2/3 bg-slate-500/75 rounded-xs" />
            <div className="h-1.5 w-full bg-slate-200 rounded-xs" />
            <div className="h-1.5 w-4/5 bg-slate-200 rounded-xs" />
          </div>
        </div>
      );
    }
  }
};

