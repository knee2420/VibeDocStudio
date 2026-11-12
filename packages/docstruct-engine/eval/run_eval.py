"""Local evaluation runner for docstruct-engine (skips missing local paths cleanly)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from docstruct_engine.ir.model import PageIR
    from docstruct_engine.verify.report import EvalReport, PageVerifyReport

EVAL_DIR = Path(__file__).resolve().parent
PKG_ROOT = EVAL_DIR.parent
PACKAGES_ROOT = PKG_ROOT.parent


def _bootstrap_paths() -> None:
    for pkg in (
        PKG_ROOT,
        PACKAGES_ROOT / "harness-kit",
    ):
        if pkg.is_dir() and str(pkg) not in sys.path:
            sys.path.insert(0, str(pkg))


def load_thresholds() -> dict[str, Any]:
    pack_path = EVAL_DIR.parents[1] / "harness-packs" / "docstruct" / "thresholds.json"
    if pack_path.is_file():
        return json.loads(pack_path.read_text(encoding="utf-8"))
    return {
        "rulingLineF1Min": 0.90,
        "rulingScanLineF1Min": 0.85,
        "tableTedsMin": 0.95,
        "tableTedsSMin": 0.95,
        "readingNedMax": 0.03,
        "fieldF1Min": 0.88,
    }


def _check_cdp_available(cdp_url: str = "http://127.0.0.1:9222/json/version") -> bool:
    import urllib.error
    import urllib.request

    try:
        with urllib.request.urlopen(cdp_url, timeout=1.5) as resp:
            return resp.status == 200
    except (OSError, urllib.error.URLError):
        return False


def evaluate_page_against_gold(
    pred: PageIR,
    gold: Optional[PageIR],
    thresholds: dict[str, Any],
) -> PageVerifyReport:
    _bootstrap_paths()
    from docstruct_engine.ir.html_codec import table_to_html
    from docstruct_engine.ir.model import TableIR
    from docstruct_engine.ir.validate import validate_page_ir
    from docstruct_engine.verify.fields import evaluate_fields
    from docstruct_engine.verify.lines import compare_rulings, table_grid_lines
    from docstruct_engine.verify.ned import page_ned
    from docstruct_engine.verify.report import PageVerifyReport
    from docstruct_engine.verify.teds import page_table_teds

    val = validate_page_ir(pred)
    pred_tbl_lines = [r for b in pred.blocks if isinstance(b, TableIR) for r in table_grid_lines(b)]
    gold_rulings = gold.rulings if gold is not None and gold.rulings else pred.rulings
    line_res = compare_rulings(pred_tbl_lines or pred.rulings, gold_rulings)

    teds_val: Optional[float] = None
    teds_s_val: Optional[float] = None
    ned_val: Optional[float] = None
    fld_f1: Optional[float] = None
    failures: list[str] = []

    if not val.ok:
        failures.append(f"invariants({len(val.violations)})")

    min_line = (
        thresholds.get("rulingScanLineF1Min", 0.85)
        if pred.sourceKind == "pdf-scan"
        else thresholds.get("rulingLineF1Min", 0.90)
    )
    if (pred_tbl_lines or gold_rulings) and line_res.f1 < min_line:
        failures.append(f"lineF1({line_res.f1:.3f}<{min_line})")

    if gold is not None:
        pred_words = {w.id: w for w in pred.words}
        gold_words = {w.id: w for w in gold.words}
        pred_htmls = [table_to_html(b, pred_words) for b in pred.blocks if isinstance(b, TableIR)]
        gold_htmls = [table_to_html(b, gold_words) for b in gold.blocks if isinstance(b, TableIR)]
        teds_val, teds_s_val = page_table_teds(pred_htmls, gold_htmls)
        ned_val = page_ned(pred, gold)
        fld_res = evaluate_fields(pred, gold)
        fld_f1 = fld_res.f1
        if teds_val < thresholds.get("tableTedsMin", 0.95):
            failures.append(f"TEDS({teds_val:.3f})")
        if teds_s_val < thresholds.get("tableTedsSMin", 0.95):
            failures.append(f"TEDS-S({teds_s_val:.3f})")
        if ned_val > thresholds.get("readingNedMax", 0.03):
            failures.append(f"NED({ned_val:.3f})")
        if fld_res.goldCount > 0 and fld_f1 < thresholds.get("fieldF1Min", 0.88):
            failures.append(f"fieldF1({fld_f1:.3f})")

    ok = len(failures) == 0
    return PageVerifyReport(
        pageIndex=pred.pageIndex,
        sourceKind=pred.sourceKind,
        ok=ok,
        rulingLineF1=line_res.f1,
        teds=teds_val,
        tedsS=teds_s_val,
        ned=ned_val,
        fieldF1=fld_f1,
        validation=val,
        missingLineBoxes=line_res.missingBoxes,
        gateFailures=failures,
    )


def run_eval(
    *,
    paths_file: Path,
    doc_filter: Optional[set[str]] = None,
    page_filter: Optional[list[int]] = None,
    draft_gold: bool = False,
    render: bool = False,
    strict: bool = False,
) -> int:
    _bootstrap_paths()
    from docstruct_engine.ir.model import PageIR
    from docstruct_engine.verify.report import EvalReport, format_eval_summary

    manifest = json.loads((EVAL_DIR / "manifest.json").read_text(encoding="utf-8"))
    thresholds = load_thresholds()
    local_paths: dict[str, str] = {}
    if paths_file.is_file():
        local_paths = json.loads(paths_file.read_text(encoding="utf-8"))

    if render and not _check_cdp_available():
        print("[WARN] --render skipped: CDP server not reachable at http://127.0.0.1:9222", file=sys.stderr)

    reports: list[EvalReport] = []
    skipped = 0

    for entry in manifest.get("docs", []):
        doc_id = entry["docId"]
        if doc_filter and doc_id not in doc_filter:
            continue
        raw_path = str(local_paths.get(doc_id) or "").strip()
        if not raw_path or raw_path.startswith("<path/to/"):
            print(f"[SKIP] {doc_id}: not configured in {paths_file.name}")
            skipped += 1
            continue
        doc_path = Path(raw_path)
        if not doc_path.is_file():
            print(f"[SKIP] {doc_id}: file not found on disk ({doc_path})")
            skipped += 1
            continue

        # Build PageIR(s)
        pages: list[PageIR] = []
        if doc_path.suffix.lower() == ".hwpx":
            from docstruct_engine.acquire import hwpx_ir as docstruct_hwpx

            doc_ir = docstruct_hwpx.hwpx_to_doc_ir(str(doc_path))
            pages = doc_ir.pages
        else:
            from docstruct_engine import build_doc_ir

            doc_ir = build_doc_ir(str(doc_path), page_indices=page_filter)
            pages = doc_ir.pages

        if page_filter:
            wanted = set(page_filter)
            pages = [p for p in pages if p.pageIndex in wanted]

        if draft_gold:
            draft_dir = EVAL_DIR / "drafts" / doc_id
            draft_dir.mkdir(parents=True, exist_ok=True)
            for p in pages:
                payload = json.loads(p.model_dump_json())
                payload["_status"] = "UNVERIFIED_DRAFT"
                (draft_dir / f"p{p.pageIndex}.ir.json").write_text(
                    json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
            print(f"[DRAFT] {doc_id}: wrote {len(pages)} unverified draft IR pages to {draft_dir}")

        gold_dir = EVAL_DIR / "gold" / doc_id
        page_reports: list[PageVerifyReport] = []
        for p in pages:
            gold_path = gold_dir / f"p{p.pageIndex}.ir.json"
            gold_page: Optional[PageIR] = None
            if gold_path.is_file():
                raw_gold = json.loads(gold_path.read_text(encoding="utf-8"))
                if raw_gold.get("_status") != "UNVERIFIED_DRAFT":
                    gold_page = PageIR.model_validate(raw_gold)
            page_reports.append(evaluate_page_against_gold(p, gold_page, thresholds))

        rep = EvalReport(
            docId=doc_id,
            pages=page_reports,
            passed=all(pr.ok for pr in page_reports),
            summary={"goldMatched": sum(1 for pr in page_reports if pr.teds is not None)},
        )
        print(format_eval_summary(rep))
        reports.append(rep)

    print(f"Summary: evaluated={len(reports)}, skipped={skipped}")
    if strict and (skipped > 0 or any(not r.passed for r in reports)):
        return 1
    return 1 if any(not r.passed for r in reports) else 0


def run_layout_eval(
    *,
    paths_file: Path,
    doc_filter: Optional[set[str]] = None,
    page_filter: Optional[list[int]] = None,
    include_fixtures: bool = True,
    render: bool = False,
    save_baseline: Optional[Path] = None,
    compare_path: Optional[Path] = None,
    strict_layout: bool = False,
) -> int:
    _bootstrap_paths()
    import tempfile

    from docstruct_engine import build_doc_ir
    from docstruct_engine.compile.docstruct_vdoc import default_ocr_port, doc_ir_to_vdoc
    from docstruct_engine.verify.layout_checks import (
        LayoutPageReport,
        evaluate_page_layout,
        format_layout_comparison,
        summarize_layout_suite,
    )
    from docstruct_engine.verify.layout_measure import check_cdp_available, probe_vdoc_dom
    from docstruct_engine.verify.layout_truth import extract_doc_layout_truth

    manifest = json.loads((EVAL_DIR / "manifest.json").read_text(encoding="utf-8"))
    thresholds = load_thresholds()
    local_paths: dict[str, str] = {}
    if paths_file.is_file():
        local_paths = json.loads(paths_file.read_text(encoding="utf-8"))

    cdp_ok = False
    if render:
        cdp_ok = check_cdp_available()
        if not cdp_ok:
            print("[WARN] --render skipped: CDP server not reachable at http://127.0.0.1:9222", file=sys.stderr)

    doc_targets: list[tuple[str, Path]] = []
    for entry in manifest.get("docs", []):
        doc_id = entry["docId"]
        if doc_filter and doc_id not in doc_filter:
            continue
        raw_path = str(local_paths.get(doc_id) or "").strip()
        if not raw_path or raw_path.startswith("<path/to/"):
            continue
        dp = Path(raw_path)
        if dp.is_file() and dp.suffix.lower() == ".pdf":
            doc_targets.append((doc_id, dp))

    tmp_ctx: Optional[tempfile.TemporaryDirectory[str]] = None
    if include_fixtures:
        tests_dir = PKG_ROOT / "tests"
        if str(tests_dir.parent) not in sys.path:
            sys.path.insert(0, str(tests_dir.parent))
        from tests.fixtures.layout import ALL_FIXTURE_NAMES, build_layout_fixture

        tmp_ctx = tempfile.TemporaryDirectory(prefix="docstruct_layout_fx_")
        fx_dir = Path(tmp_ctx.name)
        for name in ALL_FIXTURE_NAMES:
            if doc_filter and name not in doc_filter:
                continue
            doc_targets.append((f"fx:{name}", build_layout_fixture(name, fx_dir)))

    all_reports: list[LayoutPageReport] = []
    per_doc_summaries: dict[str, Any] = {}
    try:
        bg_cover = float((thresholds.get("layout") or {}).get("pageBgCoverRatio", 0.75))
        ocr_port = default_ocr_port()
        for label, doc_path in doc_targets:
            doc_ir = build_doc_ir(str(doc_path), page_indices=page_filter, ocr_port=ocr_port, render_png=False)
            truths = extract_doc_layout_truth(str(doc_path), page_indices=page_filter, bg_cover_ratio=bg_cover)
            vdoc, compiled_reports = doc_ir_to_vdoc(doc_ir, title=doc_ir.title)
            vdoc_pages = vdoc["pages"]
            vdoc_slots = vdoc["slots"]

            doc_reports: list[LayoutPageReport] = []
            for p_idx, (pir, truth, vpg, crep) in enumerate(zip(doc_ir.pages, truths, vdoc_pages, compiled_reports)):
                dom_m = probe_vdoc_dom(page_number=p_idx + 1) if cdp_ok else None
                lrep = evaluate_page_layout(
                    truth,
                    pir,
                    vpg,
                    vdoc_slots,
                    compiled_report=crep,
                    measured_dom=dom_m,
                    thresholds=thresholds,
                )
                doc_reports.append(lrep)
                all_reports.append(lrep)
                status = "PASS" if lrep.ok else f"FAIL({lrep.firstFailingStage})"
                reasons = ", ".join(lrep.reasons) if lrep.reasons else "-"
                print(
                    f"[{label} p{lrep.pageIndex}] {status} | "
                    f"L1_ov={lrep.l1OverflowPx:.1f} L2={lrep.l2TableCellLineMatch:.2f} "
                    f"L3={l3_s(lrep.l3LineGroupF1)} L4={lrep.l4FontSizeMatch:.2f} "
                    f"L5={lrep.l5SpacingMatch:.2f} L6={lrep.l6PhotoTextPollution:.2f} "
                    f"L7={lrep.l7RowHeightMatch:.2f} | {reasons}"
                )
            per_doc_summaries[label] = summarize_layout_suite(doc_reports)
    finally:
        if tmp_ctx is not None:
            tmp_ctx.cleanup()

    suite_summary = summarize_layout_suite(all_reports)
    print("\n=== Layout Summary ===")
    print(json.dumps(suite_summary, indent=2))

    if save_baseline is not None:
        save_baseline.parent.mkdir(parents=True, exist_ok=True)
        payload = {"summary": suite_summary, "docs": per_doc_summaries}
        save_baseline.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Saved layout baseline -> {save_baseline}")

    if compare_path is not None and compare_path.is_file():
        base_data = json.loads(compare_path.read_text(encoding="utf-8"))
        base_summary = base_data.get("summary") or base_data
        print("\n=== Baseline vs Current ===")
        print(format_layout_comparison(base_summary, suite_summary))

    if strict_layout and suite_summary.get("okPages", 0) < suite_summary.get("pages", 0):
        return 1
    return 0


def l3_s(v: float) -> str:
    return f"{v:.2f}"


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Run DocStruct evaluation suite")
    parser.add_argument("--paths", type=Path, default=EVAL_DIR / "paths.local.json")
    parser.add_argument("--docs", nargs="*", help="Subset of manifest docIds")
    parser.add_argument("--pages", nargs="*", type=int, help="1-based page numbers")
    parser.add_argument("--draft-gold", action="store_true", help="Emit unverified draft gold IRs to eval/drafts")
    parser.add_argument("--render", action="store_true", help="Run optional CDP render visual diff if available")
    parser.add_argument("--strict", action="store_true", help="Fail if any manifest doc is skipped or failed")
    parser.add_argument("--layout", action="store_true", help="Run C0..C3 layout fidelity suite")
    parser.add_argument("--no-fixtures", action="store_true", help="Skip synthetic layout fixtures in --layout")
    parser.add_argument("--save-baseline", type=Path, help="Write --layout summary JSON")
    parser.add_argument("--compare", type=Path, help="Compare --layout summary against baseline JSON")
    parser.add_argument("--strict-layout", action="store_true", help="Exit 1 if any layout page fails")
    args = parser.parse_args(argv)
    if args.layout:
        return run_layout_eval(
            paths_file=args.paths,
            doc_filter=set(args.docs) if args.docs else None,
            page_filter=args.pages,
            include_fixtures=not args.no_fixtures,
            render=args.render,
            save_baseline=args.save_baseline,
            compare_path=args.compare,
            strict_layout=args.strict_layout,
        )
    return run_eval(
        paths_file=args.paths,
        doc_filter=set(args.docs) if args.docs else None,
        page_filter=args.pages,
        draft_gold=args.draft_gold,
        render=args.render,
        strict=args.strict,
    )


if __name__ == "__main__":
    raise SystemExit(main())
