/**
 * v2 AI Composer — 미디어 첨부 (`+` · Ctrl+V · OS 드롭) · `@폴더` · `vf_*` FS 배치 Undo 단위/연동 테스트.
 *
 * - TC-F01: `attachFiles` — 이미지/텍스트/바이너리 업로드 API 연동, base64 · previewUrl · vaultPath 생성, 10MB 제한
 * - TC-F02: `@folder:` 카테고리 검색 · 퍼지 매칭 · 깊은 중첩 폴더(깊이 4+) 검색 & `resolve`
 * - TC-F03: `vaultPathContext` — 탐색기 폴더/이미지/일반파일/문서 드래그 변환 & 탐색기 다중선택 제안
 * - TC-F04: `@폴더` 핀 고정 (`pinnable`/`pinContext`/`isPinned`) <-> 설정바 `resourceFolders` 연동
 * - TC-F05: `scopeForSend` — `@폴더(참조)` 자동 마운트 + `@폴더(대상)` `workbench.targetFolders` 전달
 * - TC-F06: `AssistantClient.sendMessage` 와이어 직렬화 — `media` (`mimeType`/`dataBase64`/`vaultPath`) 전달, `previewUrl` 미포함
 * - TC-F07: SSE `fs_batches` 이벤트 -> `store.fsBatches` 적재 -> `undoFsBatch` API 호출 & `undone: true` 전이
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assignHandle, type ContextRef } from "@vibe/ai-kernel";
import { createV2AiWorkspace, folderRef, vaultPathContext } from "@vibe/ai-vault";
import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function makeFile(name: string, bytes: Uint8Array<ArrayBuffer> | string, type: string): File {
  return new File([bytes], name, { type });
}

function setup(fetchFn?: typeof fetch) {
  const rt = createIdeWorkbenchRuntime({ persist: false });
  const logs: Array<{ level: string; message: string }> = [];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const wrappedFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    if (fetchFn) return fetchFn(input, init);
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const ai = createV2AiWorkspace({
    vault: rt.vault,
    vaultRootPath: "C:/vaults/demo",
    layout: rt.layout,
    explorer: rt.explorer,
    vdocUiBridge: rt.vdocUiBridge,
    openVaultFile: (path, mode) => rt.openVaultFile(path, mode ?? "current"),
    getTextSelection: () => null,
    pushLog: (level, message) => logs.push({ level, message }),
    storage: null,
    fetchFn: wrappedFetch,
  });
  ai.start();
  return { rt, ai, logs, calls };
}

describe("v2 AI Composer — 미디어 첨부 · 디렉토리 조작 · FS 배치 연동", () => {
  it("TC-F01 attachFiles: 이미지·텍스트 업로드 API 연동 + base64/previewUrl 생성 + 10MB 제한", async () => {
    const { ai, calls, logs } = setup(async (input) => {
      const url = String(input);
      if (url.includes("/upload")) {
        return new Response(JSON.stringify({ path: "_attachments/shot.png", kind: "file" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    });

    const img = makeFile("shot.png", PNG_BYTES, "image/png");
    const note = makeFile("memo.md", "# 참고 메모\n핵심 수치 42", "text/markdown");
    const huge = {
      name: "huge.png",
      type: "image/png",
      size: 11 * 1024 * 1024,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as File;

    const refs = await ai.attachFiles([img, note, huge]);
    assert.equal(refs.length, 2);

    const imgRef = refs[0];
    assert.equal(imgRef.kind, "image");
    assert.equal(imgRef.media?.mimeType, "image/png");
    assert.equal(imgRef.media?.vaultPath, "_attachments/shot.png");
    assert.ok(imgRef.media?.dataBase64 && imgRef.media.dataBase64.length > 20);
    assert.ok(imgRef.media?.previewUrl?.startsWith("data:image/png;base64,"));
    assert.ok(imgRef.content?.includes("resource:vault:_attachments/shot.png"));

    const noteRef = refs[1];
    assert.equal(noteRef.kind, "file");
    assert.ok(noteRef.content?.includes("핵심 수치 42"));

    assert.ok(calls.some((c) => c.url.includes("/api/vaults/") && c.url.includes("/upload")));
    assert.ok(logs.some((l) => l.level === "warn" && l.message.includes("10MB")));
    ai.dispose();
  });

  it("TC-F02 @folder: 깊은 중첩 폴더 검색 · 퍼지 매칭 · resolve 역할별 트리 요약", () => {
    const { rt, ai } = setup();
    rt.vault.createFolder("Projects/2026/Q4/DesignAssets");
    rt.vault.createFile("Projects/2026/Q4/DesignAssets/logo.png", "");
    rt.vault.createFile("Projects/2026/Q4/DesignAssets/spec.md", "# Spec");

    // 깊이 4 폴더까지 @folder: 로 검색
    const folderHits = ai.runtime.contexts.search("folder:Design");
    assert.ok(folderHits.some((r) => r.kind === "folder" && r.meta?.path === "Projects/2026/Q4/DesignAssets"));
    assert.ok(folderHits.every((r) => r.kind === "folder"));

    // 퍼지 매칭 (약어 "dgn" -> DesignAssets)
    const fuzzyHits = ai.runtime.contexts.search("folder:dgn");
    assert.ok(fuzzyHits.some((r) => r.meta?.path === "Projects/2026/Q4/DesignAssets"));

    // @img: 볼트 이미지 검색
    const imgHits = ai.runtime.contexts.search("img:logo");
    assert.ok(imgHits.some((r) => r.kind === "image" && r.media?.vaultPath === "Projects/2026/Q4/DesignAssets/logo.png"));

    // resolve 시 target / reference 역할 반영
    const targetFolder: ContextRef = { ...folderRef(ai.env, "Projects/2026/Q4/DesignAssets"), role: "target" };
    const [resolved] = ai.runtime.contexts.resolve([targetFolder]);
    assert.ok(resolved.content?.includes("spec.md"));
    assert.ok(resolved.content?.includes("대상 폴더"));
    ai.dispose();
  });

  it("TC-F03 vaultPathContext & explorer-selection: 폴더 · 이미지 · 파일 드래그/선택 변환", () => {
    const { rt, ai } = setup();
    rt.vault.createFolder("Media/Hero");
    rt.vault.createFile("Media/Hero/banner.webp", "");
    rt.vault.createFile("Media/Hero/readme.md", "hello");

    const fRef = vaultPathContext(ai, "Media/Hero");
    assert.equal(fRef?.kind, "folder");
    assert.equal(fRef?.access, "write");
    assert.equal(assignHandle(fRef!, []), "@폴더1");

    const iRef = vaultPathContext(ai, "Media/Hero/banner.webp");
    assert.equal(iRef?.kind, "image");
    assert.equal(iRef?.media?.mimeType, "image/webp");
    assert.equal(assignHandle(iRef!, []), "@이미지1");

    const tRef = vaultPathContext(ai, "Media/Hero/readme.md");
    assert.equal(tRef?.kind, "file");

    // 탐색기 다중 선택(폴더 + 이미지) 시 제안 컨텍스트 생성
    rt.explorer.setState({ selectedPaths: new Set(["Media/Hero", "Media/Hero/banner.webp"]) });
    const suggested = ai.runtime.contexts.suggestedContexts();
    assert.ok(suggested.some((s) => s.kind === "folder" && s.meta?.path === "Media/Hero"));
    assert.ok(suggested.some((s) => s.kind === "image" && s.media?.vaultPath === "Media/Hero/banner.webp"));
    ai.dispose();
  });

  it("TC-F04 @폴더 핀 고정: pinnable/pinContext/isPinned <-> 설정바 resourceFolders 연동", () => {
    const { rt, ai } = setup();
    rt.vault.createFolder("Docs/Specs");
    const ref = folderRef(ai.env, "Docs/Specs");

    assert.equal(ai.pinnable(ref), true);
    assert.equal(ai.isPinned(ref), false);

    ai.pinContext(ref);
    assert.equal(ai.isPinned(ref), true);
    assert.ok(ai.store.getState().resourceFolders.includes("Docs/Specs"));

    ai.pinContext(ref);
    assert.equal(ai.isPinned(ref), false);
    assert.ok(!ai.store.getState().resourceFolders.includes("Docs/Specs"));
    ai.dispose();
  });

  it("TC-F05 scopeForSend: @폴더(참조) 자동 마운트 + @폴더(대상) workbench.targetFolders 전달", () => {
    const { rt, ai } = setup();
    rt.vault.createFolder("Workspace/TargetDir");
    rt.vault.createFolder("Workspace/RefDir");

    // 설정바 리소스를 꺼둔 상태여도 명시 `@폴더` 는 이번 턴 resource-mount 에 자동 포함돼야 함
    ai.store.getState().setSourcesOn(false);
    const refDir: ContextRef = { ...folderRef(ai.env, "Workspace/RefDir"), handle: "@폴더1", role: "reference" };
    const targetDir: ContextRef = { ...folderRef(ai.env, "Workspace/TargetDir"), handle: "@폴더2", role: "target" };

    const prepared = ai.scopeForSend("@폴더1 참고해서 @폴더2 정리해줘", [...ai.runtime.contexts.autoContexts(), refDir, targetDir]);

    const mount = prepared.find((c) => c.kind === "resource-mount");
    assert.ok(mount, "명시 @폴더가 resource-mount 를 생성해야 한다");
    const mountBody = JSON.parse(mount!.content!);
    const mountPaths = mountBody.roots.map((r: { path: string }) => r.path);
    assert.ok(mountPaths.includes("C:/vaults/demo/Workspace/RefDir"));
    assert.ok(mountPaths.includes("C:/vaults/demo/Workspace/TargetDir"));

    const wb = prepared.find((c) => c.kind === "workbench");
    assert.ok(wb, "workbench 컨텍스트가 포함돼야 한다");
    const wbBody = JSON.parse(wb!.content!);
    assert.deepEqual(wbBody.targetFolders, ["Workspace/TargetDir"]);
    ai.dispose();
  });

  it("TC-F06 AssistantClient 와이어 직렬화: media(mimeType/dataBase64/vaultPath) 전송, previewUrl 제외", async () => {
    let sentBody: Record<string, unknown> | null = null;
    const { ai } = setup(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/sessions")) {
        return new Response(JSON.stringify({ sessionId: "s-media", provider: "offline", model: "offline" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/messages")) {
        sentBody = JSON.parse(String(init?.body ?? "{}"));
        const sse = `data: ${JSON.stringify({ type: "turn_done", stopReason: "end_turn" })}\n\n`;
        return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      return new Response("{}", { status: 200 });
    });

    const imgCtx: ContextRef = {
      kind: "image",
      id: "vault:_attachments/shot.png",
      label: "shot.png",
      handle: "@이미지1",
      role: "reference",
      content: "[첨부 이미지] shot.png",
      media: {
        mimeType: "image/png",
        dataBase64: "AAAA",
        previewUrl: "data:image/png;base64,AAAA",
        vaultPath: "_attachments/shot.png",
      },
    };

    await ai.controller.send("@이미지1 봐줘", [imgCtx]);
    assert.ok(sentBody);
    const wireContexts = (sentBody as { contexts: Array<Record<string, unknown>> }).contexts;
    const wireImg = wireContexts.find((c) => c.kind === "image");
    assert.ok(wireImg);
    assert.equal(wireImg!.mimeType, "image/png");
    assert.equal(wireImg!.dataBase64, "AAAA");
    assert.equal(wireImg!.vaultPath, "_attachments/shot.png");
    assert.equal("previewUrl" in wireImg!, false);
    ai.dispose();
  });

  it("TC-F07 SSE fs_batches 이벤트 -> store 적재 -> undoFsBatch API 연동 & undone 상태 전이", async () => {
    const undoCalls: string[] = [];
    const { ai } = setup(async (input) => {
      const url = String(input);
      if (url.endsWith("/sessions")) {
        return new Response(JSON.stringify({ sessionId: "s-fs", provider: "offline", model: "offline" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/messages")) {
        const sse = [
          `data: ${JSON.stringify({ type: "text_delta", text: "폴더 정리 완료" })}\n\n`,
          `data: ${JSON.stringify({
            type: "fs_batches",
            batches: [{ batchId: "fsb-101", summary: "폴더 정리", opCount: 3, ops: ["mkdir a", "move b -> a/b"], createdAt: 1000, undone: false }],
          })}\n\n`,
          `data: ${JSON.stringify({ type: "turn_done", stopReason: "end_turn" })}\n\n`,
        ].join("");
        return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      if (url.includes("/fs-batches/fsb-101/undo")) {
        undoCalls.push(url);
        return new Response(JSON.stringify({ ok: true, batchId: "fsb-101", message: "복원 완료" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    });

    await ai.controller.send("폴더 정리해줘", []);
    assert.equal(ai.store.getState().fsBatches.length, 1);
    assert.equal(ai.store.getState().fsBatches[0].batchId, "fsb-101");
    assert.equal(ai.store.getState().fsBatches[0].undone, false);

    const res = await ai.undoFsBatch("fsb-101");
    assert.equal(res.ok, true);
    assert.equal(undoCalls.length, 1);
    assert.equal(ai.store.getState().fsBatches[0].undone, true);
    ai.dispose();
  });
});
