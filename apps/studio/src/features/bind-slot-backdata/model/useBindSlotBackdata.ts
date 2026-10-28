import { useState } from "react";

import type { BackdataChunk } from "@vibe/vdoc-schema";

import { useSlotSelectionStore } from "@/entities/slot";
import { useStudioDocumentStore } from "@/entities/vdoc-document";

import { backdataApi } from "../api/backdataApi";

export function useBindSlotBackdata() {
  const updateCurrentDoc = useStudioDocumentStore((s) => s.updateCurrentDoc);
  const selectedSlotId = useSlotSelectionStore((s) => s.selectedSlotId);
  const setShowAddBackdataForm = useSlotSelectionStore(
    (s) => s.setShowAddBackdataForm
  );

  const [newBackdataTitle, setNewBackdataTitle] = useState("");
  const [newBackdataExcerpt, setNewBackdataExcerpt] = useState("");

  const toggleBackdataRef = (slotId: string, chunkId: string) => {
    updateCurrentDoc((prev) => {
      const slot = prev.slots[slotId];
      if (!slot) return prev;
      const exists = slot.backDataRefs.includes(chunkId);
      const nextRefs = exists
        ? slot.backDataRefs.filter((id) => id !== chunkId)
        : [...slot.backDataRefs, chunkId];
      return {
        ...prev,
        slots: {
          ...prev.slots,
          [slotId]: {
            ...slot,
            backDataRefs: nextRefs,
          },
        },
      };
    });
  };

  const registerAndBindBackdata = async () => {
    const cleanTitle = newBackdataTitle.trim();
    const cleanExcerpt = newBackdataExcerpt.trim();
    if (!cleanTitle || !cleanExcerpt) return;

    let createdChunks: BackdataChunk[] = [];
    try {
      const apiRes = await backdataApi.importRawBackdata({
        source_title: cleanTitle,
        source_type: "markdown",
        raw_text: cleanExcerpt,
        tags: ["수동임포트", "백데이터"],
      });
      createdChunks = apiRes.chunks;
    } catch {
      const chunkId = `bd_custom_${Date.now().toString(36)}`;
      createdChunks = [
        {
          chunkId,
          sourceTitle: cleanTitle,
          sourceType: "markdown",
          excerpt: cleanExcerpt,
          updatedAt: new Date().toISOString().slice(0, 10),
          tags: ["수동임포트", "백데이터"],
        },
      ];
    }

    updateCurrentDoc((prev) => {
      const nextBackdata = { ...prev.backdata };
      const nextSlots = { ...prev.slots };
      const newIds: string[] = [];

      for (const ch of createdChunks) {
        nextBackdata[ch.chunkId] = ch;
        newIds.push(ch.chunkId);
      }

      if (selectedSlotId && nextSlots[selectedSlotId]) {
        nextSlots[selectedSlotId] = {
          ...nextSlots[selectedSlotId],
          backDataRefs: [
            ...nextSlots[selectedSlotId].backDataRefs,
            ...newIds,
          ],
        };
      }

      return {
        ...prev,
        backdata: nextBackdata,
        slots: nextSlots,
      };
    });

    setNewBackdataTitle("");
    setNewBackdataExcerpt("");
    setShowAddBackdataForm(false);
  };

  return {
    newBackdataTitle,
    setNewBackdataTitle,
    newBackdataExcerpt,
    setNewBackdataExcerpt,
    toggleBackdataRef,
    registerAndBindBackdata,
  };
}

