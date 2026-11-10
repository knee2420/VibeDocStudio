"""pdf-fidelity-engine 단독 CLI (`pdf-fidelity extract|render|measure|verify`)."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

from .extract.raw_truth import extract_page_truth
from .fonts.metrics import parse_font_map
from .layout.slot_renderer import default_tune, render_page
from .layout.table_grid import build_page_model
from .layout.zone_planner import default_plan
from .verify.browser_measure import measure_browser_page
from .verify.image_parity import verify_fidelity


def _cmd_extract(args: argparse.Namespace) -> int:
    pdf_path = Path(args.pdf)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    font_map = parse_font_map(args.font_map)
    truth = extract_page_truth(
        pdf_bytes=pdf_path.read_bytes(),
        page_number=args.page,
        out_dir=out_dir,
        pdf_label_path=str(pdf_path),
        font_map=font_map,
        render_rasters=not args.no_rasters,
        faux_bold_dedup=not args.no_faux_bold_dedup,
        space_ratio=args.space_ratio,
    )
    out_path = out_dir / "truth.json"
    out_path.write_text(json.dumps(truth, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {out_path} ({len(truth['spans'])} spans, {len(truth['rules'])} rules, {len(truth['images'])} images)")
    for w in truth.get("warnings", []):
        print(f"  WARN: {w}")
    return 0


def _cmd_render(args: argparse.Namespace) -> int:
    truth = json.loads(Path(args.truth).read_text(encoding="utf-8"))
    model = build_page_model(truth)
    plan = default_plan(model)
    tune = default_tune()
    page_num = int((truth.get("source") or {}).get("page") or 1)
    page_vdoc, slots = render_page(model, truth, plan, tune, page_number=page_num)
    payload = {"model": model, "plan": plan, "tune": tune, "page": page_vdoc, "slots": slots}
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {out_path} ({len(page_vdoc['blocks'])} blocks, {len(slots)} slots)")
    return 0


def _cmd_measure(args: argparse.Namespace) -> int:
    truth = json.loads(Path(args.truth).read_text(encoding="utf-8"))
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    measure = measure_browser_page(
        truth=truth,
        out_dir=str(out_dir),
        cdp_endpoint=args.cdp_endpoint,
        target_url_contains=args.target,
        page_selector=args.page_selector,
        page_text=args.page_text,
        viewport=args.viewport,
        reload_page=args.reload,
        calibrate=args.calibrate,
        settle=args.settle,
        hide_selectors=args.hide,
    )
    out_path = out_dir / "measure.json"
    out_path.write_text(json.dumps(measure, ensure_ascii=False, indent=2), encoding="utf-8")
    n_found = sum(1 for s in measure["spans"] if s)
    print(f"wrote {out_path} (matched {n_found}/{len(measure['spans'])} spans, {len(measure['rules'])} rules)")
    return 0


def _cmd_verify(args: argparse.Namespace) -> int:
    truth = json.loads(Path(args.truth).read_text(encoding="utf-8"))
    measure = json.loads(Path(args.measure).read_text(encoding="utf-8"))
    result = verify_fidelity(
        truth=truth,
        measure=measure,
        truth_dir=str(Path(args.truth).resolve().parent),
        measure_dir=str(Path(args.measure).resolve().parent),
        tol_pos=args.tol_pos,
        tol_size=args.tol_size,
        tol_img=args.tol_img,
        tol_rule=args.tol_rule,
        pix_margin=args.pix_margin,
        diff_path=args.diff,
    )
    if args.out:
        Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    s = result["summary"]
    px_info = s.get("pixels") or {}
    print(
        f"{result['verdict']}: {result['fail_count']} fail, {result['warn_count']} warn | "
        f"spans {s['spans_within_tol']}/{s['spans_total']} | "
        f"ink_f1_1px={px_info.get('ink_f1_1px')}%"
    )
    return 1 if result["verdict"] == "FAIL" else 0


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="pdf-fidelity", description="PDF 시각 충실도 추출·렌더·검증 CLI")
    sub = ap.add_subparsers(dest="command", required=True)

    ex = sub.add_parser("extract", help="PDF 1쪽에서 정규화 truth.json 추출")
    ex.add_argument("--pdf", required=True)
    ex.add_argument("--page", type=int, default=1)
    ex.add_argument("--out-dir", required=True)
    ex.add_argument("--font-map", action="append", default=[], help="이름=파일명 (쉼표 구분 가능)")
    ex.add_argument("--no-faux-bold-dedup", action="store_true")
    ex.add_argument("--no-rasters", action="store_true")
    ex.add_argument("--space-ratio", type=float, default=0.20)
    ex.set_defaults(func=_cmd_extract)

    rn = sub.add_parser("render", help="truth.json → 클린 슬롯 HTML VDoc JSON 생성")
    rn.add_argument("--truth", required=True)
    rn.add_argument("--out", required=True)
    rn.set_defaults(func=_cmd_render)

    ms = sub.add_parser("measure", help="CDP 브라우저 DOM Range · 스크린샷 측정")
    ms.add_argument("--truth", required=True)
    ms.add_argument("--out-dir", required=True)
    ms.add_argument("--cdp-endpoint", default="http://127.0.0.1:9222")
    ms.add_argument("--target", default="localhost")
    ms.add_argument("--page-selector", default=".prose-page, .vdoc-page, [data-page]")
    ms.add_argument("--page-text", default="")
    ms.add_argument("--viewport", default="1280x1600")
    ms.add_argument("--reload", action="store_true")
    ms.add_argument("--calibrate", action="store_true")
    ms.add_argument("--settle", type=float, default=0.8)
    ms.add_argument("--hide", action="append", default=[])
    ms.set_defaults(func=_cmd_measure)

    vf = sub.add_parser("verify", help="truth.json vs measure.json 판정 및 diff 생성")
    vf.add_argument("--truth", required=True)
    vf.add_argument("--measure", required=True)
    vf.add_argument("--out")
    vf.add_argument("--diff")
    vf.add_argument("--tol-pos", type=float, default=1.0)
    vf.add_argument("--tol-size", type=float, default=0.05)
    vf.add_argument("--tol-img", type=float, default=1.0)
    vf.add_argument("--tol-rule", type=float, default=1.5)
    vf.add_argument("--pix-margin", type=float, default=2.5)
    vf.set_defaults(func=_cmd_verify)
    return ap


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())

