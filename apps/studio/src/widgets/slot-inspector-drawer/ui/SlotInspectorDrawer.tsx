import React from "react";
import { ChevronLeft, ChevronRight, Paperclip } from "lucide-react";

import type { BackdataChunk, VDocSlot } from "@vibe/vdoc-schema";

import { BackdataChunkCard } from "@/entities/backdata-chunk";
import { SlotMetadataCard, useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";
import {
  AddBackdataChunkForm,
  useBindSlotBackdata,
} from "@/features/bind-slot-backdata";
import { useSlotContentActions } from "@/features/edit-slot-richtext";

export const SlotInspectorDrawer: React.FC = () => {
  const docs = useStudioDocumentStore((s) => s.docs);
  const activeDocId = useStudioDocumentStore((s) => s.activeDocId);

  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const rightSidebarOpen = useSlotSelectionStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useSlotSelectionStore(
    (s) => s.setRightSidebarOpen
  );
  const showAddBackdataForm = useSlotSelectionStore(
    (s) => s.showAddBackdataForm
  );
  const setShowAddBackdataForm = useSlotSelectionStore(
    (s) => s.setShowAddBackdataForm
  );
  const toggleComposerForSlot = useSlotSelectionStore(
    (s) => s.toggleComposerForSlot
  );

  const { toggleSlotLock } = useSlotContentActions();
  const { toggleBackdataRef } = useBindSlotBackdata();

  const doc = docs.find((d) => d.docId === activeDocId) || docs[0];
  if (!doc) return null;

  const selectedSlot: VDocSlot | undefined = selectedSlotId
    ? doc.slots[selectedSlotId]
    : undefined;
  const selectedSlotChunks: BackdataChunk[] = (
    selectedSlot?.backDataRefs || []
  )
    .map((id) => doc.backdata[id])
    .filter(Boolean);

  if (!rightSidebarOpen) {
    return (
      <button
        type="button"
        onClick={() => setRightSidebarOpen(true)}
        className="absolute right-3 top-3 z-20 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-600 hover:text-slate-900 cursor-pointer"
        title="우측 Slot Inspector & 백데이터 서랍 열기"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
    );
  }

  return (
    <aside className="w-[360px] bg-white border-l border-slate-200 flex flex-col shrink-0 select-none">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-slate-900">
            Slot Inspector & 백데이터 서랍
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            선택한 슬롯의 제약 조건 및 근거 원문(Grounding)
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRightSidebarOpen(false)}
          className="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer"
          title="우측 패널 접기"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {selectedSlot ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <SlotMetadataCard
            slot={selectedSlot}
            onToggleLock={toggleSlotLock}
            onToggleComposer={toggleComposerForSlot}
          />

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-indigo-600" />이 슬롯에
                연결된 백데이터 ({selectedSlotChunks.length}건)
              </h4>
              <button
                type="button"
                onClick={() => setShowAddBackdataForm(!showAddBackdataForm)}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                + 새 백데이터 추가
              </button>
            </div>

            {showAddBackdataForm && <AddBackdataChunkForm />}

            {selectedSlotChunks.length > 0 ? (
              <div className="space-y-2">
                {selectedSlotChunks.map((chunk) => (
                  <BackdataChunkCard key={chunk.chunkId} chunk={chunk} />
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-400">
                연결된 백데이터가 없습니다. 아래 전체 백데이터 보관함에서 클릭해
                바인딩하세요.
              </div>
            )}
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-200">
            <h4 className="text-xs font-bold text-slate-700">
              📚 문서 전체 백데이터 풀 (클릭하여 현재 슬롯에 연결/해제)
            </h4>
            <div className="space-y-1.5">
              {Object.values(doc.backdata).map((chunk) => {
                const isBound = selectedSlot.backDataRefs.includes(
                  chunk.chunkId
                );
                return (
                  <button
                    key={chunk.chunkId}
                    type="button"
                    onClick={() =>
                      toggleBackdataRef(selectedSlot.slotId, chunk.chunkId)
                    }
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
                          isBound
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {isBound ? "✓ 연결됨" : "+ 연결"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                      {chunk.excerpt}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center text-xs text-slate-400">
          중앙 캔버스에서 슬롯을 클릭하면 해당 슬롯의 백데이터와 제약 설정이
          즉시 표시됩니다.
        </div>
      )}
    </aside>
  );
};

