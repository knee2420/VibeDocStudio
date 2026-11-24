"""리서치 → 글쓰기 실행 결과 채점 (화면에서 시킨 결과를 재기만 한다 — 실행은 화면에서).

    python evals/research_eval.py --vault <볼트 루트> --topic <주제 폴더 상대 경로> [--doc <글 .vdoc 상대 경로>] --label <이름>

R1 레퍼런스: 주제 폴더 아래 .ref — 개수 · 블록 수 · 서로 다른 사이트 · 라이브러리 연결
R2 사진:     주제 폴더 아래 사진 — 개수 · 출처 노트에 라이선스가 있는 비율 · 중복 · 가로 1000px 이상 비율 · 서로 다른 캡션
R3 글:       블록 수 · 사진 블록 수 · 그중 수집 폴더 사진 비율 · 사진 출처 표기 · 레퍼런스 문장 30자 이상 복사 · 장(소제목) 수
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import sys
import urllib.parse
from pathlib import Path
from typing import Any

TARGETS = {
    "R0_role_folders": (">=", 1),
    "R1_refs": (">=", 2), "R1_min_blocks": (">=", 20), "R1_distinct_hosts": (">=", 2),
    "R2_images": (">=", 50), "R2_licensed_ratio": (">=", 1.0), "R2_duplicates": ("<=", 0), "R2_wide_ratio": (">=", 1.0),
    "R2_distinct_captions": (">=", 40),
    "R3_image_blocks": (">=", 10), "R3_images_from_collection": (">=", 1.0), "R3_credits": (">=", 1),
    "R3_copied_spans": ("<=", 0), "R3_sections": (">=", 5),
}
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
_HANGUL_RE = re.compile(r"[가-힣]")
_LETTER_RE = re.compile(r"[A-Za-z가-힣\u3040-\u30ff\u4e00-\u9fff]")


def ko_ratio(text: str) -> float:
    letters = len(_LETTER_RE.findall(text or ""))
    return round(len(_HANGUL_RE.findall(text or "")) / letters, 3) if letters else 0.0


def image_width(path: Path) -> int:
    data = path.read_bytes()[:256 * 1024]
    if data.startswith(b"\x89PNG"):
        return struct.unpack(">I", data[16:20])[0]
    if data.startswith(b"\xff\xd8"):
        i = 2
        while i < len(data) - 9:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2):
                return struct.unpack(">H", data[i + 7:i + 9])[0]
            i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP" and data[12:16] == b"VP8 ":
        return struct.unpack("<H", data[26:28])[0] & 0x3FFF
    return 0


def plain(html: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", html or "").split())


def doc_blocks(doc: dict[str, Any]) -> list[dict[str, Any]]:
    return [b for p in doc.get("pages") or [] for b in p.get("blocks") or []]


def collect_srcs(node: Any, out: list[str]) -> None:
    if isinstance(node, dict):
        for k, v in node.items():
            if k in ("src", "image", "thumbnail") and isinstance(v, str) and v:
                out.append(v)
            else:
                collect_srcs(v, out)
    elif isinstance(node, list):
        for v in node:
            collect_srcs(v, out)


def score(vault: Path, topic: str, doc_rel: str, *, expected_lang: str = "", min_images: int = 50) -> dict[str, Any]:
    base = vault / topic
    refs = sorted(base.rglob("*.ref"))
    ref_info = []
    ref_text = []
    for r in refs:
        d = json.loads(r.read_text(encoding="utf-8"))
        host = urllib.parse.urlsplit(str((d.get("source") or {}).get("uri") or "")).netloc
        blocks = d.get("blocks") or []
        block_text = " ".join(str(b.get("text") or "") for b in blocks)
        ref_info.append({
            "file": str(r.relative_to(vault)).replace("\\", "/"),
            "title": d.get("title"),
            "blocks": len(blocks),
            "ko_ratio": ko_ratio(block_text),
            "host": host,
            "library": bool((d.get("source") or {}).get("serverRefId")),
        })
        ref_text.extend(str(b.get("text") or "") for b in blocks)
    images = sorted(p for p in base.rglob("*") if p.suffix.lower() in IMG_EXT)
    # R0: 레퍼런스 · 사진 · 글이 주제 폴더 아래 서로 다른 역할별 하위 폴더에 분리되어 있는가
    ref_dirs = {p.parent.resolve() for p in refs}
    img_dirs = {p.parent.resolve() for p in images}
    base_res = base.resolve()
    refs_separated = bool(ref_dirs) and all(d != base_res for d in ref_dirs)
    imgs_separated = bool(img_dirs) and all(d != base_res for d in img_dirs)
    roles_distinct = refs_separated and imgs_separated and ref_dirs.isdisjoint(img_dirs)
    if doc_rel:
        doc_dir = (vault / doc_rel).parent.resolve()
        roles_distinct = roles_distinct and doc_dir not in ref_dirs and doc_dir not in img_dirs
    notes = "\n".join(n.read_text(encoding="utf-8") for n in base.rglob("_사진 출처.md"))
    licensed = 0
    captions = set()
    for img in images:
        m = re.search(r"## (.+?)\n\n!\[\[" + re.escape(img.name) + r"\]\]\n\n- 라이선스: (.+)", notes)
        if m and m.group(2).strip():
            licensed += 1
            captions.add(m.group(1).strip())
    hashes = [hashlib.md5(p.read_bytes()).hexdigest() for p in images]
    widths = [image_width(p) for p in images]
    targets = dict(TARGETS)
    targets["R2_images"] = (">=", min_images)
    targets["R2_distinct_captions"] = (">=", max(1, int(min_images * 0.8)))
    r: dict[str, Any] = {
        "R0_role_folders": 1 if roles_distinct else 0,
        "R1_refs": len(refs), "R1_min_blocks": min((x["blocks"] for x in ref_info), default=0),
        "R1_distinct_hosts": len({x["host"] for x in ref_info if x["host"]}),
        "R2_images": len(images), "R2_licensed_ratio": round(licensed / len(images), 3) if images else 0.0,
        "R2_duplicates": len(hashes) - len(set(hashes)), "R2_wide_ratio": round(sum(1 for w in widths if w >= 1000) / len(widths), 3) if widths else 0.0,
        "R2_distinct_captions": len(captions), "refs": ref_info,
    }
    if expected_lang.lower() == "ko":
        ko_matched = sum(1 for x in ref_info if x["ko_ratio"] >= 0.4)
        r["R1_lang_match_ratio"] = round(ko_matched / len(ref_info), 3) if ref_info else 0.0
        targets["R1_lang_match_ratio"] = (">=", 1.0)
    if doc_rel:
        doc = json.loads((vault / doc_rel).read_text(encoding="utf-8"))
        blocks = doc_blocks(doc)
        srcs: list[str] = []
        collect_srcs(blocks, srcs)
        img_srcs = [s for s in srcs if s.startswith("resource:") or s.startswith("http") or s.startswith("/")]
        topic_prefix = f"resource:vault:{topic.strip('/')}/"
        texts = [plain(str(s.get("content") or "")) for s in (doc.get("slots") or {}).values()]
        body = "\n".join(texts)
        copied = 0
        joined_ref = "\n".join(ref_text)
        for t in texts:
            for i in range(0, max(0, len(t) - 30), 15):
                if len(t[i:i + 30].strip()) >= 30 and t[i:i + 30] in joined_ref:
                    copied += 1
                    break
        r.update({
            "R3_blocks": len(blocks),
            "R3_image_blocks": len(img_srcs),
            "R3_images_from_collection": round(sum(1 for s in img_srcs if s.startswith(topic_prefix)) / len(img_srcs), 3) if img_srcs else 0.0,
            "R3_missing_files": [s for s in img_srcs if s.startswith("resource:vault:") and not (vault / s[len("resource:vault:"):]).is_file()],
            "R3_credits": 1 if re.search(r"(사진\s*출처|Photo|Wikimedia)", body) and re.search(r"CC\s?(BY|0)|퍼블릭|Public", body) else 0,
            "R3_copied_spans": copied,
            "R3_sections": sum(1 for b in blocks if b.get("kind") == "heading"),
            "doc": doc_rel, "title": doc.get("title"),
        })
    r["verdict"] = {k: _ok(r.get(k), *targets[k]) for k in targets if k in r}
    r["targets"] = {k: list(v) for k, v in targets.items() if k in r}
    return r


def _ok(value: Any, op: str, target: float) -> bool:
    if value is None:
        return False
    return value >= target if op == ">=" else value <= target


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", required=True)
    ap.add_argument("--topic", required=True)
    ap.add_argument("--doc", default="")
    ap.add_argument("--label", default="run")
    ap.add_argument("--lang", default="", help="기대 레퍼런스 언어 (예: ko)")
    ap.add_argument("--min-images", type=int, default=50, help="목표 수집 사진 수 (기본 50)")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    r = score(Path(args.vault), args.topic, args.doc, expected_lang=args.lang, min_images=args.min_images)
    out = Path(__file__).parent / "results" / "research"
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{args.label}.json").write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding="utf-8")
    for k, ok in r["verdict"].items():
        op, target = r["targets"][k]
        print(f"{'✅' if ok else '❌'} {k}: {r.get(k)} (목표 {op} {target})")
    for x in r.get("refs") or []:
        print(f"   ref {x['file']} · 블록 {x['blocks']} · 한글 {round(x.get('ko_ratio', 0) * 100)}% · {x['host']} · 라이브러리 {'O' if x['library'] else 'X'}")
    if r.get("R3_missing_files"):
        print("   없는 사진 파일:", r["R3_missing_files"][:5])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
