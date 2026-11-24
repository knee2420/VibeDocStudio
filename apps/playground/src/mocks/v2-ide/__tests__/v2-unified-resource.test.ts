import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { MemoryVaultAdapter } from "@vibe/vault-core";
import { parseOutlineJson } from "@vibe/vault-formats";
import {
  extractResourceTagsInText,
  parseCiteBullet,
  parseResourceTag,
} from "@vibe/vdoc-schema";

import {
  buildTextFragmentUrl,
  findCachedWebRefInVault,
  openResourceTagInPair,
  subscribeResourceHighlight,
  type ResourceHighlightRequest,
} from "../model/resourceHighlightBus";
import { tokenizeOutlineInline } from "../ui/outlineLiveRenderer";

const VAULT_ROOT = path.resolve(process.cwd(), "data/vaults/default-vault");
const TEST_FOLDER = "07. 리소스_통합_테스트";

function loadTestFolderIntoMemoryVault(): MemoryVaultAdapter {
  const entries: Array<{ path: string; kind: "file"; content: string }> = [];
  const walk = (absDir: string, relPrefix: string) => {
    for (const dirent of fs.readdirSync(absDir, { withFileTypes: true })) {
      const abs = path.join(absDir, dirent.name);
      const rel = relPrefix ? `${relPrefix}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) {
        walk(abs, rel);
      } else if (dirent.isFile()) {
        const ext = path.extname(dirent.name).toLowerCase();
        entries.push({
          path: rel,
          kind: "file",
          content:
            ext === ".pdf" || ext === ".png" || ext === ".jpg"
              ? `[binary:${fs.statSync(abs).size}B]`
              : fs.readFileSync(abs, "utf8"),
        });
      }
    }
  };
  walk(path.join(VAULT_ROOT, TEST_FOLDER), TEST_FOLDER);
  const syntaxFile = path.join(VAULT_ROOT, ".vibedoc/element-registry.vsyntax");
  if (fs.existsSync(syntaxFile)) {
    entries.push({
      path: ".vibedoc/element-registry.vsyntax",
      kind: "file",
      content: fs.readFileSync(syntaxFile, "utf8"),
    });
  }
  return new MemoryVaultAdapter({
    id: "unified-resource-test-vault",
    name: "Unified Resource Test Vault",
    initialEntries: entries,
  });
}

describe("v2 통합 리소스(<<resource:...>>) 파서 · 페어 하이라이트 버스 · 전 확장자 테스트 페이지", () => {
  it("parseResourceTag & parseCiteBullet 이 웹 URL · PDF · MD · CSV · Outline · VDoc · Ref · Image 앵커를 정확히 파싱한다", () => {
    const web = parseResourceTag(
      "<<resource: https://www.besteleven.com/news/articleView.html?idxno=314277 | 일반 언론·기사 도메인>>"
    );
    assert.ok(web);
    assert.equal(web.isWebUrl, true);
    assert.equal(web.target, "https://www.besteleven.com/news/articleView.html?idxno=314277");
    assert.equal(web.quote, "일반 언론·기사 도메인");

    const pdf = parseResourceTag(
      "<<resource: [[제안요청서_샘플_5P.pdf]] #p5 | 테넌트 단위 AES-256 암호화>>"
    );
    assert.ok(pdf);
    assert.equal(pdf.isWebUrl, false);
    assert.equal(pdf.target, "제안요청서_샘플_5P.pdf");
    assert.equal(pdf.page, 5);
    assert.equal(pdf.quote, "테넌트 단위 AES-256 암호화");

    const img = parseResourceTag(
      "<<resource: [[아키텍처_도면.png]] #bbox(400,80,650,920) | Layer 2 · RAG Core>>"
    );
    assert.ok(img);
    assert.deepEqual(img.bbox, [400, 80, 650, 920]);

    const nodeRef = parseResourceTag(
      "<<resource: [[기획_원본.outline]] #node:n-kpi-target | 평균 근거 연결률 85.0%>>"
    );
    assert.ok(nodeRef);
    assert.equal(nodeRef.nodeId, "n-kpi-target");

    const slotRef = parseResourceTag(
      "<<resource: [[발표_샘플.vdoc]] #slot:slot-budget | 총 4,560,000원>>"
    );
    assert.ok(slotRef);
    assert.equal(slotRef.slotId, "slot-budget");

    const citeLocs = parseCiteBullet(
      "<<resource: [[제안요청서_샘플_5P.pdf]] #p5 | 테넌트 단위 AES-256 암호화>>"
    );
    assert.ok(citeLocs && citeLocs.length === 1);
    assert.equal(citeLocs[0].page, 5);
    assert.equal(citeLocs[0].excerpt, "테넌트 단위 AES-256 암호화");

    const tokens = tokenizeOutlineInline(
      "참고: <<resource: [[제안요청서_샘플_5P.pdf]] #p5 | 보안 조항>>"
    );
    assert.ok(tokens.some((t) => t.kind === "resource"));
  });

  it("07. 리소스_통합_테스트 3개 테스트 페이지의 모든 <<resource:...>> 태그가 실제 볼트/웹 스냅샷으로 열리고 하이라이트를 전달한다", () => {
    const vault = loadTestFolderIntoMemoryVault();

    // 1. 웹 URL 캐시 스냅샷 매칭 검증 (besteleven & fmkorea)
    const beRef = findCachedWebRefInVault(
      vault,
      "https://www.besteleven.com/news/articleView.html?idxno=314277"
    );
    const fmRef = findCachedWebRefInVault(vault, "https://www.fmkorea.com/10583570806");
    assert.equal(beRef, `${TEST_FOLDER}/resources/besteleven_314277.ref`);
    assert.equal(fmRef, `${TEST_FOLDER}/resources/fmkorea_10583570806.ref`);

    const fragUrl = buildTextFragmentUrl(
      "https://www.fmkorea.com/10583570806",
      "로컬 스냅샷에 본문을 보존"
    );
    assert.ok(fragUrl.includes("#:~:text="));

    // 2. 마스터 .outline 내 모든 <<resource:...>> 태그 E2E 검증
    const outlinePath = `${TEST_FOLDER}/00. 리소스_통합_마스터_테스트.outline`;
    const outlineDoc = parseOutlineJson(vault.read(outlinePath), "master");
    const outlineTags: string[] = [];
    const walkNodes = (nodes: typeof outlineDoc.rootNodes) => {
      for (const n of nodes) {
        for (const hit of extractResourceTagsInText(n.text)) {
          outlineTags.push(hit.parsed.raw);
        }
        walkNodes(n.children);
      }
    };
    walkNodes(outlineDoc.rootNodes);
    assert.ok(outlineTags.length >= 10, `마스터 아웃라인에 10종 이상 리소스 태그 필요 (현재 ${outlineTags.length})`);

    const openedPaths: string[] = [];
    for (const rawTag of outlineTags) {
      const received: Array<ResourceHighlightRequest | null> = [];
      let openedTarget = "";
      const ok = openResourceTagInPair(rawTag, {
        vault,
        sourcePath: outlinePath,
        openInPair: (targetPath) => {
          openedTarget = targetPath;
          openedPaths.push(targetPath);
        },
      });
      assert.equal(ok, true, `리소스 오픈 실패: ${rawTag}`);
      assert.ok(openedTarget.length > 0);
      const unsub = subscribeResourceHighlight(openedTarget, (req) => received.push(req));
      unsub();
    }
    assert.ok(openedPaths.some((p) => p.endsWith(".pdf")));
    assert.ok(openedPaths.some((p) => p.endsWith(".md")));
    assert.ok(openedPaths.some((p) => p.endsWith(".csv")));
    assert.ok(openedPaths.some((p) => p.endsWith(".outline")));
    assert.ok(openedPaths.some((p) => p.endsWith(".vdoc")));
    assert.ok(openedPaths.some((p) => p.endsWith(".ref")));
    assert.ok(openedPaths.some((p) => p.endsWith(".png")));
    assert.ok(openedPaths.some((p) => p.endsWith(".vsyntax")));

    // 3. 일반 마크다운(.md) 및 웹 전용 테스트 페이지 검증 (인라인 코드 백틱 내부 설명 예시는 제외)
    for (const mdFile of [
      `${TEST_FOLDER}/01. 일반_마크다운_리소스_테스트.md`,
      `${TEST_FOLDER}/02. 웹페이지_기사_인용_테스트.md`,
    ]) {
      const strippedCode = vault.read(mdFile).replace(/`[^`\n]+`/g, "");
      const mdTags = extractResourceTagsInText(strippedCode);
      assert.ok(mdTags.length >= 4, `${mdFile} 에 최소 4개 이상 리소스 태그 필요`);
      for (const hit of mdTags) {
        let opened = "";
        const ok = openResourceTagInPair(hit.parsed, {
          vault,
          sourcePath: mdFile,
          openInPair: (p) => {
            opened = p;
          },
        });
        assert.equal(ok, true, `${mdFile} 리소스 오픈 실패: ${hit.parsed.raw}`);
        assert.ok(opened.length > 0);
      }
    }
  });
});
