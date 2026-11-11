import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createKeyLayerBus, KEY_LAYER_ORDER, type KeyLayerEventLike } from "../src/features/command-bus/model/keyLayers";
import {
  resolveCanvasShortcutAction,
  resolveEscapeAction,
  type CanvasShortcutContext,
  type EscapeContext,
} from "../src/features/command-bus/model/shortcutGuards";

const baseCtx = (overrides: Partial<CanvasShortcutContext> = {}): CanvasShortcutContext => ({
  key: "c",
  ctrlOrMeta: false,
  shiftKey: false,
  isEditingField: false,
  hasTextSelection: false,
  selectedBlockId: "blk_1",
  selectedSlotId: null,
  hasClipboardBlock: false,
  hasRangeSelection: false,
  ...overrides,
});

const baseEscCtx = (overrides: Partial<EscapeContext> = {}): EscapeContext => ({
  isAiRunning: false,
  shortcutHelpOpen: false,
  composerOpenSlotId: null,
  hasTableOverlay: false,
  isRangeBarExpanded: false,
  hasRangeSelection: false,
  hasBlockMenuOpen: false,
  selectedSlotId: null,
  selectedBlockId: null,
  hasHistoryMessage: false,
  ...overrides,
});

const fakeKeyEvent = (key: string, opts: Partial<KeyLayerEventLike> = {}): KeyLayerEventLike => {
  const ev: KeyLayerEventLike = {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    defaultPrevented: false,
    preventDefault() {
      ev.defaultPrevented = true;
    },
    ...opts,
  };
  return ev;
};

describe("Canvas block shortcut guards", () => {
  it("allows Ctrl+C only when block is selected, no slot selected, no range selected, and no text dragged", () => {
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

    // 다중 칸 범위 선택 상태에서는 가로채지 않는다
    assert.equal(
      resolveCanvasShortcutAction(baseCtx({ key: "c", ctrlOrMeta: true, hasRangeSelection: true })),
      null
    );

    // 입력 필드 포커스 중에는 가로채지 않는다
    assert.equal(
      resolveCanvasShortcutAction(baseCtx({ key: "c", ctrlOrMeta: true, isEditingField: true })),
      null
    );
  });

  it("allows Ctrl+V when clipboard has a block and no slot/text selection is active (including after range copy)", () => {
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
    // 다중 범위 선택 직후에도 Ctrl+V 블록 붙여넣기를 허용한다 (단, 범위 Ctrl+C/Delete 는 rangeSelection 계층 담당)
    assert.equal(
      resolveCanvasShortcutAction(
        baseCtx({ key: "v", ctrlOrMeta: true, selectedBlockId: null, hasClipboardBlock: true, hasRangeSelection: true })
      ),
      "paste-block"
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

  it("resolves Escape in exact hierarchy: overlays/table/range -> edit-to-block -> clear block selection", () => {
    // 1. 칸 편집 중 Esc → 소유 블록 선택
    assert.equal(
      resolveEscapeAction(baseEscCtx({ selectedSlotId: "slot_1" })),
      "select-owner-block"
    );

    // 2. 블록 선택 중 Esc → 선택 해제
    assert.equal(
      resolveEscapeAction(baseEscCtx({ selectedBlockId: "blk_1" })),
      "clear-block-selection"
    );

    // 3. 표 범위/메뉴가 켜져 있으면 블록/칸보다 표가 먼저
    assert.equal(
      resolveEscapeAction(baseEscCtx({ hasTableOverlay: true, selectedSlotId: "slot_1", selectedBlockId: "blk_tbl" })),
      "close-table"
    );

    // 4. 범위 AI 바가 펼쳐져 있거나 범위 선택이 있으면 그쪽이 먼저
    assert.equal(
      resolveEscapeAction(baseEscCtx({ isRangeBarExpanded: true, hasRangeSelection: true, selectedSlotId: "slot_1" })),
      "collapse-range-bar"
    );
    assert.equal(
      resolveEscapeAction(baseEscCtx({ hasRangeSelection: true, selectedBlockId: "blk_1" })),
      "clear-range"
    );

    // 5. 블록 메뉴 열림은 블록 선택 해제보다 먼저
    assert.equal(
      resolveEscapeAction(baseEscCtx({ hasBlockMenuOpen: true, selectedBlockId: "blk_1" })),
      "close-block-menu"
    );

    // 6. 실행 중 AI / 도움말 / 인라인 작성기는 최우선
    assert.equal(resolveEscapeAction(baseEscCtx({ isAiRunning: true, selectedSlotId: "slot_1" })), "abort-ai");
    assert.equal(resolveEscapeAction(baseEscCtx({ shortcutHelpOpen: true, selectedBlockId: "blk_1" })), "close-help");
    assert.equal(resolveEscapeAction(baseEscCtx({ composerOpenSlotId: "slot_1", selectedSlotId: "slot_1" })), "close-composer");
  });
});

describe("Command-bus keyLayers priority dispatcher", () => {
  it("dispatches strictly in editor -> table -> rangeSelection -> canvas -> global order and stops when handled", () => {
    const bus = createKeyLayerBus();
    const calls: string[] = [];

    assert.deepEqual(KEY_LAYER_ORDER, ["editor", "table", "rangeSelection", "canvas", "global"]);

    bus.register("global", () => {
      calls.push("global");
      return true;
    });
    bus.register("canvas", () => {
      calls.push("canvas");
      return false;
    });
    bus.register("rangeSelection", (e) => {
      calls.push("rangeSelection");
      if (e.key === "c" && e.ctrlKey) return true;
      return false;
    });
    bus.register("table", () => {
      calls.push("table");
      return false;
    });
    bus.register("editor", () => {
      calls.push("editor");
      return false;
    });

    const winner = bus.dispatch(fakeKeyEvent("c", { ctrlKey: true }));
    assert.equal(winner, "rangeSelection");
    assert.deepEqual(calls, ["editor", "table", "rangeSelection"]);
  });

  it("evaluates LIFO within the same layer and respects preventDefault()", () => {
    const bus = createKeyLayerBus();
    const calls: string[] = [];

    bus.register("canvas", () => {
      calls.push("canvas-base");
      return true;
    });
    const offMenu = bus.register("canvas", (e) => {
      calls.push("canvas-menu");
      e.preventDefault();
    });

    const winner1 = bus.dispatch(fakeKeyEvent("Escape"));
    assert.equal(winner1, "canvas");
    assert.deepEqual(calls, ["canvas-menu"]);

    offMenu();
    calls.length = 0;

    const winner2 = bus.dispatch(fakeKeyEvent("Escape"));
    assert.equal(winner2, "canvas");
    assert.deepEqual(calls, ["canvas-base"]);
  });
});
