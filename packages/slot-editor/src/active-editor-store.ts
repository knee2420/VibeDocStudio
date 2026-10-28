import { create } from "zustand";
import type { Editor } from "@tiptap/react";

interface ActiveSlotEditorState {
  activeSlotId: string | null;
  activeEditor: Editor | null;
  setActiveSlotEditor: (slotId: string | null, editor: Editor | null) => void;
}

export const useActiveSlotEditorStore = create<ActiveSlotEditorState>((set) => ({
  activeSlotId: null,
  activeEditor: null,
  setActiveSlotEditor: (slotId, editor) =>
    set({ activeSlotId: slotId, activeEditor: editor }),
}));

