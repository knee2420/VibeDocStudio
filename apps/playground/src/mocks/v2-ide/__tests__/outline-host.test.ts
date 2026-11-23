import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createOutlineEditorStore } from "@vibe/outliner/editor";
import { MemoryVaultAdapter } from "@vibe/vault-core";

import { createDefaultOutlineJson, parseOutlineJson } from "../model/outlineCodec";
import { attachmentNameFor, createVaultOutlineFiles } from "../model/outlineFileHost";
import { tokenizeOutlineInline } from "../model/outlineLiveRenderer";
import { createIdeWorkbenchRuntime } from "../model/useIdeWorkbench";
import { createOutlineFileSession } from "../ui/OutlineTabEditor";

const PATH = "plan.outline";

function setup(rootNodes: unknown[]) {
  const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
  vault.createFile(PATH, JSON.stringify({ version: 1, id: "o", title: "plan", defaultView: "bullets", rootNodes }));
  const session = createOutlineFileSession(vault, PATH, "plan");
  const store = createOutlineEditorStore({
    getRoots: () => session.snapshot().rootNodes,
    commitRoots: (roots) => session.write({ ...session.snapshot(), rootNodes: roots }),
    setDefaultView: (view) => session.write({ ...session.snapshot(), defaultView: view }),
  });
  return { vault, session, store };
}

const twoBullets = [
  { id: "a", text: "A", children: [] },
  { id: "b", text: "B", children: [] },
];

describe("outline tab host ↔ @vibe/outliner store", () => {
  it("keeps the same roots object while the file is unchanged", () => {
    const { session } = setup(twoBullets);
    assert.equal(session.snapshot(), session.snapshot());
    assert.equal(session.snapshot().rootNodes, session.snapshot().rootNodes);
  });

  it("undo and redo work across edits saved to the vault", () => {
    const { vault, store } = setup(twoBullets);
    assert.equal(store.getState().indent("b"), true);
    assert.equal(parseOutlineJson(vault.read(PATH), "").rootNodes[0].children[0]?.id, "b");

    assert.equal(store.getState().canUndo(), true);
    assert.equal(store.getState().undo(), true);
    const afterUndo = parseOutlineJson(vault.read(PATH), "").rootNodes;
    assert.deepEqual(afterUndo.map((n) => n.id), ["a", "b"]);

    assert.equal(store.getState().redo(), true);
    assert.equal(parseOutlineJson(vault.read(PATH), "").rootNodes[0].children[0]?.id, "b");
  });

  it("an edit from elsewhere (another pane/window) replaces the tree and drops stale undo history", () => {
    const { vault, store } = setup(twoBullets);
    store.getState().indent("b");
    vault.write(
      PATH,
      JSON.stringify({ version: 1, id: "o", title: "plan", defaultView: "bullets", rootNodes: [{ id: "z", text: "Z", children: [] }] })
    );
    assert.deepEqual(store.getState().getRoots().map((n) => n.id), ["z"]);
    assert.equal(store.getState().canUndo(), false);
  });
});

describe(".outline files in the workbench", () => {
  it("a new outline starts with its file name as title and one empty bullet", () => {
    const payload = parseOutlineJson(createDefaultOutlineJson("회의 메모"), "");
    assert.equal(payload.title, "회의 메모");
    assert.equal(payload.rootNodes.length, 1);
    assert.equal(payload.rootNodes[0].text, "");
  });

  it("renaming the file renames the title unless the title was changed by hand", () => {
    const rt = createIdeWorkbenchRuntime({ persist: false });
    rt.vault.createFile("Untitled.outline", createDefaultOutlineJson("Untitled"));
    rt.vault.rename("Untitled.outline", "주간 계획.outline");
    assert.equal(parseOutlineJson(rt.vault.read("주간 계획.outline"), "").title, "주간 계획");

    const custom = parseOutlineJson(rt.vault.read("주간 계획.outline"), "");
    rt.vault.write("주간 계획.outline", JSON.stringify({ ...custom, title: "내가 정한 제목" }));
    rt.vault.rename("주간 계획.outline", "다른 이름.outline");
    assert.equal(parseOutlineJson(rt.vault.read("다른 이름.outline"), "").title, "내가 정한 제목");
    rt.dispose();
  });
});

describe("outline attachments host", () => {
  function vaultWithUploads() {
    const vault = new MemoryVaultAdapter({ persistDebounceMs: 0 });
    vault.createFile("notes/plan.outline", createDefaultOutlineJson("plan"));
    vault.createFile("notes/spec.md", "# spec");
    const uploads: { folder: string; names: string[] }[] = [];
    Object.assign(vault, {
      getBinaryUrl: (p: string) => `/raw?path=${encodeURIComponent(p)}`,
      importBinaryFiles: async (folder: string, _files: readonly Blob[], names: readonly string[] = []) => {
        uploads.push({ folder, names: [...names] });
        return names.map((n) => {
          const path = `${folder}/${n}`;
          vault.createFile(path, "");
          return path;
        });
      },
    });
    const opened: string[] = [];
    const files = createVaultOutlineFiles({
      vault,
      getOutlinePath: () => "notes/plan.outline",
      openFile: (p) => opened.push(p),
    });
    return { vault, files, uploads, opened };
  }

  it("stores dropped/pasted files next to the outline and returns their vault paths", async () => {
    const { files, uploads } = vaultWithUploads();
    const pdf = new File([new Uint8Array([37, 80, 68, 70])], "brief.pdf", { type: "application/pdf" });
    const targets = await files.importFiles([pdf]);
    assert.deepEqual(targets, ["notes/attachments/brief.pdf"]);
    assert.equal(uploads[0].folder, "notes/attachments");
  });

  it("gives clipboard captures a unique time-stamped name", () => {
    const shot = new File([new Uint8Array([1])], "image.png", { type: "image/png" });
    assert.equal(attachmentNameFor(shot, new Date(2026, 10, 20, 9, 5, 7)), "Pasted image 20261120090507.png");
    const named = new File([new Uint8Array([1])], "diagram.png", { type: "image/png" });
    assert.equal(attachmentNameFor(named), "diagram.png");
  });

  it("draws vault files through the raw URL, keeps web URLs, and opens vault files in a tab", async () => {
    const { files, opened } = vaultWithUploads();
    const [path] = await files.importFiles([new File([new Uint8Array([1])], "a.png", { type: "image/png" })]);
    assert.equal(files.resolveUrl(path), `/raw?path=${encodeURIComponent(path)}`);
    assert.equal(files.resolveUrl("https://example.com/x.png"), "https://example.com/x.png");
    assert.equal(files.resolveUrl("notes/missing.png"), null);
    files.open(path);
    assert.deepEqual(opened, [path]);
    assert.equal(files.displayOf("image"), "small");
    assert.equal(files.displayOf("pdf"), "title");
  });

  it("files dragged from the explorer are linked, not copied (documents become wikilinks)", async () => {
    const { vault, files, uploads } = vaultWithUploads();
    vault.createFile("notes/photo.jpg", "");
    const payload = JSON.stringify(["notes/photo.jpg", "notes/spec.md"]);
    const fakeDrop = {
      dataTransfer: {
        types: ["application/x-vibe-vault-paths"],
        getData: () => payload,
        files: [],
      },
    } as unknown as DragEvent;
    const items = await files.resolveDrop!(fakeDrop);
    assert.deepEqual(items, [{ fileTarget: "notes/photo.jpg" }, { text: "[[spec]]" }]);
    assert.equal(uploads.length, 0);
  });

  it("tokenizes inline image chips, CTA/Markdown links, wikilinks, directives, highlights, and bare URLs cleanly", () => {
    const imgStrip = tokenizeOutlineInline(
      "[img:좌측 컷 -> https://cdn.example.com/a.jpg] | ![우측 컷](https://cdn.example.com/b.jpg)"
    );
    assert.deepEqual(imgStrip, [
      { kind: "image", label: "좌측 컷", url: "https://cdn.example.com/a.jpg" },
      { kind: "text", value: " | " },
      { kind: "image", label: "우측 컷", url: "https://cdn.example.com/b.jpg" },
    ]);

    const mixed = tokenizeOutlineInline(
      "<<view:table:header>> 참고 [cta:계약서 보기 -> vault://01. Architecture/01. Vault-Contract.md] [[Spec|스펙]] ==핵심== #설계"
    );
    assert.deepEqual(mixed, [
      { kind: "directive", raw: "<<view:table:header>>" },
      { kind: "text", value: " 참고 " },
      {
        kind: "link",
        label: "계약서 보기",
        url: "vault://01. Architecture/01. Vault-Contract.md",
        isCta: true,
      },
      { kind: "text", value: " " },
      { kind: "wikilink", target: "Spec", alias: "스펙" },
      { kind: "text", value: " " },
      { kind: "highlight", value: "핵심" },
      { kind: "text", value: " " },
      { kind: "tag", value: "#설계" },
    ]);

    const bare = tokenizeOutlineInline("링크: https://postfiles.pstatic.net/a/b/066.JPG?type=w966");
    assert.deepEqual(bare, [
      { kind: "text", value: "링크: " },
      {
        kind: "link",
        label: "postfiles.pstatic.net/066.JPG",
        url: "https://postfiles.pstatic.net/a/b/066.JPG?type=w966",
      },
    ]);
  });
});
