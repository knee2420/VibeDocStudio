import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  addOrConfirmConsensusCard,
  addRefPin,
  appendImageFrameToRef,
  buildRefAnchor,
  computeWebTileCoverage,
  refFileStemFromTitle,
  createEmptyRefDocument,
  createRefFromVaultFile,
  normalizeLegacyReferenceBundle,
  parseRefAnchor,
  parseRefJson,
  rewriteRefPointersOnRename,
  serializeRefJson,
  toggleRefLayer,
} from "../src/core";
import type { LegacyReferenceBundleInput } from "../src/core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_REFS_ROOT = path.resolve(HERE, "../../../apps/api/data/knowledge/references");

function readJsonSafe<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

describe("@vibe/ref-canvas — Normalized .ref IR Core", () => {
  it("builds and parses unified ref anchors (#f and legacy #p)", () => {
    const a1 = buildRefAnchor("ref-abc", { frameIndex: 3, blockId: "b12" });
    assert.equal(a1, "ref:ref-abc#f3#blk:b12");
    const p1 = parseRefAnchor(a1);
    assert.deepEqual(p1, {
      refId: "ref-abc",
      frameIndex: 3,
      section: null,
      blockId: "b12",
      pinId: "",
    });

    const pLegacy = parseRefAnchor("ref:ref-abc#p7#pin:pin_99");
    assert.equal(pLegacy?.frameIndex, 7);
    assert.equal(pLegacy?.pinId, "pin_99");
  });

  it("promotes Vault files (.pdf, .png, .md, .vdoc) into normalized .ref documents and rewrites pointers on rename", () => {
    const pdfRef = createRefFromVaultFile({
      vaultPath: "01. Docs/Proposal.pdf",
      binaryUrl: "/local-vault-api/raw?path=01.%20Docs%2FProposal.pdf",
      pageCount: 4,
    });
    assert.equal(pdfRef.source.originType, "pdf");
    assert.equal(pdfRef.frames.length, 4);
    assert.equal(pdfRef.frames[0].surfaceKind, "pdf-page");

    const imgRef = createRefFromVaultFile({
      vaultPath: "Assets/ui-screen.png",
      binaryUrl: "/local-vault-api/raw?path=Assets%2Fui-screen.png",
    });
    assert.equal(imgRef.source.originType, "image");
    assert.equal(imgRef.layerSet, "uiux");
    assert.equal(imgRef.frames[0].surfaceKind, "image");

    const mdRef = createRefFromVaultFile({
      vaultPath: "Notes/Spec.md",
      content: "# Overview\n\nFirst paragraph.\n\n- Bullet A\n- Bullet B\n\n| Col1 | Col2 |\n| --- | --- |\n| 1 | 2 |\n",
    });
    assert.equal(mdRef.source.originType, "markdown");
    assert.equal(mdRef.status, "structured");
    assert.equal(mdRef.frames[0].surfaceKind, "semantic-canvas");
    assert.equal(mdRef.blocks.length, 4);
    assert.ok(mdRef.blocks.every((b) => b.bbox !== null));

    const serialized = serializeRefJson(pdfRef);
    const rewritten = rewriteRefPointersOnRename(
      serialized,
      "01. Docs/Proposal.pdf",
      "01. Docs/Proposal-V2.pdf"
    );
    assert.equal(rewritten.replacements, 1);
    const reparsed = parseRefJson(rewritten.content);
    assert.equal(reparsed.source.uri, "vault://01. Docs/Proposal-V2.pdf");
  });

  it("supports immutable pin, layer, consensus, and multi-frame composite mutations", () => {
    let doc = createEmptyRefDocument("UI Flow");
    doc = appendImageFrameToRef(doc, { assetUrl: "data:image/png;base64,AAA", label: "Step 1" });
    doc = appendImageFrameToRef(doc, { assetUrl: "data:image/png;base64,BBB", label: "Step 2" });
    assert.equal(doc.frames.length, 2);
    assert.equal(doc.source.originType, "composite");

    const pinRes = addRefPin(doc, {
      kind: "region",
      frameIndex: 2,
      bbox: [100, 150, 420, 820],
      layer: "U1",
      note: "Hero hierarchy",
    });
    doc = pinRes.doc;
    assert.equal(doc.pins.length, 1);
    assert.equal(doc.pins[0].frameIndex, 2);
    assert.deepEqual(doc.pins[0].bbox, [100, 150, 420, 820]);

    doc = toggleRefLayer(doc, "D2");
    assert.equal(doc.enabledLayers.D2, false);

    doc = addOrConfirmConsensusCard(doc, {
      layer: "D4",
      scope: pinRes.pin.anchor,
      adoption: "follow",
      reading: "결론 선행형 요약 박스를 유지한다.",
    });
    assert.equal(doc.consensus.length, 1);
    assert.equal(doc.consensus[0].status, "confirmed");
  });
});

describe("@vibe/ref-canvas — Real Registered 10-Item Reference Corpus Normalization", () => {
  it("normalizes ALL existing registered references in apps/api/data/knowledge/references cleanly without crashes or empty surfaces", () => {
    const itemsDir = path.join(REAL_REFS_ROOT, "items");
    assert.ok(fs.existsSync(itemsDir), `Expected real references directory at ${itemsDir}`);

    const bindingFile = path.join(REAL_REFS_ROOT, "bindings", "vproj-enterprise-architecture-suite.json");
    const binding = readJsonSafe<{
      entries?: {
        refId: string;
        layers?: Record<string, boolean>;
        consensus?: Record<string, unknown>[];
      }[];
    }>(bindingFile);
    const bindingByRef = new Map((binding?.entries ?? []).map((e) => [e.refId, e]));

    const folders = fs
      .readdirSync(itemsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    assert.ok(folders.length >= 10, `Expected at least 10 registered references, got ${folders.length}`);

    let pdfCount = 0;
    let webTileCount = 0;
    let webSemanticCount = 0;
    let totalPins = 0;
    let totalConsensus = 0;

    for (const folderName of folders) {
      const dir = path.join(itemsDir, folderName);
      const ref = readJsonSafe<LegacyReferenceBundleInput["ref"]>(path.join(dir, "ref.json"));
      assert.ok(ref, `Missing ref.json in ${folderName}`);
      const extraction = readJsonSafe<LegacyReferenceBundleInput["extraction"]>(
        path.join(dir, "extraction.json")
      );
      const layers = readJsonSafe<LegacyReferenceBundleInput["layers"]>(
        path.join(dir, "layers.json")
      );
      const pins = readJsonSafe<LegacyReferenceBundleInput["pins"]>(path.join(dir, "pins.json"));
      const shots = readJsonSafe<LegacyReferenceBundleInput["shots"]>(path.join(dir, "shots.json"));
      const boundEntry = bindingByRef.get(ref.refId);

      const normalized = normalizeLegacyReferenceBundle({
        ref,
        extraction,
        layers,
        pins,
        shots,
        consensus: boundEntry?.consensus ?? [],
        layerOverrides: boundEntry?.layers ?? {},
        assetBaseUrl: `/local-ref-library/items/${ref.refId}`,
      });

      // Every single item must normalize into a valid, non-failed, visually renderable document
      assert.notEqual(normalized.status, "failed", `${ref.refId} should not fail normalization`);
      assert.ok(normalized.frames.length >= 1, `${ref.refId} must produce at least 1 frame`);
      assert.ok(normalized.blocks.length >= 1, `${ref.refId} must produce structured blocks`);
      assert.ok(normalized.layers.length >= 1, `${ref.refId} must have layer definitions`);

      // Every block must belong to an existing frame and have valid 0..1000 bbox
      for (const blk of normalized.blocks) {
        assert.ok(
          blk.frameIndex >= 1 && blk.frameIndex <= normalized.frames.length,
          `${ref.refId}/${blk.id}: frameIndex ${blk.frameIndex} out of range 1..${normalized.frames.length}`
        );
        assert.ok(blk.bbox !== null, `${ref.refId}/${blk.id}: normalized bbox must not be null`);
        const [y0, x0, y1, x1] = blk.bbox;
        assert.ok(y0 >= 0 && y1 <= 1000 && y0 < y1, `${ref.refId}/${blk.id}: invalid y bbox [${y0},${y1}]`);
        assert.ok(x0 >= 0 && x1 <= 1000 && x0 < x1, `${ref.refId}/${blk.id}: invalid x bbox [${x0},${x1}]`);
      }

      // Every pin must point to a valid frame
      for (const pin of normalized.pins) {
        assert.ok(
          pin.frameIndex >= 1 && pin.frameIndex <= normalized.frames.length,
          `${ref.refId}/${pin.pinId}: frameIndex out of range`
        );
      }
      totalPins += normalized.pins.length;
      totalConsensus += normalized.consensus.length;

      // JSON roundtrip integrity
      const roundtripped = parseRefJson(serializeRefJson(normalized));
      assert.equal(roundtripped.refId, normalized.refId);
      assert.equal(roundtripped.frames.length, normalized.frames.length);
      assert.equal(roundtripped.blocks.length, normalized.blocks.length);

      // Classify surface coverage
      const firstSurface = normalized.frames[0].surfaceKind;
      if (firstSurface === "pdf-page") pdfCount += 1;
      else if (firstSurface === "web-tile") webTileCount += 1;
      else if (firstSurface === "semantic-canvas") webSemanticCount += 1;
    }

    // Verify all 3 heterogeneous real-world surface pipelines were exercised across the 10 items!
    assert.ok(pdfCount >= 6, `Expected >=6 PDF references, got ${pdfCount}`);
    assert.ok(webTileCount >= 1, `Expected >=1 Web-Tile (shots) reference, got ${webTileCount}`);
    assert.ok(webSemanticCount >= 3, `Expected >=3 Web Semantic-Canvas (no shots) references, got ${webSemanticCount}`);
    assert.ok(totalPins >= 6, `Expected >=6 real pins preserved, got ${totalPins}`);
    assert.ok(totalConsensus >= 1, `Expected >=1 real consensus card preserved, got ${totalConsensus}`);
  });
});

describe("computeWebTileCoverage", () => {
  const tile = (index: number, scrollY: number, height: number) => ({
    frameId: `frame-${index}`,
    index,
    surfaceKind: "web-tile" as const,
    width: 1280,
    height,
    scrollY,
  });

  it("treats contiguous 2000px strips as one complete page", () => {
    const cov = computeWebTileCoverage([tile(1, 0, 2000), tile(2, 2000, 2000), tile(3, 4000, 1281)]);
    assert.equal(cov.pageHeightPx, 5281);
    assert.equal(cov.complete, true);
    assert.equal(cov.placements.get(2)?.gapBeforePx, 0);
  });

  it("exposes gaps between sampled tiles instead of hiding them", () => {
    const cov = computeWebTileCoverage([tile(1, 0, 900), tile(2, 1640, 900), tile(3, 26026, 900)]);
    assert.equal(cov.pageHeightPx, 26926);
    assert.equal(cov.complete, false);
    assert.equal(cov.coveredPx, 2700);
    assert.equal(cov.placements.get(2)?.gapBeforePx, 740);
  });

  it("crops overlapping rows so nothing is shown twice", () => {
    const cov = computeWebTileCoverage([tile(1, 0, 900), tile(2, 820, 900)]);
    assert.equal(cov.placements.get(2)?.cropTopPx, 80);
    assert.equal(cov.coveredPx, 1720);
    assert.equal(cov.complete, true);
  });
});

describe("refFileStemFromTitle", () => {
  it("drops characters that cannot appear in file names", () => {
    assert.equal(refFileStemFromTitle('A/B: "C" <D>?'), "A B C D");
  });
  it("cuts long titles at a word boundary", () => {
    const stem = refFileStemFromTitle("미국 여행 라스베가스 스피어 하이롤러 할인 및 가볼만한 곳 정리 그리고 아주 긴 부제목이 계속 이어집니다", 40);
    assert.ok(stem.length <= 40);
    assert.ok(!stem.endsWith(" "));
    assert.ok("미국 여행 라스베가스 스피어 하이롤러 할인 및 가볼만한 곳 정리 그리고".startsWith(stem));
  });
  it("returns empty when nothing usable is left", () => {
    assert.equal(refFileStemFromTitle(' / : * '), "");
  });
});
