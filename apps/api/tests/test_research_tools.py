"""리서치 도구 (rs_*) · 웹 검색 게이트 · 볼트 사진 id — 밖의 자료를 볼트로 들여오는 기본기.

실제 웹 · API 대신 가짜 응답을 쓴다. 지키는 것: 볼트 모드 · 쓰기 가능일 때만 쓴다, 볼트 밖 경로는 거부,
자유 라이선스 사진만, 이미지가 아닌 파일은 건너뜀, 출처 노트, 저장 폴더는 세션 리소스로 마운트.
"""
from __future__ import annotations

import json
import urllib.parse
from pathlib import Path
from typing import Any

import pytest

from vibefs.doc_tools import DocTools
from vibefs.hook import decide
from vibefs.index import MountItem, WorkspaceIndex
from vibefs.research_tools import ResearchTools, read_page
from vibefs.store import WorkspaceStore
from vibefs.tools import WorkspaceTools

JPEG = b"\xff\xd8\xff\xe0" + b"0" * 200


class FakeApi:
    base = "http://local"

    def __init__(self) -> None:
        self.files: dict[str, str] = {}
        self.folders: list[str] = []
        self.calls: list[tuple[str, str]] = []

    def call(self, method: str, path: str, body: Any = None) -> dict[str, Any]:
        self.calls.append((method, path))
        base, _, query = path.partition("?")
        if base.endswith("/folder"):
            self.folders.append(body["path"])
            return {"path": body["path"]}
        if base == "/api/reference/items/url":
            return {"refId": "ref-new-1"}
        if base.endswith("/normalized"):
            return {"refId": "local-1", "title": "도쿄 3박 4일 여행 후기", "status": "ready", "layerSet": "blog",
                    "frames": [{}, {}], "blocks": [{"id": "b1"}, {"id": "b2"}, {"id": "b3"}], "outline": [{}], "pins": [],
                    "source": {"originType": "web", "uri": "https://blog.example/tokyo"}}
        if base.endswith("/file"):
            if method == "GET":
                rel = urllib.parse.parse_qs(query)["path"][0]
                if rel not in self.files:
                    raise ValueError("문서 API 오류 404: none")
                return {"content": self.files[rel]}
            if method == "POST" and body["path"] in self.files:
                raise ValueError("문서 API 오류 409: exists")
            self.files[body["path"]] = body["content"]
            return {"path": body["path"]}
        raise AssertionError((method, path))


def _commons_payload() -> bytes:
    def page(pid: int, title: str, lic: str, width: int = 4000) -> dict[str, Any]:
        return {"pageid": pid, "index": pid, "title": title, "imageinfo": [{
            "width": width, "height": 2600, "mime": "image/jpeg", "thumburl": f"https://img.example/{pid}.jpg",
            "descriptionurl": f"https://commons.example/{pid}",
            "extmetadata": {"LicenseShortName": {"value": lic}, "Artist": {"value": "<a href='x'>Kim</a>"},
                            "ImageDescription": {"value": f"<p>{title} at dusk</p>"}}}]}
    pages = {"1": page(1, "File:Sensoji.jpg", "CC BY-SA 4.0"), "2": page(2, "File:Shibuya.jpg", "CC0"),
             "3": page(3, "File:Private.jpg", "CC BY-NC 2.0"), "4": page(4, "File:Tiny.jpg", "CC BY 4.0", width=300)}
    return json.dumps({"query": {"pages": pages}}).encode("utf-8")


def fake_fetch(url: str, *, limit: int, timeout: float = 30.0, accept: str = "*/*") -> tuple[int, str, bytes, str]:
    if "commons.wikimedia.org" in url:
        return 200, "application/json", _commons_payload(), url
    if url.startswith("https://img.example/2"):
        return 200, "text/html", b"<html>not an image</html>", url
    if url.startswith("https://img.example/"):
        return 200, "image/jpeg", JPEG, url
    if url == "https://blog.example/frame":
        body = "<html><head><title>틀</title></head><body><iframe id='mainFrame' src='/post/123'></iframe></body></html>"
        return 200, "text/html; charset=utf-8", body.encode("utf-8"), url
    if url == "https://blog.example/post/123":
        paras = "".join(f"<p>{'도쿄 여행 첫날 아사쿠사를 걸었다. ' * 8}</p>" for _ in range(6))
        body = (f"<html><title>도쿄 여행 후기</title><body><h2>1일차 아사쿠사</h2><img src='a.jpg'><h2>2일차 시부야</h2>"
                f"<img data-src='b.jpg'>{paras}<script>var x='<p>no</p>'</script></body></html>")
        return 200, "text/html; charset=utf-8", body.encode("utf-8"), url
    return 404, "text/html", b"", url


def _setup(tmp_path: Path, **state: Any) -> tuple[ResearchTools, FakeApi, WorkspaceStore, Path]:
    root = tmp_path / "vault"
    root.mkdir(parents=True)
    store = WorkspaceStore(str(tmp_path / "ws"))
    store.set_workbench("s1", {"vaultId": "v1", "vaultRoot": str(root), "docId": "vdoc-a", "references": [],
                               "referencesRoot": str(tmp_path / "refs"), **state})
    api = FakeApi()
    tools = ResearchTools(store, "s1", conversation_id="conv-1", api=api, fetch=fake_fetch)  # type: ignore[arg-type]
    uploads: list[tuple[str, str, bytes]] = []

    def upload(vault_id: str, folder: str, filename: str, data: bytes, mime: str) -> str:
        uploads.append((folder, filename, data))
        (root / folder).mkdir(parents=True, exist_ok=True)
        (root / folder / filename).write_bytes(data)
        return f"{folder}/{filename}"

    tools._upload = upload  # type: ignore[method-assign]
    tools.uploads = uploads  # type: ignore[attr-defined]
    return tools, api, store, root


def test_folder_is_vault_relative_and_respects_read_only(tmp_path: Path) -> None:
    tools, api, _, _ = _setup(tmp_path)
    assert "여행/도쿄/사진" in tools.call("rs_folder", {"path": "여행\\도쿄/사진/"})
    assert api.folders == ["여행/도쿄/사진"]
    for bad in ("../밖", "C:/Windows", "a/../../b", ""):
        with pytest.raises(ValueError):
            tools.call("rs_folder", {"path": bad})
    ro, _, _, _ = _setup(tmp_path / "ro", readOnly=True)
    with pytest.raises(ValueError, match="읽기 전용"):
        ro.call("rs_folder", {"path": "a"})
    store = WorkspaceStore(str(tmp_path / "studio"))
    store.set_workbench("s1", {"docId": "vdoc-a"})
    with pytest.raises(ValueError, match="볼트 모드"):
        ResearchTools(store, "s1", api=FakeApi(), fetch=fake_fetch).call("rs_folder", {"path": "a"})  # type: ignore[arg-type]


def test_page_reads_structure_and_follows_blog_frame() -> None:
    page = read_page("https://blog.example/frame", fake_fetch)
    assert page["ok"] and page["images"] == 2 and page["headings"] == ["1일차 아사쿠사", "2일차 시부야"]
    assert page["chars"] > 800 and "no" not in page["lead"]
    assert page["ko_ratio"] > 0.7 and page["paragraphs"] >= 4 and page["avg_p"] >= 40
    assert not read_page("https://blog.example/missing", fake_fetch)["ok"]


def test_page_surfaces_language_byline_and_format_signals(tmp_path: Path) -> None:
    def rich_fetch(url: str, *, limit: int, timeout: float = 30.0, accept: str = "*/*") -> tuple[int, str, bytes, str]:
        if "ko-blog" in url:
            body = (
                "<html lang='ko'><head><title>오사카 3박 4일 솔직 후기</title>"
                "<meta property='og:type' content='article'/>"
                "<meta name='author' content='여행자김'/>"
                "<meta property='article:published_time' content='2026-04-12T10:00:00Z'/>"
                "<script type='application/ld+json'>{\"@type\":\"BlogPosting\",\"author\":{\"name\":\"여행자김\"}}</script>"
                "</head><body><article><h2>1일차 도톤보리</h2>"
                + "".join(f"<p>{'도톤보리 저녁 골목을 걸으며 타코야키를 먹었던 경험이 아주 인상 깊었다. ' * 2}</p>" for _ in range(5))
                + "</article></body></html>"
            )
            return 200, "text/html; charset=utf-8", body.encode("utf-8"), url
        body = (
            "<html lang='en'><head><title>Osaka Travel Guide Directory</title></head><body>"
            + "".join(f"<a href='/p/{i}'>Guide link item number {i}</a> " for i in range(40))
            + "</body></html>"
        )
        return 200, "text/html; charset=utf-8", body.encode("utf-8"), url

    tools, _, _, _ = _setup(tmp_path)
    tools.fetch = rich_fetch
    ko_out = tools.call("rs_page", {"url": "https://ko-blog.example/osaka"})
    assert "한국어" in ko_out and "여행자김" in ko_out and "2026-04-12" in ko_out
    assert "schema:BlogPosting" in ko_out and "단일 글 신호" in ko_out

    en_out = tools.call("rs_page", {"url": "https://guide.example/osaka"})
    assert "한글 0%" in en_out and "링크 밀도 높음" in en_out


def test_research_eval_checks_role_folders_and_korean_refs(tmp_path: Path) -> None:
    from evals.research_eval import score

    vault = tmp_path / "vault"
    (vault / "여행/오사카/레퍼런스").mkdir(parents=True)
    (vault / "여행/오사카/사진").mkdir(parents=True)
    (vault / "여행/오사카/글").mkdir(parents=True)
    for i, host in enumerate(("a.tistory.com", "b.blog.naver.com"), 1):
        ref_doc = {
            "title": f"오사카 여행기 {i}",
            "source": {"uri": f"https://{host}/post/{i}", "serverRefId": f"ref-{i}"},
            "blocks": [{"id": f"b{j}", "text": f"오사카 난바 거리 산책 후기 문단 {j}"} for j in range(25)],
        }
        (vault / f"여행/오사카/레퍼런스/ref{i}.ref").write_text(json.dumps(ref_doc, ensure_ascii=False), encoding="utf-8")
    (vault / "여행/오사카/사진/img1.jpg").write_bytes(JPEG)
    (vault / "여행/오사카/사진/_사진 출처.md").write_text(
        "## 도톤보리 야경\n\n![[img1.jpg]]\n\n- 라이선스: CC BY 4.0\n", encoding="utf-8"
    )
    vdoc = {"title": "오사카 가이드", "pages": [{"blocks": [{"kind": "heading"}]}], "slots": {}}
    (vault / "여행/오사카/글/오사카.vdoc").write_text(json.dumps(vdoc, ensure_ascii=False), encoding="utf-8")

    res = score(vault, "여행/오사카", "여행/오사카/글/오사카.vdoc", expected_lang="ko", min_images=1)
    assert res["R0_role_folders"] == 1
    assert res["R1_lang_match_ratio"] == 1.0
    assert res["verdict"]["R0_role_folders"] is True
    assert res["verdict"]["R1_lang_match_ratio"] is True


def test_image_search_keeps_only_free_licenses_and_size(tmp_path: Path) -> None:
    tools, _, _, _ = _setup(tmp_path)
    out = tools.call("rs_image_search", {"query": "Senso-ji Asakusa", "count": 10})
    assert "commons:1" in out and "commons:2" in out
    assert "commons:3" not in out, "비상업(NC) 라이선스는 빼야 한다"
    assert "commons:4" not in out, "너무 작은 사진은 빼야 한다"
    assert "CC BY-SA 4.0" in out and "Kim" in out and "<a" not in out


def test_image_save_downloads_checks_writes_note_and_mounts_folder(tmp_path: Path) -> None:
    tools, api, store, root = _setup(tmp_path)
    out = tools.call("rs_image_save", {"folder": "여행/도쿄/사진", "items": [
        {"id": "commons:1", "caption": "센소지 가미나리몬"},
        {"id": "commons:2", "caption": "시부야 스크램블"},       # 내려받으니 이미지가 아니다 → 건너뜀
        {"id": "commons:3", "caption": "비상업 사진"},           # 자유 라이선스 아님 → 건너뜀
    ]})
    assert "저장 1장" in out and "건너뜀 2장" in out
    assert [u[1] for u in tools.uploads] == ["센소지 가미나리몬.jpg"]  # type: ignore[attr-defined]
    note = api.files["여행/도쿄/사진/_사진 출처.md"]
    assert "![[센소지 가미나리몬.jpg]]" in note and "CC BY-SA 4.0" in note and "https://commons.example/1" in note
    mount = store.mount_for("conv-1", "s1")
    assert mount is not None and any(i.resource_id == "vault:여행/도쿄/사진" for i in mount.items)
    # 마운트된 사진은 resource:vault:<경로> 로 문서에 넣을 수 있고, 출처 노트 줄이 맥락이 된다
    index = WorkspaceIndex.build(mount.items, id_map=mount.id_map)
    images = WorkspaceTools(index).ws_images()
    assert "resource:vault:여행/도쿄/사진/센소지 가미나리몬.jpg" in images
    assert "CC BY-SA" in images or "센소지" in images
    # 두 번째 저장은 출처 노트에 이어 쓴다 · 마운트는 그대로 하나
    tools.call("rs_image_save", {"folder": "여행/도쿄/사진", "items": [{"id": "commons:1", "caption": "센소지 본당"}]})
    assert api.files["여행/도쿄/사진/_사진 출처.md"].count("## ") == 2
    assert sum(1 for i in store.mount_for("conv-1", "s1").items if i.resource_id.startswith("vault:")) == 1


def test_ref_import_writes_ref_file_and_turns_it_on_in_workbench(tmp_path: Path) -> None:
    tools, api, store, _ = _setup(tmp_path)
    out = tools.call("rs_ref_import", {"url": "https://blog.example/tokyo", "folder": "여행/도쿄/레퍼런스"})
    assert "ref:ref-new-1" in out and "블록 3개" in out and "얇다" in out and "vault://여행/도쿄/레퍼런스/도쿄 3박 4일 여행 후기.ref" in out
    ref = json.loads(api.files["여행/도쿄/레퍼런스/도쿄 3박 4일 여행 후기.ref"])
    assert ref["source"]["serverRefId"] == "ref-new-1" and ref["nameSource"] == "auto"
    refs = store.workbench_for("s1")["references"]
    assert refs[0]["refId"] == "ref-new-1" and refs[0]["dir"].endswith("ref-new-1")
    # 같은 이름이 또 오면 번호를 붙인다 (덮어쓰지 않는다)
    tools.call("rs_ref_import", {"url": "https://blog.example/tokyo", "folder": "여행/도쿄/레퍼런스"})
    assert "여행/도쿄/레퍼런스/도쿄 3박 4일 여행 후기 (2).ref" in api.files
    with pytest.raises(ValueError):
        tools.call("rs_ref_import", {"url": "file:///C:/secret", "folder": "x"})


def test_redirect_proxy_url_is_resolved_to_canonical_blog_host(tmp_path: Path) -> None:
    seen_urls: list[str] = []
    tools, api, _, _ = _setup(tmp_path)

    orig_call = api.call

    def spy_call(method: str, path: str, body: Any = None) -> dict[str, Any]:
        if path == "/api/reference/items/url" and isinstance(body, dict):
            seen_urls.append(str(body.get("url") or ""))
        return orig_call(method, path, body)

    api.call = spy_call  # type: ignore[method-assign]

    def redirect_fetch(url: str, *, limit: int, timeout: float = 30.0, accept: str = "*/*") -> tuple[int, str, bytes, str]:
        if "vertexaisearch.cloud.google.com" in url:
            body = "<html lang='ko'><head><title>스페셜티 핸드드립 후기</title></head><body><p>원두 분쇄도와 물 온도 조절 경험을 정리했습니다.</p></body></html>"
            return 200, "text/html; charset=utf-8", body.encode("utf-8"), "https://coffee-diary.tistory.com/42"
        return fake_fetch(url, limit=limit, timeout=timeout, accept=accept)

    tools.fetch = redirect_fetch
    page_out = tools.call("rs_page", {"url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123"})
    assert "https://coffee-diary.tistory.com/42" in page_out

    tools.call("rs_ref_import", {
        "url": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc123",
        "folder": "커피/레퍼런스",
    })
    assert seen_urls == ["https://coffee-diary.tistory.com/42"]


def test_web_search_is_open_only_for_writable_vault_sessions(tmp_path: Path) -> None:
    store = WorkspaceStore(str(tmp_path / "ws"))
    call = {"toolCall": {"name": "search_web", "args": {"query": "도쿄 여행 블로그"}}, "conversationId": "conv-1"}
    store.set_workbench("s1", {"docId": "vdoc-a", "conversationIds": ["conv-1"]})
    assert decide(call, store)["decision"] == "deny"
    store.set_workbench("s1", {"docId": "vdoc-a", "vaultId": "v1", "conversationIds": ["conv-1"]})
    assert decide(call, store)["decision"] == "allow"
    store.set_workbench("s1", {"docId": "vdoc-a", "vaultId": "v1", "readOnly": True, "conversationIds": ["conv-1"]})
    assert decide(call, store)["decision"] == "deny"
    other = {"toolCall": {"name": "browser_open", "args": {}}, "conversationId": "conv-1"}
    assert decide(other, store)["decision"] == "deny"


def test_vault_mount_gives_vault_ids_only_under_vault_roots(tmp_path: Path) -> None:
    root = tmp_path / "vault"
    (root / "사진").mkdir(parents=True)
    (root / "사진" / "a.jpg").write_bytes(JPEG)
    ext = tmp_path / "ext"
    ext.mkdir()
    (ext / "b.jpg").write_bytes(JPEG)
    whole = WorkspaceIndex.build([MountItem(str(root), "vault:/", "vault", kind="dir")])
    assert [e.resource_id for e in whole.files] == ["vault:사진/a.jpg"]
    sub = WorkspaceIndex.build([MountItem(str(root / "사진"), "vault:사진", "사진", kind="dir"),
                                MountItem(str(ext), "ext:x", "ext", kind="dir")])
    assert sorted(e.resource_id for e in sub.files) == ["", "vault:사진/a.jpg"]


def test_read_only_vault_blocks_agent_draft_writes(tmp_path: Path) -> None:
    from tests.test_vault_workbench import FakeStore, FakeVaultApi, _vault_state

    tools = DocTools(FakeStore(_vault_state(readOnly=True)), "s1", api=FakeVaultApi("v1", {}))  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="읽기 전용"):
        tools.call("dc_new", {"title": "초안"})
