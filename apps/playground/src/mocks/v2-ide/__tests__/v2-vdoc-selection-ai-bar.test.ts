import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { anchorLabel } from "@vibe/ai-kernel";
import { createV2AiWorkspace } from "@vibe/ai-vault";
import { createDefaultVDoc, serializeOutlineJson, serializeVDocJson, type OutlineFilePayload } from "@vibe/vault-formats";
import type { VDocDocument } from "@vibe/vdoc-schema";

import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";
import {
  VDOC_QUICK_DIRECT_ACTIONS,
  resolveVDocSelectionTarget,
} from "../ui/VDocSelectionAiBar";

function buildSampleDoc(): VDocDocument {
  const doc = createDefaultVDoc("타임라인 테스트");
  return {
    ...doc,
    pages: [
      {
        pageId: "p1",
        pageNumber: 1,
        pageLabel: "1섹션",
        headerSlotId: "h1",
        footerSlotId: "f1",
        blocks: [
          { blockId: "b1", kind: "heading", title: "제목", slotId: "s1", level: 1 },
          { blockId: "b2", kind: "text", title: "첫 번째 항목", slotId: "s2" },
          { blockId: "b3", kind: "text", title: "두 번째 항목", slotId: "s3" },
        ],
      },
    ],
    slots: {
      h1: { slotId: "h1", label: "머리글", role: "editable-slot", content: "", backDataRefs: [] },
      f1: { slotId: "f1", label: "바닥글", role: "editable-slot", content: "", backDataRefs: [] },
      s1: { slotId: "s1", label: "제목", role: "editable-slot", content: "<h1>부상 발생 및 전개 타임라인</h1>", backDataRefs: [] },
      s2: { slotId: "s2", label: "첫 번째 항목", role: "editable-slot", content: "<p>후반 25분경 크로스 처리 중 충돌 발생</p>", backDataRefs: [] },
      s3: { slotId: "s3", label: "두 번째 항목", role: "editable-slot", content: "<p>정밀 검진 결과 수술 회피 확인</p>", backDataRefs: [] },
    },
  };
}

describe("VDocSelectionAiBar — 점 세 개(⋯) 인라인 AI UI + AI Direct 엔진 연동", () => {
  it("다중 블록 선택 · 단일 슬롯 선택 · 빈 선택을 정확한 unitIds 와 라벨로 해석한다", () => {
    const doc = buildSampleDoc();

    const multi = resolveVDocSelectionTarget(
      doc,
      {
        items: [
          { id: "b1", kind: "block", blockId: "b1", pageId: "p1" },
          { id: "b2", kind: "block", blockId: "b2", pageId: "p1" },
          { id: "b3", kind: "block", blockId: "b3", pageId: "p1" },
        ],
        primaryKey: "block:b1",
        anchorKey: "block:b1",
      },
      null,
      "b1",
      "p1"
    );
    assert.ok(multi);
    assert.deepEqual(multi.unitIds, ["b1", "b2", "b3"]);
    assert.deepEqual(multi.blockIds, ["b1", "b2", "b3"]);
    assert.equal(multi.countLabel, "블록 3개");
    assert.equal(multi.canDelete, true);
    assert.match(multi.plainText, /부상 발생 및 전개 타임라인/);
    assert.match(multi.plainText, /정밀 검진 결과 수술 회피 확인/);

    const singleSlot = resolveVDocSelectionTarget(doc, null, "s2", null, "p1");
    assert.ok(singleSlot);
    assert.deepEqual(singleSlot.unitIds, ["s2"]);
    assert.deepEqual(singleSlot.slotIds, ["s2"]);
    assert.equal(singleSlot.countLabel, "1칸");
    assert.equal(singleSlot.canDelete, false);
    assert.equal(singleSlot.plainText, "후반 25분경 크로스 처리 중 충돌 발생");

    assert.equal(resolveVDocSelectionTarget(doc, null, null, null, "p1"), null);
    assert.ok(VDOC_QUICK_DIRECT_ACTIONS.length >= 4);
  });

  it("분할 탭에서 다른 파일(.outline)이 활성 탭이어도 명시적 vdoc 기준점으로 AI Direct 백그라운드 세션을 생성한다", () => {
    const rt = createIdeWorkbenchRuntime({ persist: false });
    const vdocPath = "01. Architecture/타임라인.vdoc";
    const outlinePath = "01. Architecture/메모.outline";
    const doc = buildSampleDoc();
    rt.vault.createFile(vdocPath, serializeVDocJson(doc));
    const ol: OutlineFilePayload = {
      version: 1,
      id: "ol-split-test",
      title: "메모",
      defaultView: "bullets",
      rootNodes: [{ id: "n1", text: "항목 1", isFolded: false, children: [] }],
    };
    rt.vault.createFile(outlinePath, serializeOutlineJson(ol));
    rt.openVaultFile(outlinePath, "current");

    const opened: string[] = [];
    const ai = createV2AiWorkspace({
      vault: rt.vault,
      vaultRootPath: "C:/vaults/demo",
      layout: rt.layout,
      explorer: rt.explorer,
      vdocUiBridge: rt.vdocUiBridge,
      docs: rt.docs,
      openVaultFile: (p, mode) => {
        opened.push(p);
        rt.openVaultFile(p, mode ?? "current");
      },
      getTextSelection: () => null,
      getEditorSelection: () => null,
      pushLog: () => undefined,
      storage: null,
      fetchFn: (async () => new Response(JSON.stringify({ sessionId: "srv-1", provider: "fake", model: "m" }), { status: 200 })) as typeof fetch,
    });
    ai.start();

    try {
      const target = resolveVDocSelectionTarget(
        doc,
        {
          items: [
            { id: "b1", kind: "block", blockId: "b1", pageId: "p1" },
            { id: "b2", kind: "block", blockId: "b2", pageId: "p1" },
          ],
          primaryKey: "block:b1",
          anchorKey: "block:b1",
        },
        null,
        "b1",
        "p1"
      );
      assert.ok(target);

      const explicit = {
        surface: "vdoc" as const,
        path: vdocPath,
        itemIds: [...target.unitIds],
        label: anchorLabel(vdocPath, target.unitIds.length, "칸"),
      };
      const entry = ai.sendAnchored("vdoc", "핵심 요약 문단으로 다듬어줘", explicit);
      assert.ok(entry, "활성 탭이 .outline 이어도 명시적 vdoc 기준점으로 AI Direct 세션이 생성되어야 함");
      assert.equal(entry.kind, "anchored");
      assert.equal(entry.anchor?.surface, "vdoc");
      assert.equal(entry.anchor?.path, vdocPath);
      assert.deepEqual(entry.anchor?.itemIds, ["b1", "b2"]);
      assert.deepEqual(opened, [], "AI Direct 는 현재 활성 탭이나 포커스를 뺏지 않아야 함");
    } finally {
      ai.dispose();
    }
  });
});
