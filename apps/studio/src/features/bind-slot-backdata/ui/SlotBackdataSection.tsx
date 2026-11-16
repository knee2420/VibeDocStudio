import React from "react";
import { Check, Plus } from "lucide-react";

import { getSlotBackdata, type VDocDocument, type VDocSlot } from "@vibe/vdoc-schema";

import { BackdataChunkCard } from "@/entities/backdata-chunk";
import { useWorkspaceLayoutStore } from "@/entities/workspace-layout";

import { useToggleSlotBackdata } from "../model/useBindSlotBackdata";
import { AddBackdataChunkForm } from "./AddBackdataChunkForm";

export interface SlotBackdataSectionProps {
  doc: VDocDocument;
  slot: VDocSlot;
}

/**
 * 인스펙터의 백데이터 구역 (피그마 디자인 패널 구역 모양): 이 슬롯에 연결된 청크 · 등록 양식 ·
 * 문서 전체 보관함(클릭해 연결/해제). 동작은 예전과 같다.
 */
export const SlotBackdataSection: React.FC<SlotBackdataSectionProps> = ({ doc, slot }) => {
  const formOpen = useWorkspaceLayoutStore((s) => s.backdataFormOpen);
  const setFormOpen = useWorkspaceLayoutStore((s) => s.setBackdataFormOpen);
  const toggleBackdataRef = useToggleSlotBackdata();
  const linked = getSlotBackdata(doc, slot);
  const pool = Object.values(doc.backdata);

  return (
    <>
      <div className="fig-dsec" data-testid="slot-backdata-section">
        <div className="fig-dsec-head">
          <span>
            연결된 백데이터 <span className="fig-section-meta">{linked.length}</span>
          </span>
          <div className="fig-dsec-actions">
            <button
              type="button"
              data-testid="add-backdata-btn"
              aria-pressed={formOpen}
              onClick={() => setFormOpen(!formOpen)}
              title="새 백데이터 추가"
              className="fig-icon-btn"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {formOpen && <AddBackdataChunkForm targetSlotId={slot.slotId} />}

        {linked.length > 0 ? (
          <div className="-mx-2">
            {linked.map((chunk) => (
              <BackdataChunkCard key={chunk.chunkId} chunk={chunk} />
            ))}
          </div>
        ) : (
          <div className="fig-empty">연결된 백데이터가 없습니다. 아래 보관함에서 클릭해 연결하세요.</div>
        )}
      </div>

      <div className="fig-dsec" data-testid="doc-backdata-pool">
        <div className="fig-dsec-head">
          <span>
            문서 백데이터 보관함 <span className="fig-section-meta">{pool.length}</span>
          </span>
        </div>
        <p className="fig-desc mb-1.5">클릭하면 현재 슬롯에 연결 · 해제됩니다.</p>
        {pool.length > 0 ? (
          <div className="-mx-2">
            {pool.map((chunk) => {
              const isBound = slot.backDataRefs.includes(chunk.chunkId);
              return (
                <button
                  key={chunk.chunkId}
                  type="button"
                  aria-pressed={isBound}
                  onClick={() => toggleBackdataRef(slot.slotId, chunk.chunkId)}
                  title={isBound ? "연결 해제" : "현재 슬롯에 연결"}
                  className="fig-list-row"
                >
                  <span
                    className={`mt-px w-3.5 h-3.5 shrink-0 rounded-[3px] flex items-center justify-center ${
                      isBound ? "bg-[#0d99ff] text-white" : "border border-black/25"
                    }`}
                  >
                    {isBound && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{chunk.sourceTitle}</span>
                    <span className="block text-black/50 line-clamp-2 leading-4">{chunk.excerpt}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="fig-empty">이 문서에 등록된 백데이터가 없습니다. 위 + 로 원천 자료를 등록하세요.</div>
        )}
      </div>
    </>
  );
};
