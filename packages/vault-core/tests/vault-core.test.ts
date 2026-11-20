import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  LocalApiVaultAdapter,
  MemoryVaultAdapter,
  VaultMetadataCache,
  findOwningProjectPath,
  getAncestorPaths,
  getObsidianDisplayName,
  isDescendantPath,
  isProjectFolderPath,
  isValidEntryName,
  normalizeVaultPath,
  rewriteWikilinksOnRename,
  stripProjectFolderExt,
  toggleProjectFolderName,
  type VaultEvent,
} from "../src/index";

describe("@vibe/vault-core — path utilities", () => {
  it("normalizes POSIX/Windows slashes, duplicates, and dot segments", () => {
    assert.equal(normalizeVaultPath("  /docs\\specs//01.md/ "), "docs/specs/01.md");
    assert.equal(normalizeVaultPath("a/b/../c/./d.outline"), "a/c/d.outline");
    assert.equal(normalizeVaultPath("/"), "");
  });

  it("computes ancestors and descendant relationships accurately", () => {
    assert.deepEqual(getAncestorPaths("a/b/c/file.md"), ["a", "a/b", "a/b/c"]);
    assert.deepEqual(getAncestorPaths("root.md"), []);
    assert.equal(isDescendantPath("a/b/c", "a"), true);
    assert.equal(isDescendantPath("a", "a"), true);
    assert.equal(isDescendantPath("ab/c", "a"), false);
  });

  it("formats Obsidian display names (.md hides extension, others show uppercase badge)", () => {
    assert.deepEqual(getObsidianDisplayName("Architecture.md", "file"), {
      label: "Architecture",
      extensionBadge: null,
    });
    assert.deepEqual(getObsidianDisplayName("Spec.outline", "file"), {
      label: "Spec",
      extensionBadge: "OUTLINE",
    });
    assert.deepEqual(getObsidianDisplayName("proposal.vdoc.json", "file"), {
      label: "proposal",
      extensionBadge: "VDOC",
    });
    assert.deepEqual(getObsidianDisplayName("01. Docs", "folder"), {
      label: "01. Docs",
      extensionBadge: null,
    });
    assert.deepEqual(getObsidianDisplayName("04. Launch-Campaign.vproj", "folder"), {
      label: "04. Launch-Campaign",
      extensionBadge: "PROJ",
    });
  });

  it("handles .vproj folder extension helpers and Nearest Ancestor project resolution", () => {
    assert.equal(isProjectFolderPath("Work/Campaign.vproj"), true);
    assert.equal(isProjectFolderPath("Work/Regular"), false);
    assert.equal(stripProjectFolderExt("Campaign.vproj"), "Campaign");
    assert.deepEqual(toggleProjectFolderName("Campaign"), {
      nextName: "Campaign.vproj",
      isProject: true,
    });
    assert.deepEqual(toggleProjectFolderName("Campaign.vproj"), {
      nextName: "Campaign",
      isProject: false,
    });

    assert.equal(
      findOwningProjectPath("04. Launch-Campaign.vproj/sub/02. Launch-Blog-Post.vdoc"),
      "04. Launch-Campaign.vproj"
    );
    assert.equal(
      findOwningProjectPath("Outer.vproj/Inner.vproj/doc.vdoc"),
      "Outer.vproj/Inner.vproj"
    );
    assert.equal(findOwningProjectPath("01. Architecture/00. System-Proposal.vdoc"), null);
  });

  it("validates illegal filename characters", () => {
    assert.equal(isValidEntryName("Valid Name 01.outline"), true);
    assert.equal(isValidEntryName("bad:name.md"), false);
    assert.equal(isValidEntryName("bad/name.md"), false);
    assert.equal(isValidEntryName("   "), false);
    assert.equal(isValidEntryName(".."), false);
  });
});

describe("@vibe/vault-core — MemoryVaultAdapter", () => {
  it("supports CRUD, automatic ancestor folder creation, and unique path generation", () => {
    let tick = 1000;
    const vault = new MemoryVaultAdapter({ now: () => (tick += 10) });

    const created = vault.createFile("docs/specs/README.md", "# Spec");
    assert.equal(created.path, "docs/specs/README.md");
    assert.equal(vault.getNode("docs")?.kind, "folder");
    assert.equal(vault.getNode("docs/specs")?.kind, "folder");
    assert.equal(vault.read("docs/specs/README.md"), "# Spec");

    const updated = vault.write("docs/specs/README.md", "# Updated");
    assert.equal(updated.size, "# Updated".length);
    assert.equal(vault.read("docs/specs/README.md"), "# Updated");

    assert.equal(vault.getUniquePath("docs/specs", "Untitled", "md"), "docs/specs/Untitled.md");
    vault.createFile("docs/specs/Untitled.md", "");
    assert.equal(vault.getUniquePath("docs/specs", "Untitled", "md"), "docs/specs/Untitled 1.md");
    vault.createFile("docs/specs/Untitled 1.md", "");
    assert.equal(vault.getUniquePath("docs/specs", "Untitled", "md"), "docs/specs/Untitled 2.md");
  });

  it("sorts folders before files and applies natural numeric sorting + mtime/ctime orders", () => {
    const vault = new MemoryVaultAdapter({
      initialEntries: [
        { path: "10. Note.md", content: "a", ctime: 100, mtime: 500 },
        { path: "2. Note.md", content: "b", ctime: 300, mtime: 200 },
        { path: "1. Note.md", content: "c", ctime: 200, mtime: 800 },
        { path: "ZFolder", kind: "folder", ctime: 50, mtime: 50 },
        { path: "AFolder", kind: "folder", ctime: 90, mtime: 90 },
      ],
    });

    assert.deepEqual(
      vault.listChildren("", "name-asc").map((n) => n.name),
      ["AFolder", "ZFolder", "1. Note.md", "2. Note.md", "10. Note.md"]
    );
    assert.deepEqual(
      vault.listChildren("", "name-desc").map((n) => n.name),
      ["ZFolder", "AFolder", "10. Note.md", "2. Note.md", "1. Note.md"]
    );
    assert.deepEqual(
      vault.listChildren("", "mtime-desc").map((n) => n.name),
      ["AFolder", "ZFolder", "1. Note.md", "10. Note.md", "2. Note.md"]
    );
    assert.deepEqual(
      vault.listChildren("", "ctime-asc").map((n) => n.name),
      ["ZFolder", "AFolder", "10. Note.md", "1. Note.md", "2. Note.md"]
    );
  });

  it("renames and moves nested folders while remapping all descendants and emitting events", () => {
    const events: VaultEvent[] = [];
    const vault = new MemoryVaultAdapter({
      initialEntries: [
        { path: "src/a.outline", content: "{}" },
        { path: "src/nested/b.md", content: "hello" },
        { path: "archive", kind: "folder" },
      ],
    });
    vault.subscribe((ev) => events.push(ev));

    const renameRes = vault.rename("src", "docs");
    assert.equal(renameRes.newPath, "docs");
    assert.equal(vault.exists("src"), false);
    assert.equal(vault.read("docs/nested/b.md"), "hello");
    assert.equal(renameRes.affectedMap.length, 4);

    const moveRes = vault.move("docs", "archive");
    assert.equal(moveRes.newPath, "archive/docs");
    assert.equal(vault.read("archive/docs/a.outline"), "{}");
    assert.equal(events.filter((e) => e.type === "rename").length, 2);
  });

  it("blocks invalid operations: move into self/descendant, duplicate collisions, illegal names", () => {
    const vault = new MemoryVaultAdapter({
      initialEntries: [
        { path: "folder/sub/note.md", content: "x" },
        { path: "other.md", content: "y" },
      ],
    });

    assert.throws(() => vault.move("folder", "folder"), /descendants/i);
    assert.throws(() => vault.move("folder", "folder/sub"), /descendants/i);
    assert.throws(() => vault.rename("folder/sub/note.md", "/other.md"), /exists/i);
    vault.createFile("folder/sub/dup.md", "");
    assert.throws(() => vault.rename("folder/sub/note.md", "dup.md"), /exists/i);
    assert.throws(() => vault.createFile("bad*file.md", ""), /사용할 수 없습니다/);
  });

  it("duplicates files and nested folders, deletes recursively, and roundtrips snapshots", () => {
    const vault = new MemoryVaultAdapter({
      initialEntries: [
        { path: "guide/intro.md", content: "intro" },
        { path: "guide/spec.outline", content: '{"rootNodes":[]}' },
      ],
    });

    const dupFile = vault.duplicate("guide/intro.md");
    assert.equal(dupFile.path, "guide/intro 1.md");
    assert.equal(vault.read("guide/intro 1.md"), "intro");

    const dupFolder = vault.duplicate("guide");
    assert.equal(dupFolder.path, "guide 1");
    assert.equal(vault.read("guide 1/spec.outline"), '{"rootNodes":[]}');

    const snapshot = vault.exportSnapshot();
    const delRes = vault.delete("guide 1");
    assert.equal(delRes.deletedPaths.length, 4);
    assert.equal(vault.exists("guide 1"), false);

    vault.importSnapshot(snapshot);
    assert.equal(vault.read("guide 1/intro 1.md"), "intro");
  });
});

describe("@vibe/vault-core — VaultMetadataCache & Wikilink Rewrite", () => {
  it("indexes frontmatter, headings, tags, wikilinks, embeds, and resolves backlinks", () => {
    const vault = new MemoryVaultAdapter({
      initialEntries: [
        {
          path: "docs/Alpha.md",
          content: `---\ntitle: Alpha Doc\ntags: [arch, core]\n---\n# Alpha\nSee [[Beta|Beta Note]] and ![[Spec.outline]] #obsidian\n`,
        },
        {
          path: "docs/Beta.md",
          content: "# Beta\nBack to [[Alpha#Alpha]]\n",
        },
        {
          path: "docs/Spec.outline",
          content: '{"rootNodes":[]}',
        },
      ],
    });

    const cache = new VaultMetadataCache(vault);
    const alpha = cache.getMetadata("docs/Alpha.md");
    assert.ok(alpha);
    assert.equal(alpha.frontmatter.title, "Alpha Doc");
    assert.deepEqual(alpha.tags, ["arch", "core", "obsidian"]);
    assert.equal(alpha.headings.length, 1);
    assert.equal(alpha.links.length, 2);
    assert.equal(alpha.links[1].embed, true);

    assert.equal(cache.resolveLink("Beta", "docs/Alpha.md"), "docs/Beta.md");
    assert.equal(cache.resolveLink("Spec.outline", "docs/Alpha.md"), "docs/Spec.outline");
    assert.equal(cache.getBacklinks("docs/Beta.md").length, 1);
    assert.equal(cache.getBacklinks("docs/Spec.outline").length, 1);

    // Rename Beta.md -> Gamma.md and auto-rewrite wikilinks preserving |alias!
    vault.rename("docs/Beta.md", "Gamma.md");
    const rewrite = rewriteWikilinksOnRename(vault, "docs/Beta.md", "docs/Gamma.md");
    assert.deepEqual(rewrite.updatedFiles, ["docs/Alpha.md"]);
    assert.equal(rewrite.totalReplacements, 1);
    assert.ok(vault.read("docs/Alpha.md").includes("[[Gamma|Beta Note]]"));
    assert.equal(cache.getBacklinks("docs/Gamma.md").length, 1);

    cache.dispose();
  });
});

describe("@vibe/vault-core — LocalApiVaultAdapter (Write-Through Mirror)", () => {
  it("hydrates from /tree, queues optimistic writes/renames, and persists .vibe session", async () => {
    const requests: { method: string; url: string; body?: unknown }[] = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ method, url, body });

      if (url.endsWith("/tree?includeContents=true")) {
        return new Response(
          JSON.stringify({
            vault: {
              id: "default-vault",
              name: "VibeDoc Vault",
              rootPath: "C:/tmp/default-vault",
              isDefault: true,
              exists: true,
            },
            entries: [
              {
                path: "Notes",
                name: "Notes",
                parentPath: "",
                kind: "folder",
                ctime: 100,
                mtime: 100,
              },
              {
                path: "Notes/Hello.md",
                name: "Hello.md",
                parentPath: "Notes",
                kind: "file",
                extension: "md",
                stem: "Hello",
                size: 7,
                ctime: 100,
                mtime: 200,
              },
            ],
            files: { "Notes/Hello.md": "# Hello" },
            revision: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.endsWith("/session") && method === "PUT") {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.endsWith("/reveal") && method === "POST") {
        const reqPath = (body as { path?: string } | undefined)?.path ?? "";
        return new Response(
          JSON.stringify({
            ok: true,
            resolvedPath: reqPath ? `C:/tmp/default-vault/${reqPath}` : "C:/tmp/default-vault",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const adapter = new LocalApiVaultAdapter({
      vaultId: "default-vault",
      apiBaseUrl: "http://127.0.0.1:8090",
      writeDebounceMs: 0,
      enableWatch: false,
      fetchImpl: mockFetch,
    });

    await adapter.hydrate();
    assert.equal(adapter.read("Notes/Hello.md"), "# Hello");
    assert.equal(adapter.isLoaded("Notes/Hello.md"), true);
    assert.equal(
      adapter.getBinaryUrl("img/a.png"),
      "http://127.0.0.1:8090/api/vaults/default-vault/raw?path=img%2Fa.png"
    );

    adapter.write("Notes/Hello.md", "# Updated");
    adapter.createFile("Notes/New.md", "New body");
    adapter.rename("Notes/New.md", "Renamed.md");
    await adapter.waitForIdle();

    assert.equal(adapter.read("Notes/Renamed.md"), "New body");
    assert.ok(requests.some((r) => r.method === "PUT" && r.url.endsWith("/file")));
    assert.ok(requests.some((r) => r.method === "POST" && r.url.endsWith("/file")));
    assert.ok(requests.some((r) => r.method === "POST" && r.url.endsWith("/rename")));

    await adapter.saveWorkspaceSession({ layout: { version: 1 } });
    assert.ok(requests.some((r) => r.method === "PUT" && r.url.endsWith("/session")));
    const revealed = await adapter.revealInOsExplorer("Notes/Hello.md");
    assert.equal(revealed, "C:/tmp/default-vault/Notes/Hello.md");
    assert.ok(requests.some((r) => r.method === "POST" && r.url.endsWith("/reveal")));
    assert.equal(adapter.getStatus().status, "ready");
    adapter.dispose();
  });

  it("supports lazy metadata-only hydration, on-demand ensureLoaded + metadata indexing, and readOnly protection", async () => {
    const requests: { method: string; url: string; writableHeader: string | null }[] = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      const writableHeader = new Headers(init?.headers).get("X-Vault-Writable");
      requests.push({ method, url, writableHeader });

      if (url.endsWith("/tree?includeContents=false")) {
        return new Response(
          JSON.stringify({
            vault: {
              id: "ext-vault",
              name: "External Vault",
              rootPath: "C:/external/vault",
              isDefault: false,
              exists: true,
            },
            entries: [
              {
                path: "Notes",
                name: "Notes",
                parentPath: "",
                kind: "folder",
                ctime: 100,
                mtime: 100,
              },
              {
                path: "Notes/Lazy.md",
                name: "Lazy.md",
                parentPath: "Notes",
                kind: "file",
                extension: "md",
                stem: "Lazy",
                size: 42,
                ctime: 100,
                mtime: 200,
              },
              {
                path: "Assets/diagram.png",
                name: "diagram.png",
                parentPath: "Assets",
                kind: "file",
                extension: "png",
                stem: "diagram",
                size: 102400,
                ctime: 100,
                mtime: 200,
              },
            ],
            files: {},
            revision: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/file?path=Notes%2FLazy.md") && method === "GET") {
        return new Response(
          JSON.stringify({
            path: "Notes/Lazy.md",
            content: "# Lazy Heading\nTagged #lazy-load with [[Target]]",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const adapter = new LocalApiVaultAdapter({
      vaultId: "ext-vault",
      apiBaseUrl: "/local-vault-api",
      includeContents: false,
      readOnly: true,
      writeDebounceMs: 0,
      enableWatch: false,
      fetchImpl: mockFetch,
    });

    await adapter.hydrate();
    assert.equal(adapter.isReadOnly(), true);
    assert.equal(adapter.isLoaded("Notes/Lazy.md"), false);
    assert.equal(
      adapter.getBinaryUrl("Assets/diagram.png"),
      "/local-vault-api/api/vaults/ext-vault/raw?path=Assets%2Fdiagram.png"
    );

    const cache = new VaultMetadataCache(adapter);
    assert.equal(cache.getMetadata("Notes/Lazy.md"), null);

    // Lazy load on demand -> auto-indexes into VaultMetadataCache
    const loaded = await adapter.ensureLoaded("Notes/Lazy.md");
    assert.ok(loaded.includes("# Lazy Heading"));
    assert.equal(adapter.isLoaded("Notes/Lazy.md"), true);
    const meta = cache.getMetadata("Notes/Lazy.md");
    assert.ok(meta);
    assert.deepEqual(meta.tags, ["lazy-load"]);
    assert.equal(meta.headings[0]?.text, "Lazy Heading");

    // Read-only protection blocks all mutating operations before any network call
    assert.throws(() => adapter.write("Notes/Lazy.md", "tampered"), /read-only/i);
    assert.throws(() => adapter.createFile("Notes/New.md", "x"), /read-only/i);
    assert.throws(() => adapter.rename("Notes/Lazy.md", "Other.md"), /read-only/i);
    assert.throws(() => adapter.delete("Notes/Lazy.md"), /read-only/i);
    assert.equal(
      requests.filter((r) => r.method !== "GET").length,
      0
    );

    // Unlock read-only -> writes succeed with X-Vault-Writable: true header
    adapter.setReadOnly(false);
    assert.equal(adapter.isReadOnly(), false);
    adapter.write("Notes/Lazy.md", "# Updated");
    await adapter.waitForIdle();
    const putReq = requests.find((r) => r.method === "PUT" && r.url.endsWith("/file"));
    assert.ok(putReq);
    assert.equal(putReq.writableHeader, "true");

    cache.dispose();
    adapter.dispose();
  });
});
