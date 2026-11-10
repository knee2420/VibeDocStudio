import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveCanvasShortcutAction, type CanvasShortcutContext } from "../src/features/command-bus/model/shortcutGuards";

const baseCtx = (overrides: Partial<CanvasShortcutContext> = {}): CanvasShortcutContext => ({
  key: "c",
  ctrlOrMeta: false,
  shiftKey: false,
  isEditingField: false,
  hasTextSelection: false,
  selectedBlockId: "blk_1",
  selectedSlotId: null,
  hasClipboardBlock: false,
  ...overrides,
});

describe("Canvas block shortcut guards", () => {
  it("allows Ctrl+C only when block is selected, no slot selected, and no text dragged", () => {
    assert.equal(resolveCanvasShortcutAction(baseCtx({ key: "c", ctrlOrMeta: true })), "copy-block");
    assert.equal(resolveCanvasShortcutAction(baseCtx({ key: "C", ctrlOrMeta: true })), "copy-block");

    // StaticSlotView 등에서 텍스트를 드래그 선택했다면 가로채지 않는다
    assert.equal(
      resolveCanvasShortcutAction(baseCtx({ key: "c", ctrlOrMeta: true, hasTextSelection: true })),
      null
    );

    // 슬롯 편집/선택 상태에서는 가로채지 않는다
    assert.equal(
      resolveCanvasShortcutAction(baseCtx({ key: "c", ctrlOrMeta: true, selectedSlotId: "slot_1", selectedBlockId: null })),
      null
    );

    // 입력 필드 포커스 중에는 가로채지 않는다
    assert.equal(
      resolveCanvasShortcutAction(baseCtx({ key: "c", ctrlOrMeta: true, isEditingField: true })),
      null
    );
  });

  it("allows Ctrl+V when clipboard has a block and no slot/text selection is active", () => {
    assert.equal(
      resolveCanvasShortcutAction(baseCtx({ key: "v", ctrlOrMeta: true, hasClipboardBlock: true })),
      "paste-block"
    );
    assert.equal(
      resolveCanvasShortcutAction(
        baseCtx({ key: "v", ctrlOrMeta: true, selectedBlockId: null, hasClipboardBlock: true })
      ),
      "paste-block"
    );
    assert.equal(
      resolveCanvasShortcutAction(baseCtx({ key: "v", ctrlOrMeta: true, hasClipboardBlock: false })),
      null
    );
    assert.equal(
      resolveCanvasShortcutAction(
        baseCtx({ key: "v", ctrlOrMeta: true, hasClipboardBlock: true, selectedSlotId: "slot_1" })
      ),
      null
    );
  });

  it("triggers block deletion strictly on Delete key (never Backspace)", () => {
    assert.equal(resolveCanvasShortcutAction(baseCtx({ key: "Delete" })), "delete-block");

    // Backspace 는 절대 블록 삭제를 트리거하지 않는다
    assert.equal(resolveCanvasShortcutAction(baseCtx({ key: "Backspace" })), null);

    // 텍스트 선택 중이거나 입력 중이면 Delete 도 차단한다
    assert.equal(resolveCanvasShortcutAction(baseCtx({ key: "Delete", hasTextSelection: true })), null);
    assert.equal(resolveCanvasShortcutAction(baseCtx({ key: "Delete", isEditingField: true })), null);
    assert.equal(
      resolveCanvasShortcutAction(baseCtx({ key: "Delete", selectedSlotId: "slot_1", selectedBlockId: null })),
      null
    );
  });
});

