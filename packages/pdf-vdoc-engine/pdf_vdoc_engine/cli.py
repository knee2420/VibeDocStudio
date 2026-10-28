"""CLI 진입점: `python -m pdf_vdoc_engine.cli <input.pdf> --out <output.vdoc>`."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .pipeline import extract_vdoc_from_pdf


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Deterministic PDF to .vdoc Extractor")
    parser.add_argument("pdf_path", type=Path, help="Input PDF file path")
    parser.add_argument("--doc-id", default="vdoc_extracted", help="Target .vdoc document ID")
    parser.add_argument("--title", default="", help="Document title (defaults to filename stem)")
    parser.add_argument("--out", type=Path, default=None, help="Output .vdoc file path")
    args = parser.parse_args(argv)

    pdf_bytes = args.pdf_path.read_bytes()
    title = args.title or args.pdf_path.stem
    vdoc, score = extract_vdoc_from_pdf(pdf_bytes=pdf_bytes, doc_id=args.doc_id, title=title)

    if not score.valid:
        for err in score.errors:
            print(f"[VALIDATION ERROR] {err}", file=sys.stderr)
        return 1

    output_text = json.dumps(vdoc, ensure_ascii=False, indent=2)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(output_text, encoding="utf-8")
    else:
        print(output_text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
