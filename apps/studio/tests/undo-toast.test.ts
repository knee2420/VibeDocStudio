import assert from "node:assert/strict";
import { test } from "node:test";

import { useHistoryStore } from "../src/shared/lib/history";

const noop = () => {};
const typing = { label: "슬롯 내용 수정", scope: "document" as const, coalesceKey: "slot-content:s1", undo: noop, redo: noop };
const deleteBlock = { label: "블록 삭제", scope: "document" as const, undo: noop, redo: noop };

test("글자 입력(연속 편집)은 되돌리기 안내를 띄우지 않고, 큰 변경은 띄운다", async () => {
  const h = useHistoryStore.getState();
  h.push(typing);
  h.push(typing);
  assert.equal(useHistoryStore.getState().lastMessage, null);
  assert.equal(useHistoryStore.getState().past.length, 1); // 그래도 하나로 묶여 Ctrl+Z 로 되돌릴 수 있다

  h.push(deleteBlock);
  assert.equal(useHistoryStore.getState().lastMessage, "블록 삭제");

  // 이어서 치면 떠 있던 안내는 닫힌다 (이제 되돌리기는 방금 친 글을 되돌리므로)
  h.push(typing);
  assert.equal(useHistoryStore.getState().lastMessage, null);

  await useHistoryStore.getState().undo(); // 타이핑 되돌림 — 조용히
  assert.equal(useHistoryStore.getState().lastMessage, null);
  await useHistoryStore.getState().undo(); // 블록 삭제 되돌림 — 안내
  assert.equal(useHistoryStore.getState().lastMessage, "되돌림: 블록 삭제");
});
