import React from "react";
import { Paperclip } from "lucide-react";

import { getSlotBackdata, type VDocDocument, type VDocSlot } from "@vibe/vdoc-schema";

import { BackdataChunkCard } from "@/entities/backdata-chunk";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";

import { useToggleSlotBackdata } from "../model/useBindSlotBackdata";
import { AddBackdataChunkForm } from "./AddBackdataChunkForm";

export interface SlotBackdataSectionProps {
  doc: VDocDocument;
  slot: VDocSlot;
}

/** 인스펙터의 백데이터 영역: 이 슬롯에 연결된 청크 · 등록 양식 · 문서 전체 보관함(클릭해 연결/해제). */
export const SlotBackdataSection: React.FC<SlotBackdataSectionProps> = ({ doc, slot }) => {
  const formOpen = useWorkspaceLayoutStore((s) => s.backdataFormOpen);
  const setFormOpen = useWorkspaceLayoutStore((s) => s.setBackdataFormOpen);
  const toggleBackdataRef = useToggleSlotBackdata();
  const linked = getSlotBackdata(doc, slot);

  return (
    <>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5 text-indigo-600" />이 슬롯에 연결된 백데이터 ({linked.length}건)
          </h4>
          <button
            type="button"
            onClick={() => setFormOpen(!formOpen)}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
          >
            + 새 백데이터 추가
          </button>
        </div>

        {formOpen && <AddBackdataChunkForm targetSlotId={slot.slotId} />}

        {linked.length > 0 ? (
          <div className="space-y-2">
            {linked.map((chunk) => (
              <BackdataChunkCard key={chunk.chunkId} chunk={chunk} />
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-400">
            연결된 백데이터가 없습니다. 아래 전체 백데이터 보관함에서 클릭해 바인딩하세요.
          </div>
        )}
      </div>

      <div className="space-y-2 pt-3 border-t border-slate-200">
        <h4 className="text-xs font-bold text-slate-700">📚 문서 전체 백데이터 풀 (클릭하여 현재 슬롯에 연결/해제)</h4>
        <div className="space-y-1.5">
          {Object.values(doc.backdata).map((chunk) => {
            const isBound = slot.backDataRefs.includes(chunk.chunkId);
            return (
              <button
                key={chunk.chunkId}
                type="button"
                onClick={() => toggleBackdataRef(slot.slotId, chunk.chunkId)}
                className={`w-full text-left p-2.5 rounded-lg border text-xs transition cursor-pointer ${
                  isBound
                    ? "border-indigo-400 bg-indigo-50/60 text-indigo-950"
                    : "border-slate-200 hover:bg-slate-50 text-slate-600"
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span className="truncate">{chunk.sourceTitle}</span>
                  <span
                    className={`shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded ${
                      isBound ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {isBound ? "✓ 연결됨" : "+ 연결"}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 line-clamp-2 mt-1">{chunk.excerpt}</div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
