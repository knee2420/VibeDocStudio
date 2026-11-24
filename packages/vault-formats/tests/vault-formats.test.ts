import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryVaultAdapter } from "@vibe/vault-core";

import {
  createDefaultVDoc,
  createVDocStore,
  fromVaultUri,
  isVDocPath,
  parseVDocJson,
  serializeVDocJson,
  toVaultUri,
} from "../src/index";

function vaultWithDoc() {
  const vault = new MemoryVaultAdapter();
  vault.createFolder("a");
  vault.createFile("a/doc.vdoc", serializeVDocJson(createDefaultVDoc("Doc", "a4")));
  return vault;
}

describe("@vibe/vault-formats", () => {
  it("vdoc 왕복 · 포인터", () => {
    const doc = createDefaultVDoc("제목", "blog");
    const back = parseVDocJson(serializeVDocJson(doc), "x");
    assert.equal(back.title, "제목");
    assert.equal(fromVaultUri(toVaultUri("a/b.md")), "a/b.md");
    assert.ok(isVDocPath("x/y.vdoc"));
  });

  it("문서 캐시: 내용이 그대로면 한 번만 파싱하고 같은 객체를 준다", () => {
    const vault = vaultWithDoc();
    const docs = createVDocStore(vault);
    const a = docs.get("a/doc.vdoc");
    const b = docs.get("a/doc.vdoc");
    assert.ok(a);
    assert.equal(a, b);
    assert.equal(docs.stats().parses, 1);
    docs.dispose();
  });

  it("문서 캐시: write 는 쓴 객체를 그대로 나눠 주고 다시 파싱하지 않는다", () => {
    const vault = vaultWithDoc();
    const docs = createVDocStore(vault);
    const seen: unknown[] = [];
    docs.subscribe("a/doc.vdoc", (d) => seen.push(d));
    const next = { ...docs.get("a/doc.vdoc")!, title: "바뀜" };
    docs.write("a/doc.vdoc", next);
    assert.equal(docs.get("a/doc.vdoc"), next);
    assert.equal(seen[seen.length - 1], next);
    assert.equal(docs.stats().parses, 1);
    assert.match(vault.read("a/doc.vdoc"), /바뀜/);
    docs.dispose();
  });

  it("문서 캐시: 바깥(다른 창 · AI · 디스크) 쓰기면 다시 파싱해 구독자에게 준다", () => {
    const vault = vaultWithDoc();
    const docs = createVDocStore(vault);
    const first = docs.get("a/doc.vdoc")!;
    let got: { title: string } | null = null;
    docs.subscribe("a/doc.vdoc", (d) => (got = d));
    vault.write("a/doc.vdoc", serializeVDocJson({ ...first, title: "AI" }));
    assert.equal((got as { title: string } | null)?.title, "AI");
    assert.notEqual(docs.get("a/doc.vdoc"), first);
    assert.equal(docs.stats().parses, 2);
    vault.rename("a/doc.vdoc", "renamed.vdoc");
    assert.equal(docs.get("a/doc.vdoc"), null);
    assert.equal(docs.get("a/renamed.vdoc")?.title, "AI");
    docs.dispose();
  });
});

describe("@vibe/vault-formats — 구조 공유", () => {
  it("바깥에서 칸 하나만 바뀌면 다른 칸 · 쪽은 이전 객체를 그대로 쓴다", () => {
    const vault = new MemoryVaultAdapter();
    const base = createDefaultVDoc("Doc", "a4");
    const doc = {
      ...base,
      slots: {
        a: { slotId: "a", label: "A", role: "editable-slot", content: "<p>a</p>", backDataRefs: [] },
        b: { slotId: "b", label: "B", role: "editable-slot", content: "<p>b</p>", backDataRefs: [] },
      },
    } as typeof base;
    vault.createFile("d.vdoc", serializeVDocJson(doc));
    const docs = createVDocStore(vault);
    const first = docs.get("d.vdoc")!;
    const changed = JSON.parse(vault.read("d.vdoc"));
    changed.slots.b.content = "<p>B2</p>";
    vault.write("d.vdoc", JSON.stringify(changed));
    const second = docs.get("d.vdoc")!;
    assert.notEqual(second, first);
    assert.equal(second.slots.a, first.slots.a);
    assert.notEqual(second.slots.b, first.slots.b);
    assert.equal(second.pages, first.pages);
    // 저장 시각만 다르게 다시 쓰면 문서 객체도 그대로
    vault.write("d.vdoc", serializeVDocJson(second));
    assert.equal(docs.get("d.vdoc"), second);
    docs.dispose();
  });
});
