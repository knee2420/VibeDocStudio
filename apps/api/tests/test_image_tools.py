"""스크랩·리소스 이미지 조회 · 비파괴 조작 · 합성 도구(`rs_clip_images` · `rs_image_edit` · `rs_image_compose`) 테스트."""
from __future__ import annotations

import io
import json
import urllib.parse
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from vibefs.image_ops import compose_images, inspect_image, transform_image
from vibefs.index import MountItem, WorkspaceIndex
from vibefs.research_tools import RS_TOOL_SPECS, ResearchTools
from vibefs.store import WorkspaceStore
from vibefs.tools import WorkspaceTools


def _make_png(w: int = 800, h: int = 600, color: tuple[int, int, int, int] = (30, 120, 210, 255)) -> bytes:
    img = Image.new("RGBA", (w, h), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_jpg(w: int = 1200, h: int = 800, color: tuple[int, int, int] = (200, 80, 60)) -> bytes:
    img = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


class FakeApi:
    base = "http://local"

    def __init__(self) -> None:
        self.files: dict[str, str] = {}
        self.folders: list[str] = []

    def call(self, method: str, path: str, body: Any = None) -> dict[str, Any]:
        base, _, query = path.partition("?")
        if base.endswith("/folder"):
            self.folders.append(body["path"])
            return {"path": body["path"]}
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


def _setup(tmp_path: Path, remote_images: dict[str, bytes] | None = None) -> tuple[ResearchTools, FakeApi, WorkspaceStore, Path]:
    root = tmp_path / "vault"
    root.mkdir(parents=True)
    store = WorkspaceStore(str(tmp_path / "ws"))
    store.set_workbench(
        "s1",
        {
            "vaultId": "v1",
            "vaultRoot": str(root),
            "docId": "vdoc-a",
            "docPath": "라야 부상.vproj/타임라인.vdoc",
            "references": [],
            "referencesRoot": str(tmp_path / "refs"),
        },
    )
    api = FakeApi()
    remote_map = remote_images or {}
    referers_seen: list[str] = []

    def fake_fetch(url: str, *, limit: int, timeout: float = 30.0, accept: str = "*/*", referer: str = "") -> tuple[int, str, bytes, str]:
        referers_seen.append(referer)
        if url in remote_map:
            return 200, "image/jpeg", remote_map[url], url
        return 404, "text/html", b"", url

    tools = ResearchTools(store, "s1", conversation_id="conv-1", api=api, fetch=fake_fetch)  # type: ignore[arg-type]

    def upload(vault_id: str, folder: str, filename: str, data: bytes, mime: str) -> str:
        target_dir = root / folder
        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / filename).write_bytes(data)
        return f"{folder}/{filename}"

    tools._upload = upload  # type: ignore[method-assign]
    tools.referers_seen = referers_seen  # type: ignore[attr-defined]
    return tools, api, store, root


def test_image_ops_pipeline_and_compose() -> None:
    raw = _make_png(1000, 1000, (40, 100, 180, 255))
    meta = inspect_image(raw)
    assert meta["width"] == 1000 and meta["height"] == 1000 and meta["format"] == "PNG"

    # 정규화 크롭 + 16:9 비율 + 회전 + 리사이즈 + 보정 + 하이라이트 스포트라이트 + 블러 + JPEG 변환
    res = transform_image(
        raw,
        {
            "crop": [0.1, 0.1, 0.9, 0.9],
            "aspect": "16:9",
            "anchor": "top",
            "resize": {"maxWidth": 640},
            "adjust": {"contrast": 1.15, "sharpness": 1.2},
            "annotate": [
                {"type": "blur_region", "bbox": [0.0, 0.8, 0.3, 1.0], "radius": 8},
                {"type": "box", "bbox": [0.2, 0.2, 0.8, 0.75], "color": "#ef4444", "label": "핵심 포인트", "spotlight": True},
                {"type": "text", "pos": [0.05, 0.05], "text": "출처 확인"},
            ],
            "format": "jpg",
            "quality": 85,
        },
    )
    assert res["ext"] == ".jpg" and res["mime"] == "image/jpeg"
    assert res["newSize"] == (640, 360)
    assert any("aspect(16:9,top)" in a for a in res["applied"])
    assert "spotlight" in res["applied"]
    assert "blur_region" in res["applied"]

    # 회전 + 좌우 반전
    rot = transform_image(_make_jpg(400, 200), {"rotate": 90, "flip": "horizontal"})
    assert rot["newSize"] == (200, 400)

    # 3장 합성 (horizontal / vertical / grid)
    imgs = [_make_jpg(600, 400, (220, 40, 40)), _make_jpg(600, 400, (40, 180, 60)), _make_jpg(600, 400, (40, 80, 220))]
    comp_h = compose_images(imgs[:2], layout="horizontal", labels=["전", "후"])
    assert comp_h["count"] == 2 and comp_h["size"][0] > comp_h["size"][1]
    comp_v = compose_images(imgs[:2], layout="vertical", max_width=500)
    assert comp_v["size"][1] > comp_v["size"][0]
    comp_g = compose_images(imgs, layout="grid", labels=["컷1", "컷2", "컷3"])
    assert comp_g["count"] == 3 and comp_g["layout"] == "grid"


def test_rs_clip_images_and_rs_image_edit_from_vclip_and_mounts(tmp_path: Path) -> None:
    remote_url = "https://cdn.besteleven.com/news/photo/202611/314277_1.jpg"
    tools, api, store, root = _setup(tmp_path, {remote_url: _make_jpg(1200, 800)})

    # .vclip 번들 생성 (로컬 asset + 원형 capture + 본문 원격 이미지 URL 혼재)
    clip_dir = root / "라야 부상.vproj" / "sources" / "베스트일레븐_기사.vclip"
    (clip_dir / "assets").mkdir(parents=True)
    (clip_dir / "captures").mkdir(parents=True)
    (clip_dir / "clip.json").write_text(
        json.dumps({"clipId": "c1", "title": "베스트일레븐 기사", "url": "https://www.besteleven.com/news/314277"}, ensure_ascii=False),
        encoding="utf-8",
    )
    (clip_dir / "assets" / "hero.jpg").write_bytes(_make_jpg(900, 600))
    (clip_dir / "captures" / "shot_01.jpg").write_bytes(_make_jpg(1280, 900))
    (clip_dir / "content.md").write_text(
        f"# 베스트일레븐 기사\n\n![라야 부상 장면]({remote_url})\n\n아르테타 감독 인터뷰 본문.\n",
        encoding="utf-8",
    )

    # 1) rs_clip_images 로 3장 모두 번호와 함께 탐지
    listed = tools.call("rs_clip_images", {})
    assert "총 3장" in listed
    assert "#1 [로컬 asset]" in listed
    assert "#2 [원형 capture]" in listed
    assert "#3 [원격 기사 사진 L3]" in listed
    assert remote_url in listed

    # 2) #3 원격 기사 사진을 16:9 크롭 + 리사이즈 + 하이라이트해 프로젝트 사진 폴더에 추출
    clip_rel = "라야 부상.vproj/sources/베스트일레븐_기사.vclip"
    edited = tools.call(
        "rs_image_edit",
        {
            "clipPath": clip_rel,
            "imageIndex": 3,
            "ops": {
                "aspect": "16:9",
                "resize": {"maxWidth": 800},
                "annotate": [{"type": "box", "bbox": [0.25, 0.2, 0.75, 0.8], "label": "부상 장면", "spotlight": True}],
            },
            "filename": "라야_부상_장면",
            "caption": "뉴캐슬전 라야 부상 장면 (베스트일레븐)",
        },
    )
    assert "resource:vault:라야 부상.vproj/사진/라야_부상_장면.jpg" in edited
    assert "1200×800 → 800×450" in edited
    saved_file = root / "라야 부상.vproj" / "사진" / "라야_부상_장면.jpg"
    assert saved_file.is_file()
    assert inspect_image(saved_file.read_bytes())["width"] == 800
    assert "https://www.besteleven.com/news/314277" in tools.referers_seen  # type: ignore[attr-defined]
    # 출처 노트 및 세션 마운트 확인
    assert "라야 부상.vproj/사진/_사진 출처.md" in api.files
    mounts = store.mounts()
    assert any("사진" in item.path for m in mounts for item in m.items)

    # 3) 외부 마운트된 읽기 전용 리소스 이미지를 비파괴 조작 — 원본은 불변, 볼트 사진 폴더에 파생본 생성
    ext_dir = tmp_path / "external_mount"
    ext_dir.mkdir()
    ext_img = ext_dir / "diagram.png"
    ext_orig_bytes = _make_png(1000, 500)
    ext_img.write_bytes(ext_orig_bytes)
    store.set_mount("s1", [MountItem(str(ext_dir), "", "ext", kind="dir")], "conv-1")

    ext_out = tools.call(
        "rs_image_edit",
        {
            "source": str(ext_img),
            "ops": {"crop": [0.0, 0.0, 0.5, 1.0], "format": "png"},
            "filename": "diagram_left",
        },
    )
    assert "resource:vault:라야 부상.vproj/사진/diagram_left.png" in ext_out
    assert ext_img.read_bytes() == ext_orig_bytes  # 원본 무훼손
    assert inspect_image((root / "라야 부상.vproj" / "사진" / "diagram_left.png").read_bytes())["width"] == 500

    # 4) 마운트 밖 임의 로컬 파일 & 스크랩 안 된 임의 URL 은 차단
    secret_img = tmp_path / "secret.png"
    secret_img.write_bytes(_make_png(100, 100))
    with pytest.raises(ValueError, match="마운트된 리소스 폴더 밖"):
        tools.call("rs_image_edit", {"source": str(secret_img)})
    with pytest.raises(ValueError, match="스크랩된 .vclip"):
        tools.call("rs_image_edit", {"source": "https://evil.example/unscraped.jpg"})

    # 5) 다중 이미지 합성 (rs_image_compose: .vclip 로컬 asset + 방금 편집한 볼트 이미지)
    comp_out = tools.call(
        "rs_image_compose",
        {
            "sources": [
                {"clipPath": clip_rel, "imageIndex": 1, "label": "원본 기사 사진"},
                {"source": "resource:vault:라야 부상.vproj/사진/라야_부상_장면.jpg", "label": "하이라이트 편집본"},
            ],
            "layout": "horizontal",
            "filename": "라야_비교판",
        },
    )
    assert "resource:vault:라야 부상.vproj/사진/라야_비교판.jpg" in comp_out
    assert (root / "라야 부상.vproj" / "사진" / "라야_비교판.jpg").is_file()


def test_ws_images_hints_vclip_and_tool_specs_registered(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    clip_dir = vault / "proj.vproj" / "sources" / "기사.vclip"
    (clip_dir / "assets").mkdir(parents=True)
    (clip_dir / "content.md").write_text("# 기사\n![](https://example.com/a.jpg)\n", encoding="utf-8")
    (clip_dir / "assets" / "photo_01.jpg").write_bytes(_make_jpg(640, 480))

    ix = WorkspaceIndex.build([MountItem(str(vault / "proj.vproj" / "sources"), "vault:proj.vproj/sources", "sources", kind="dir")])
    ws = WorkspaceTools(ix)
    out = ws.ws_images()
    assert "resource:vault:proj.vproj/sources/기사.vclip/assets/photo_01.jpg" in out
    assert "rs_clip_images" in out

    # assets 없이 원격 이미지만 있는 .vclip 번들일 때도 rs_clip_images 안내를 반환
    clip_only_remote = vault / "proj2.vproj" / "sources" / "원격기사.vclip"
    clip_only_remote.mkdir(parents=True)
    (clip_only_remote / "content.md").write_text("# 원격\n![](https://example.com/b.jpg)\n", encoding="utf-8")
    ix2 = WorkspaceIndex.build([MountItem(str(vault / "proj2.vproj" / "sources"), "vault:proj2.vproj/sources", "sources", kind="dir")])
    out2 = WorkspaceTools(ix2).ws_images()
    assert "rs_clip_images" in out2 and "rs_image_edit" in out2

    # 도구 명세 등록 확인
    names = {s["name"] for s in RS_TOOL_SPECS}
    assert {"rs_clip_images", "rs_image_edit", "rs_image_compose"}.issubset(names)
