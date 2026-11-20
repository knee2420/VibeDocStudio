import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MemoryVaultAdapter, VaultMetadataCache } from "@vibe/vault-core";
import {
  collectTagCompletions,
  collectWikilinkCompletions,
  extractEmbedPreviewLines,
  parseFrontmatterDocument,
  removeFrontmatterProperty,
  toggleMarkdownCheckboxAtLine,
  upsertFrontmatterProperty,
} from "../src/core";

describe("@vibe/markdown-editor — Frontmatter Properties & Checkbox Utilities", () => {
  it("parses, updates, adds, and removes YAML frontmatter properties cleanly", () => {
    const raw = `---\ntitle: Architecture\ntags: [obsidian, cm6]\npublished: true\n---\n# Heading\nBody text\n`;
    const parsed = parseFrontmatterDocument(raw);
    assert.equal(parsed.hasFrontmatter, true);
    assert.equal(parsed.properties.length, 3);
    assert.deepEqual(parsed.properties[1], { key: "tags", value: ["obsidian", "cm6"] });

    const withOwner = upsertFrontmatterProperty(raw, "owner", "core-team");
    const parsed2 = parseFrontmatterDocument(withOwner);
    assert.equal(parsed2.properties.length, 4);
    assert.equal(parsed2.properties[3].value, "core-team");
    assert.ok(parsed2.body.includes("# Heading"));

    const withoutPublished = removeFrontmatterProperty(withOwner, "published");
    const parsed3 = parseFrontmatterDocument(withoutPublished);
    assert.equal(parsed3.properties.some((p) => p.key === "published"), false);
  });

  it("toggles markdown checkboxes at exact 1-based line numbers", () => {
    const doc = "# Tasks\n- [ ] First task\n- [x] Second task\n";
    const toggled1 = toggleMarkdownCheckboxAtLine(doc, 2);
    assert.ok(toggled1.includes("- [x] First task"));
    const toggled2 = toggleMarkdownCheckboxAtLine(toggled1, 3);
    assert.ok(toggled2.includes("- [ ] Second task"));
  });
});

describe("@vibe/markdown-editor — Vault Completions & Transclusion Embeds", () => {
  it("generates [[wikilink]] and #tag completion options and extracts embed previews for .md and .outline", () => {
    const vault = new MemoryVaultAdapter({
      initialEntries: [
        {
          path: "docs/Spec.md",
          content: "---\ntags: [architecture, obsidian]\n---\n# Spec Title\nDetail line 1\n",
        },
        {
          path: "docs/Plan.outline",
          content: JSON.stringify({
            version: 1,
            id: "plan",
            title: "Plan",
            defaultView: "bullets",
            rootNodes: [
              { id: "r1", text: "Phase 1", children: [{ id: "c1", text: "Step A", children: [] }] },
            ],
          }),
        },
      ],
    });
    const cache = new VaultMetadataCache(vault);

    const wikiOpts = collectWikilinkCompletions(vault, "sp");
    assert.equal(wikiOpts.length, 1);
    assert.equal(wikiOpts[0].label, "Spec");

    const tagOpts = collectTagCompletions(cache, "obs");
    assert.equal(tagOpts.length, 1);
    assert.equal(tagOpts[0].label, "#obsidian");

    const mdPreview = extractEmbedPreviewLines(vault, "docs/Spec.md");
    assert.deepEqual(mdPreview, ["# Spec Title", "Detail line 1"]);

    const outlinePreview = extractEmbedPreviewLines(vault, "docs/Plan.outline");
    assert.deepEqual(outlinePreview, ["• Phase 1", "    • Step A"]);

    cache.dispose();
  });
});
