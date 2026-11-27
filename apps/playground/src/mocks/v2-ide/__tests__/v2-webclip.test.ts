import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createFileExplorerStore } from "@vibe/file-explorer/core";
import {
  MemoryVaultAdapter,
  getObsidianDisplayName,
  isClipBundlePath,
  resolveSourcesFolderForPath,
} from "@vibe/vault-core";
import {
  createVaultClipStore,
  createWebClipMeta,
  findCachedWebClipInVault,
  readWebClipBundle,
  writeWebClipBundle,
} from "@vibe/vault-formats";

import {
  openResourceTagInPair,
  resolveResourceVaultPath,
  subscribeResourceHighlight,
  type ResourceHighlightRequest,
} from "../model/resourceHighlightBus";

describe("v2 웹 스크랩 폴더 번들 (.vclip/) — 옵시디언식 sources/ 배치 · 탐색기 단일화 · 페어 하이라이트", () => {
  it("resolveSourcesFolderForPath 는 옵시디언 첨부파일 방식(편집 파일 동레이어 sources/ 또는 고정 폴더)을 따른다", () => {
    assert.equal(
      resolveSourcesFolderForPath("라야_보고서.vproj/보고서.vdoc"),
      "라야_보고서.vproj/sources"
    );
    assert.equal(resolveSourcesFolderForPath("보고서.vdoc"), "sources");
    assert.equal(
      resolveSourcesFolderForPath("라야_보고서.vproj/sources/기사.vclip"),
      "라야_보고서.vproj/sources"
    );
    assert.equal(
      resolveSourcesFolderForPath("라야_보고서.vproj/보고서.vdoc", {
        mode: "fixed-folder",
        fixedFolder: "00. Inbox/sources",
      }),
      "00. Inbox/sources"
    );
  });

  it("WebClipStore(VaultClipStore) 가 .vclip/ 번들을 읽고 쓰고 URL·clipId 로 조회한다", () => {
    const vault = new MemoryVaultAdapter({ id: "clip-test", name: "Clip Test" });
    const store = createVaultClipStore(vault);

    const meta = createWebClipMeta({
      clipId: "clip_be_314277",
      url: "https://www.besteleven.com/news/articleView.html?idxno=314277",
      title: "베스트일레븐 라야 부상 기사",
      captureMode: "content",
      sourceMethod: "research-auto",
      captureStatus: "full",
    });

    store.write("라야.vproj/sources/베스트일레븐.vclip", {
      meta,
      contentMd: "# 베스트일레븐 라야 부상 기사\n\n전반 38분 착지 과정에서 통증을 호소했다.\n",
      snapshotHtml: "<html><body>원형 스냅샷</body></html>",
    });

    const loaded = readWebClipBundle(vault, "라야.vproj/sources/베스트일레븐.vclip");
    assert.ok(loaded);
    assert.equal(loaded.meta.clipId, "clip_be_314277");
    assert.equal(loaded.meta.hasSnapshotHtml, true);
    assert.ok(loaded.contentMd.includes("전반 38분"));
    assert.equal(
      findCachedWebClipInVault(vault, "https://www.besteleven.com/news/articleView.html?idxno=314277"),
      "라야.vproj/sources/베스트일레븐.vclip"
    );
    assert.equal(store.findByClipId("clip_be_314277"), "라야.vproj/sources/베스트일레븐.vclip");

    // 브라우저 원형 캡처 타일(captures/shot_*.jpg) 로드 및 구 snapshot.html 정리 검증
    vault.createFolder("라야.vproj/sources/베스트일레븐.vclip/captures");
    vault.createFile("라야.vproj/sources/베스트일레븐.vclip/captures/shot_02.jpg", "jpeg2");
    vault.createFile("라야.vproj/sources/베스트일레븐.vclip/captures/shot_01.jpg", "jpeg1");
    store.write("라야.vproj/sources/베스트일레븐.vclip", {
      meta: { ...meta, captureMode: "archive", hasCaptureImage: true, hasSnapshotHtml: false },
      contentMd: loaded.contentMd,
      snapshotHtml: null,
    });
    const upgraded = readWebClipBundle(vault, "라야.vproj/sources/베스트일레븐.vclip");
    assert.ok(upgraded);
    assert.equal(upgraded.snapshotHtml, null);
    assert.equal(upgraded.meta.hasSnapshotHtml, false);
    assert.equal(upgraded.meta.hasCaptureImage, true);
    assert.deepEqual(upgraded.captureTilePaths, [
      "라야.vproj/sources/베스트일레븐.vclip/captures/shot_01.jpg",
      "라야.vproj/sources/베스트일레븐.vclip/captures/shot_02.jpg",
    ]);
  });

  it("FileExplorerStore 는 .vclip/ 폴더 번들을 단일 항목(CLIP 배지, 내부 파일 숨김)으로 표시하고 이름 변경 시 .vclip 을 보존한다", () => {
    const vault = new MemoryVaultAdapter({ id: "explorer-clip", name: "Explorer Clip" });
    vault.createFolder("라야.vproj");
    vault.createFolder("라야.vproj/sources");
    writeWebClipBundle(vault, "라야.vproj/sources/베스트일레븐.vclip", {
      meta: createWebClipMeta({
        url: "https://www.besteleven.com/news/articleView.html?idxno=314277",
        title: "베스트일레븐",
      }),
      contentMd: "# 베스트일레븐\n\n본문",
    });

    const explorer = createFileExplorerStore(vault, {
      initialExpandedPaths: ["라야.vproj", "라야.vproj/sources"],
    });
    const rows = explorer.getState().rows;
    const clipRow = rows.find((r) => r.path === "라야.vproj/sources/베스트일레븐.vclip");
    assert.ok(clipRow, ".vclip 번들 행이 탐색기에 보여야 한다");
    assert.equal(clipRow.isClipBundle, true);
    assert.equal(clipRow.hasChildren, false);
    assert.equal(
      rows.some((r) => r.path.endsWith("/clip.json") || r.path.endsWith("/content.md")),
      false,
      "번들 내부 파일(clip.json · content.md)은 탐색기에 펼쳐져서는 안 된다"
    );

    const disp = getObsidianDisplayName("베스트일레븐.vclip", "folder");
    assert.deepEqual(disp, { label: "베스트일레븐", extensionBadge: "CLIP" });

    // 이름 변경 시 `.vclip` 확장자 자동 보존
    explorer.getState().startRename("라야.vproj/sources/베스트일레븐.vclip");
    assert.equal(explorer.getState().renameState?.draft, "베스트일레븐");
    assert.equal(explorer.getState().renameState?.preservedSuffix, ".vclip");
    explorer.getState().updateRenameDraft("라야_부상_기사");
    const res = explorer.getState().commitRename();
    assert.equal(res.ok, true);
    assert.equal(res.newPath, "라야.vproj/sources/라야_부상_기사.vclip");
    assert.equal(isClipBundlePath(res.newPath ?? ""), true);
  });

  it("openResourceTagInPair 는 웹 URL 을 .ref 가 아닌 .vclip/ 번들(동레이어 sources/)로 열고 하이라이트를 전달한다", () => {
    const vault = new MemoryVaultAdapter({ id: "pair-clip", name: "Pair Clip" });
    vault.createFolder("라야.vproj");
    vault.createFile("라야.vproj/타임라인.outline", "{}");
    vault.createFolder("라야.vproj/sources");
    writeWebClipBundle(vault, "라야.vproj/sources/베스트일레븐.vclip", {
      meta: createWebClipMeta({
        url: "https://www.besteleven.com/news/articleView.html?idxno=314277",
        title: "베스트일레븐",
      }),
      contentMd: "# 베스트일레븐\n\n전반 38분 착지 통증.",
    });

    // 1. 기존 .vclip/ URL 매칭
    let opened = "";
    const ok1 = openResourceTagInPair(
      "<<resource: https://www.besteleven.com/news/articleView.html?idxno=314277 | 전반 38분 착지 통증>>",
      {
        vault,
        sourcePath: "라야.vproj/타임라인.outline",
        openInPair: (p) => {
          opened = p;
        },
      }
    );
    assert.equal(ok1, true);
    assert.equal(opened, "라야.vproj/sources/베스트일레븐.vclip");

    const received: Array<ResourceHighlightRequest | null> = [];
    const unsub = subscribeResourceHighlight(opened, (req) => received.push(req));
    unsub();

    // 2. 직접 번들 경로/이름 참조 (`sources/` 자동 탐색 + 공백 포함 프로젝트 경로)
    assert.equal(
      resolveResourceVaultPath(vault, "베스트일레븐.vclip", "라야.vproj/타임라인.outline"),
      "라야.vproj/sources/베스트일레븐.vclip"
    );

    vault.createFolder("라야 부상.vproj");
    vault.createFolder("라야 부상.vproj/sources");
    writeWebClipBundle(vault, "라야 부상.vproj/sources/인터풋볼_라야_부상_기사.vclip", {
      meta: createWebClipMeta({
        url: "https://www.interfootball.co.kr/news/articleView.html?idxno=999",
        title: "인터풋볼_라야_부상_기사",
      }),
      contentMd: "# 인터풋볼_라야_부상_기사\n\n아스널에 초대형 비상이 걸렸다.",
    });
    let openedSpaced = "";
    const okSpaced = openResourceTagInPair(
      "<<resource: 라야 부상.vproj/sources/인터풋볼_라야_부상_기사.vclip | 아스널에 초대형 비상이 걸렸다.>>",
      {
        vault,
        sourcePath: "라야 부상.vproj/라야_부상_타임라인.outline",
        openInPair: (p) => {
          openedSpaced = p;
        },
      }
    );
    assert.equal(okSpaced, true);
    assert.equal(openedSpaced, "라야 부상.vproj/sources/인터풋볼_라야_부상_기사.vclip");

    // 3. 미캐시 웹 URL 클릭 시 `.ref` 가 아니라 동레이어 `sources/<slug>.vclip` 번들 생성
    let openedNew = "";
    const ok2 = openResourceTagInPair(
      "<<resource: https://www.fmkorea.com/10583570806 | 팬 반응 요약>>",
      {
        vault,
        sourcePath: "라야.vproj/타임라인.outline",
        openInPair: (p) => {
          openedNew = p;
        },
      }
    );
    assert.equal(ok2, true);
    assert.ok(openedNew.startsWith("라야.vproj/sources/"));
    assert.ok(openedNew.endsWith(".vclip"));
    assert.ok(vault.exists(`${openedNew}/clip.json`));
    assert.ok(vault.exists(`${openedNew}/content.md`));
  });
});
