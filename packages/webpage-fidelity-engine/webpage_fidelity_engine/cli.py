"""webpage-fidelity-engine 단독 CLI (`webpage-fidelity extract <url> --out out.vdoc.json`)."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

from .models import PageSplitMode, WebpageExtractOptions
from .pipeline import run_webpage_extraction


def _cmd_extract(args: argparse.Namespace) -> int:
    split_mode: PageSplitMode = args.split_mode
    opts = WebpageExtractOptions(
        target_height_px=args.height,
        split_mode=split_mode,
        include_images=not args.no_images,
        inline_images=not args.no_inline_images,
        generate_thumbnails=not args.no_thumbnails,
        use_browser_fallback=not args.no_browser,
    )
    html_text = Path(args.html_file).read_text(encoding="utf-8") if args.html_file else ""
    res = run_webpage_extraction(
        args.url or "",
        html=html_text,
        title=args.title or "",
        options=opts,
    )
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(res.document, ensure_ascii=False, indent=2), encoding="utf-8")
    m = res.metrics
    print(
        f"wrote {out_path} | profile={m.profile_used} | pages={m.page_count} "
        f"| blocks={m.block_count} | slots={m.slot_count} "
        f"| images={m.image_resolved}/{m.image_total}"
    )
    for w in res.warnings:
        print(f"  WARN: {w}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="webpage-fidelity", description="웹페이지/블로그/칼럼 → .vdoc 추출 CLI")
    sub = ap.add_subparsers(dest="command", required=True)

    ex = sub.add_parser("extract", help="URL 또는 HTML 파일을 .vdoc JSON 으로 변환")
    ex.add_argument("--url", default="")
    ex.add_argument("--html-file", default="")
    ex.add_argument("--title", default="")
    ex.add_argument("--out", required=True)
    ex.add_argument("--split-mode", choices=["height", "heading", "single"], default="height")
    ex.add_argument("--height", type=int, default=1123)
    ex.add_argument("--no-images", action="store_true")
    ex.add_argument("--no-inline-images", action="store_true")
    ex.add_argument("--no-thumbnails", action="store_true")
    ex.add_argument("--browser-fallback", action="store_true", help="(호환용) 브라우저 실측은 기본 활성화됩니다.")
    ex.add_argument("--no-browser", action="store_true", help="브라우저 실측 없이 정적 HTML 휴리스틱만 사용")
    ex.set_defaults(func=_cmd_extract)
    return ap


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())

