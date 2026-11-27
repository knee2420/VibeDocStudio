"""웹 스크랩(`.vclip/`) 3단계 폭포수 추출기 · `rs_clip` 도구 · `.vclip/` 정본 색인 검증."""
from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

from app.resource.index.pipeline.contracts import ScopeProfile
from app.resource.index.pipeline.ingest import ingest_sources
from app.resource.webclip.extractor import normalize_fetch_url, scrape_web_clip
from vibefs.index import MountItem, WorkspaceIndex
from vibefs.research_tools import ResearchTools

SAMPLE_HTML = """<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>라야 부상 경위 및 복귀 전망 — 베스트일레븐</title>
  <meta name="author" content="김기자" />
  <meta property="article:published_time" content="2026-11-24T09:00:00Z" />
  <meta name="description" content="라야 골키퍼의 부상 발생 시점과 구단 공식 발표를 정리했다." />
</head>
<body>
  <nav>메뉴1 메뉴2 광고 배너</nav>
  <article>
    <h1>라야 부상 경위 및 복귀 전망</h1>
    <p>전반 38분 공중볼 경합 직후 착지 과정에서 오른쪽 허벅지에 통증을 호소했으나 전반 종료까지 경기를 소화했다.</p>
    <p>경기 후 감독은 기자회견에서 예방 차원의 정밀 검사를 진행할 예정이며, 심각한 장기 부상은 아닐 것으로 기대한다고 밝혔다.</p>
    <p>다음 날 훈련장에 복귀해 가벼운 회복 세션을 소화하며 주말 경기 출전 가능성을 높였다.</p>
    <img src="https://cdn.example.com/raya.png" alt="경기 장면" />
  </article>
  <footer>관련 기사 모음</footer>
</body>
</html>"""

TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0lQAAAAASUVORK5CYII="
)


def test_naver_blog_url_normalizes_to_postview() -> None:
    assert (
        normalize_fetch_url("https://blog.naver.com/myblog_id/223456789012")
        == "https://blog.naver.com/PostView.naver?blogId=myblog_id&logNo=223456789012"
    )
    assert normalize_fetch_url("https://www.besteleven.com/news/articleView.html?idxno=314277").startswith(
        "https://www.besteleven.com/"
    )


def test_scrape_bookmark_content_archive_and_blocked() -> None:
    def fake_fetch(url: str, **_kwargs: Any) -> tuple[int, str, bytes, str]:
        if url.endswith(".png"):
            return 200, "image/png", TINY_PNG, url
        if "fmkorea.com" in url:
            return 403, "text/html", b"<html><title>Just a moment...</title>Cloudflare Ray ID</html>", url
        return 200, "text/html; charset=utf-8", SAMPLE_HTML.encode("utf-8"), url

    # 1. bookmark 모드
    bm = scrape_web_clip(
        url="https://www.besteleven.com/news/articleView.html?idxno=314277",
        mode="bookmark",
        fetch=fake_fetch,
        browser_render=lambda _u: None,
    )
    assert bm.meta.captureMode == "bookmark"
    assert bm.meta.captureStatus == "partial"
    assert bm.meta.domain == "besteleven.com"
    assert bm.snapshotHtml is None

    # 2. content 모드 (정본 본문 추출)
    ct = scrape_web_clip(
        url="https://www.besteleven.com/news/articleView.html?idxno=314277",
        mode="content",
        fetch=fake_fetch,
        browser_render=lambda _u: None,
    )
    assert ct.meta.captureMode == "content"
    assert ct.meta.captureStatus == "full"
    assert "허벅지에 통증" in ct.contentMd
    assert ct.snapshotHtml is None

    # 3. archive 모드 (HTTP 전용 폴백: 브라우저 미사용 시 원시 HTML + 로컬 이미지 assets/)
    ar = scrape_web_clip(
        url="https://www.besteleven.com/news/articleView.html?idxno=314277",
        mode="archive",
        fetch=fake_fetch,
        browser_render=lambda _u: None,
    )
    assert ar.meta.captureMode == "archive"
    assert ar.meta.hasSnapshotHtml is True
    assert ar.snapshotHtml is not None
    assert len(ar.assets) == 1
    assert ar.assets[0].file == "assets/img_01.png"

    # 3-b. archive 모드 (브라우저 연속 화면 캡처 성공 시: 가짜 HTML 재포장 없이 captureTiles 보존)
    from app.resource.webclip.extractor import _BrowserRenderResult
    from app.resource.webclip.models import WebClipCaptureTilePayload

    def fake_browser_with_shots(url: str, *, capture_screenshots: bool = False) -> _BrowserRenderResult:
        assert capture_screenshots is True
        return _BrowserRenderResult(
            md="제1조(목적) 이 지침은 소프트웨어사업 계약 및 관리감독에 관한 사항을 규정한다. " * 8,
            title="소프트웨어사업 계약 및 관리감독에 관한 지침",
            snapshot_html=None,
            capture_tiles=[
                WebClipCaptureTilePayload(
                    index=1,
                    file="captures/shot_01.jpg",
                    mime="image/jpeg",
                    width=1280,
                    height=900,
                    scrollY=0,
                    totalHeight=1800,
                    base64=base64.b64encode(TINY_PNG).decode("ascii"),
                ),
                WebClipCaptureTilePayload(
                    index=2,
                    file="captures/shot_02.jpg",
                    mime="image/jpeg",
                    width=1280,
                    height=900,
                    scrollY=900,
                    totalHeight=1800,
                    base64=base64.b64encode(TINY_PNG).decode("ascii"),
                ),
            ],
        )

    ar_shots = scrape_web_clip(
        url="https://www.law.go.kr/행정규칙/테스트",
        mode="archive",
        fetch=fake_fetch,
        browser_render=fake_browser_with_shots,
    )
    assert ar_shots.meta.captureMode == "archive"
    assert ar_shots.stageUsed == "browser-render"
    assert ar_shots.meta.hasCaptureImage is True
    assert ar_shots.meta.hasSnapshotHtml is False
    assert ar_shots.snapshotHtml is None
    assert len(ar_shots.captureTiles) == 2
    assert len(ar_shots.meta.captureTiles) == 2
    assert ar_shots.captureTiles[0].file == "captures/shot_01.jpg"

    # 4. blocked-fallback 모드 (안티봇 사이트 정직 폴백)
    bl = scrape_web_clip(
        url="https://www.fmkorea.com/10583570806",
        mode="content",
        snippet="검색에서 확인된 경기 후 반응 요약",
        fetch=fake_fetch,
        browser_render=lambda _u: None,
    )
    assert bl.meta.captureStatus == "blocked-fallback"
    assert bl.stageUsed == "blocked-fallback"
    assert "검색에서 확인된 경기 후 반응 요약" in bl.contentMd


def test_vclip_indexing_reads_only_content_md_and_assets(tmp_path: Path) -> None:
    sources_dir = tmp_path / "sources"
    bundle = sources_dir / "베스트일레븐_라야.vclip"
    (bundle / "assets").mkdir(parents=True)
    (bundle / "captures").mkdir(parents=True)
    (bundle / "clip.json").write_text(
        json.dumps({"protocol": "vibe-clip/1.0", "clipId": "clip_1", "title": "라야 기사", "secretMeta": "CLIP_JSON_NOISE"}),
        encoding="utf-8",
    )
    (bundle / "content.md").write_text("# 라야 기사\n\n전반 38분 착지 과정에서 통증 발생.\n", encoding="utf-8")
    (bundle / "snapshot.html").write_text("<html><body>SNAPSHOT_HTML_NOISE</body></html>", encoding="utf-8")
    (bundle / "assets" / "img_01.png").write_bytes(TINY_PNG)
    (bundle / "captures" / "shot_01.jpg").write_bytes(TINY_PNG)

    # 1. vibefs WorkspaceIndex 검증
    idx = WorkspaceIndex.build([MountItem(path=str(sources_dir), resource_id="vault:sources", kind="dir")])
    rels = [e.rel for e in idx.files]
    assert any(r.endswith("베스트일레븐_라야.vclip/content.md") for r in rels)
    assert any(r.endswith("베스트일레븐_라야.vclip/assets/img_01.png") for r in rels)
    assert not any(r.endswith("clip.json") for r in rels)
    assert not any(r.endswith("snapshot.html") for r in rels)
    assert not any("captures/shot_01.jpg" in r for r in rels)

    # 2. resource.index ingest_sources 검증
    report = ingest_sources([str(sources_dir)], ScopeProfile())
    doc_paths = [d.rel_path for d in report.docs]
    assert any(p.endswith("베스트일레븐_라야.vclip/content.md") for p in doc_paths)
    assert not any(p.endswith("clip.json") for p in doc_paths)
    assert not any(p.endswith("snapshot.html") for p in doc_paths)
    assert any(img.endswith("img_01.png") for img in report.images)
    assert not any("captures/shot_01.jpg" in img for img in report.images)


def test_rs_clip_creates_vclip_bundle_in_same_layer_sources(tmp_path: Path) -> None:
    created_files: dict[str, str] = {}
    created_folders: list[str] = []
    mounted: list[MountItem] = []

    class FakeStore:
        def workbench_for(self, _sid: str) -> dict[str, Any]:
            return {
                "vaultId": "default-vault",
                "vaultRoot": str(tmp_path),
                "readOnly": False,
                "activeDocPath": "라야_보고서.vproj/보고서.vdoc",
            }

        def mounts(self) -> list[Any]:
            return []

        def set_mount(self, _sid: str, items: list[MountItem], *_args: Any, **_kwargs: Any) -> None:
            mounted.extend(items)

    class FakeApi:
        base = "http://127.0.0.1:8090"

        def call(self, method: str, path: str, payload: Any = None) -> dict[str, Any]:
            if method == "POST" and path == "/api/webclips/scrape":
                return {
                    "meta": {
                        "protocol": "vibe-clip/1.0",
                        "clipId": "clip_test1",
                        "url": payload["url"],
                        "canonicalUrl": payload["url"],
                        "domain": "besteleven.com",
                        "title": "베스트일레븐 라야 기사",
                        "captureMode": payload["mode"],
                        "sourceMethod": "research-auto",
                        "captureStatus": "full",
                    },
                    "contentMd": "# 베스트일레븐 라야 기사\n\n본문 내용입니다.\n",
                    "snapshotHtml": None,
                    "assets": [],
                    "wordCount": 6,
                    "stageUsed": "fast-http",
                }
            if method == "GET" and "/file?path=" in path:
                raise ValueError("오류 404")
            if method == "POST" and path.endswith("/folder"):
                created_folders.append(payload["path"])
                return {"path": payload["path"]}
            if method == "POST" and path.endswith("/file"):
                created_files[payload["path"]] = payload["content"]
                return {"path": payload["path"]}
            raise AssertionError(f"unexpected call: {method} {path}")

    tools = ResearchTools(FakeStore(), "sess-1", api=FakeApi())  # type: ignore[arg-type]
    out = tools.call("rs_clip", {"url": "https://www.besteleven.com/news/articleView.html?idxno=314277"})
    assert "웹 스크랩 완료" in out
    assert "라야_보고서.vproj/sources" in created_folders
    assert "라야_보고서.vproj/sources/베스트일레븐 라야 기사.vclip/clip.json" in created_files
    assert "라야_보고서.vproj/sources/베스트일레븐 라야 기사.vclip/content.md" in created_files
    assert len(mounted) == 1
    assert mounted[0].resource_id == "vault:라야_보고서.vproj/sources"


def test_archive_filters_avatar_and_tiny_noise_images() -> None:
    html_with_avatar = """<!doctype html><html><head><title>기사 테스트</title></head><body><article>
      <p>본문 문단이 충분히 길게 이어집니다. 경기 후 정밀 검사 결과가 공개되었으며 복귀 일정이 논의되고 있습니다.</p>
      <img src="https://cdn.example.com/images/default-user.png" alt="김기자 프로필 이미지" />
      <img src="https://cdn.example.com/images/article_main.png" alt="경기 현장 사진" />
    </article></body></html>"""
    big_png = TINY_PNG + b"\x00" * 4000

    def fake_fetch(url: str, **_kwargs: Any) -> tuple[int, str, bytes, str]:
        if url.endswith("default-user.png"):
            return 200, "image/png", TINY_PNG, url
        if url.endswith("article_main.png"):
            return 200, "image/png", big_png, url
        return 200, "text/html; charset=utf-8", html_with_avatar.encode("utf-8"), url

    res = scrape_web_clip(
        url="https://news.example.com/articles/123",
        mode="archive",
        fetch=fake_fetch,
        browser_render=lambda _u: None,
    )
    assert len(res.assets) == 1
    assert res.assets[0].originUrl.endswith("article_main.png")


def test_rs_clip_doc_vault_path_dedupe_upgrade_warnings_and_audit(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    proj = vault / "03_검증.vproj"
    proj.mkdir(parents=True)
    active_abs = proj / "문서.vdoc"
    active_abs.write_text("{}", encoding="utf-8")

    class DiskApi:
        base = "http://127.0.0.1:8090"

        def call(self, method: str, path: str, payload: Any = None) -> dict[str, Any]:
            if method == "POST" and path == "/api/webclips/scrape":
                mode = payload["mode"]
                url = payload["url"]
                is_home = url.rstrip("/").endswith(".go.kr")
                body = "# 제목\n\n" + ("짧음" if mode == "bookmark" or is_home else "충실한 본문 단어 " * 90)
                return {
                    "meta": {
                        "protocol": "vibe-clip/1.0",
                        "clipId": payload.get("clipId") or "clip_fixed_1",
                        "url": url,
                        "canonicalUrl": url,
                        "domain": "mois.go.kr" if is_home else "news.example.com",
                        "title": payload.get("title") or ("메인" if is_home else "심층 기사"),
                        "captureMode": mode,
                        "sourceMethod": "research-auto",
                        "captureStatus": "partial" if mode == "bookmark" else "full",
                    },
                    "contentMd": body,
                    "snapshotHtml": None,
                    "assets": [],
                    "wordCount": len(body.split()),
                    "stageUsed": "fast-http",
                }
            if method == "POST" and path.endswith("/folder"):
                (vault / payload["path"]).mkdir(parents=True, exist_ok=True)
                return {"path": payload["path"]}
            if method == "GET" and "/file?path=" in path:
                import urllib.parse

                rel = urllib.parse.parse_qs(path.split("?", 1)[1])["path"][0]
                target = vault / rel
                if not target.is_file():
                    raise ValueError("오류 404")
                return {"content": target.read_text(encoding="utf-8")}
            if method in ("POST", "PUT") and path.endswith("/file"):
                target = vault / payload["path"]
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(payload["content"], encoding="utf-8")
                return {"path": payload["path"]}
            raise AssertionError((method, path))

    class StoreWithDocVaultPath:
        def workbench_for(self, _sid: str) -> dict[str, Any]:
            return {
                "vaultId": "v1",
                "vaultRoot": str(vault),
                "readOnly": False,
                "docVaultPath": "03_검증.vproj/문서.vdoc",
                "docPath": str(active_abs),
            }

        def mounts(self) -> list[Any]:
            return []

        def set_mount(self, *_args: Any, **_kwargs: Any) -> None:
            return None

    tools = ResearchTools(StoreWithDocVaultPath(), "sess-2", api=DiskApi())  # type: ignore[arg-type]

    # 1) docVaultPath 기반 자동 sources/ 배치 + bookmark 수집
    r1 = tools.call("rs_clip", {"url": "https://news.example.com/article/99", "mode": "bookmark"})
    assert "03_검증.vproj/sources/심층 기사.vclip" in r1

    # 2) 동일 URL 을 content 모드로 재수집 → 중복 번들 없이 제자리 업그레이드 & clipId 유지
    r2 = tools.call("rs_clip", {"url": "https://news.example.com/article/99", "mode": "content"})
    assert "업그레이드" in r2
    bundles = list((proj / "sources").glob("*.vclip"))
    assert len(bundles) == 1
    meta = json.loads((bundles[0] / "clip.json").read_text(encoding="utf-8"))
    assert meta["clipId"] == "clip_fixed_1" and meta["captureMode"] == "content"

    # 3) 동일 URL 을 bookmark/content 로 다시 호출 → 기존 재사용
    r3 = tools.call("rs_clip", {"url": "https://news.example.com/article/99", "mode": "content"})
    assert "기존 재사용" in r3

    # 4) 루트 홈페이지 URL → 루트 URL 경고 + 얇은 본문 경고
    r4 = tools.call("rs_clip", {"url": "https://www.mois.go.kr/", "mode": "content"})
    assert "루트 홈페이지" in r4 and "얇다" in r4

    # 5) rs_audit 자가 감사 → 루트URL + 얇은본문 경고 보고 (.vibe-trash 는 제외)
    trashed = proj / ".vibe-trash" / "old.vclip"
    trashed.mkdir(parents=True)
    (trashed / "clip.json").write_text(json.dumps({"url": "https://trash.example/"}), encoding="utf-8")
    audit = tools.call("rs_audit", {})
    assert "리서치 감사" in audit and "루트URL" in audit and "얇은본문" in audit
    assert "old.vclip" not in audit
