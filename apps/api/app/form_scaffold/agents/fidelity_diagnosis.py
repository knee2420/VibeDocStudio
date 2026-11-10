"""03 판정(verify.json) + 02 측정(measure.json) → 원인 진단과 처방.

LLM 에게 원시 숫자를 덤프하지 않는다. 같은 원인으로 묶고, `lessons_learned.md` 의 L-xx 에 대고,
도구로 바로 실행할 수 있는 처방(어떤 보정값을 얼마로)을 계산해서 준다. 진단은 코드가 한다.

처방의 순서는 스킬 §5 Step 6 과 같다: 구조(글자 없음 · 글꼴 · 크기) → 줄바꿈 → 표 상자 → 크기별 오프셋
→ 칸 · 블록 일괄 이동 → 줄 높이 누적 → 개별 위치. 보정값으로 못 고치는 것은 `engine_issues` 로 따로 낸다
(생성기 · 편집기 코드를 고쳐야 하는 것 — 루프가 끝난 뒤 개발자가 본다).
"""
from __future__ import annotations

import re
import statistics
from typing import Any

from app.form_scaffold.agents.fidelity_layout import (
    css_border_px,
    decode_font_name,
    font_family,
)

_PUA = re.compile(r"[\ue000-\uf8ff]")
MIN_SHIFT = 0.5  # 이보다 작은 일괄 이동은 처방하지 않는다 (1px 허용 오차 안의 잡음)
AGREE = 0.8  # 같은 방향인 글자 비율이 이 이상이어야 "일괄"로 본다


def _median(vals: list[float]) -> float:
    return statistics.median(vals) if vals else 0.0


def _consistent(vals: list[float], min_shift: float = MIN_SHIFT) -> tuple[bool, float]:
    """중앙값이 min_shift 이상이고 대부분 같은 방향이면 (True, 중앙값)."""
    if not vals:
        return False, 0.0
    med = _median(vals)
    if abs(med) < min_shift:
        return False, med
    same = sum(1 for v in vals if v * med > 0) / len(vals)
    return same >= AGREE, med


def _rule_offsets(model: dict[str, Any], truth: dict[str, Any], measure: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """표마다 원본 선과 그려진 선의 중심 차 (가로선 → dy, 세로선 → dx)."""
    out: dict[str, dict[str, Any]] = {}
    m_rules = measure.get("rules", [])
    for t in model["tables"]:
        dxs, dys = [], []
        for tr in truth.get("rules", []):
            if not (t["x"] - 3 <= tr["x"] and tr["x1"] <= t["x1"] + 3 and t["y"] - 3 <= tr["y"] and tr["y1"] <= t["y1"] + 3):
                continue
            if max(tr["x1"] - tr["x"], tr["y1"] - tr["y"]) < 4:
                continue  # 모서리 이음새
            if tr["orient"] == "h":
                c = (tr["y"] + tr["y1"]) / 2
                cands = [m for m in m_rules if m["orient"] == "h" and m["x"] < tr["x1"] and tr["x"] < m["x1"]]
                best = min(cands, key=lambda m: abs((m["y"] + m["y1"]) / 2 - c), default=None)
                if best is not None and abs((best["y"] + best["y1"]) / 2 - c) < 6:
                    dys.append((best["y"] + best["y1"]) / 2 - c)
            else:
                c = (tr["x"] + tr["x1"]) / 2
                cands = [m for m in m_rules if m["orient"] == "v" and m["y"] < tr["y1"] and tr["y"] < m["y1"]]
                best = min(cands, key=lambda m: abs((m["x"] + m["x1"]) / 2 - c), default=None)
                if best is not None and abs((best["x"] + best["x1"]) / 2 - c) < 6:
                    dxs.append((best["x"] + best["x1"]) / 2 - c)
        out[t["id"]] = {"dx": round(_median(dxs), 2), "dy": round(_median(dys), 2), "h_matched": len(dys), "v_matched": len(dxs)}
    return out


def diagnose(
    *,
    model: dict[str, Any],
    truth: dict[str, Any],
    measure: dict[str, Any],
    verify: dict[str, Any],
    line_block: dict[str, str],
    tune: dict[str, Any],
    min_shift: float = MIN_SHIFT,
) -> dict[str, Any]:
    spans = truth.get("spans", [])
    span_line = {i: ln for ln in model["lines"] for i in ln["spans"]}
    rows = {r["i"]: r for r in verify.get("spans", [])}
    findings = verify.get("findings", [])
    tol = (verify.get("summary") or {}).get("tol_pos") or 1.0

    prescriptions: list[dict[str, Any]] = []
    engine_issues: list[dict[str, Any]] = []
    notes: list[str] = []

    def add(lesson: str, rule: str, evidence: str, action: dict[str, Any] | None = None, **extra: Any) -> None:
        item = {"id": f"P{len(prescriptions) + 1}", "lesson": lesson, "rule": rule, "evidence": evidence, **extra}
        if action:
            item["action"] = action
        prescriptions.append(item)

    def where(i: int) -> str:
        ln = span_line.get(i)
        return f"{ln['id']}@{line_block.get(ln['id'], '?')}" if ln else "?"

    # 1. 구조 — 글자 없음 · 글꼴 · 크기
    missing = [f["span"] for f in findings if f.get("rule") == "F-ELEM-001" and "span" in f]
    symbol_missing = [i for i in missing if _PUA.search(spans[i]["text"])]
    if symbol_missing:
        engine_issues.append({"lesson": "L-14", "rule": "F-ELEM-001",
                              "evidence": f"한글 호환 특수문자(PUA) 글자 {len(symbol_missing)}개 누락: "
                                          + ", ".join(f"{where(i)} {spans[i]['text']!r}" for i in symbol_missing[:4]),
                              "fix": "생성기가 PUA 문자를 원본 유니코드로 보존하는지 확인"})
    other_missing = [i for i in missing if i not in set(symbol_missing)]
    if other_missing:
        engine_issues.append({"lesson": "L-08", "rule": "F-ELEM-001",
                              "evidence": f"본문 글자 {len(other_missing)}개 누락: "
                                          + ", ".join(f"{where(i)} {spans[i]['text']!r}" for i in other_missing[:4]),
                              "fix": "분할안에서 줄이 빠졌는지, 생성기가 누락 없이 HTML 로 옮기는지 확인"})

    bad_fonts = [f for f in findings if f.get("rule") == "F-FONT-001"]
    if bad_fonts:
        groups: dict[str, list[dict[str, Any]]] = {}
        for f in bad_fonts:
            sp = spans[f["span"]]
            groups.setdefault(sp["font"], []).append(f)
        for pdf_font, fs in groups.items():
            first = fs[0]
            fam = font_family(pdf_font)
            engine_issues.append({
                "lesson": "L-03", "rule": "F-FONT-001",
                "evidence": f"PDF 글꼴 '{decode_font_name(pdf_font)}'({pdf_font}) 글자 {len(fs)}개가 "
                            f"크롬에서 대체 글꼴로 그려짐 (첫 글자 {where(first['span'])})",
                "fix": f"스튜디오에 '{fam}' 전체 글꼴(.ttf)이 실려 있는지, @font-face 가 맞는지 확인",
            })

    # 2. 줄바꿈 (F-WRAP-001)
    wrapped = [f["span"] for f in findings if f.get("rule") == "F-WRAP-001"]
    if wrapped:
        engine_issues.append({
            "lesson": "L-06", "rule": "F-WRAP-001",
            "evidence": f"원본 한 줄인데 크롬에서 여러 줄로 줄바꿈된 글자 {len(wrapped)}개: "
                        + ", ".join(f"{where(i)} {spans[i]['text']!r}" for i in wrapped[:4]),
            "fix": "블록 폭(content_width)이 좁거나 letter-spacing 누락으로 줄바꿈됨",
        })

    # 3. 표 상자 (F-POS-001 중 표 전체 오프셋): 선 실측과 글자 오프셋이 같은 방향이면 table_dx/table_dy
    rule_off = _rule_offsets(model, truth, measure)
    for tid, ro in rule_off.items():
        if ro["h_matched"] >= 2 and abs(ro["dy"]) >= min_shift:
            cur = float(tune.get("table_dy", 0))
            add("L-15", "F-POS-001", f"표 '{tid}' 가로선 {ro['h_matched']}개가 평균 {ro['dy']:+.2f}px 밀림",
                {"tool": "update_tune", "args": {"changes": {"table_dy": round(cur - ro["dy"], 2)}}})
        if ro["v_matched"] >= 2 and abs(ro["dx"]) >= min_shift:
            cur = float(tune.get("table_dx", 0))
            add("L-15", "F-POS-001", f"표 '{tid}' 세로선 {ro['v_matched']}개가 평균 {ro['dx']:+.2f}px 밀림",
                {"tool": "update_tune", "args": {"changes": {"table_dx": round(cur - ro["dx"], 2)}}})

    # 4. 크기별 오프셋 (L-05 / D-OFFSET) — 표 상자가 맞은 뒤 글자가 크기별로 밀리는 것
    cell_rows, text_rows = [], []
    for i, r in rows.items():
        ln = span_line.get(i)
        if not ln or _PUA.search(spans[i]["text"]):
            continue
        (cell_rows if ln["where"].startswith("T") else text_rows).append((i, r["dx"], r["dy"]))

    size_fixed = {}
    by_pt: dict[str, list[float]] = {}
    for i, _dx, dy in text_rows + cell_rows:
        by_pt.setdefault(str(round(float(spans[i]["pt"]), 2)), []).append(dy)
    cur_offsets = dict(tune.get("size_offsets") or {})
    new_offsets = dict(cur_offsets)
    evid = []
    for pt, dys in sorted(by_pt.items(), key=lambda kv: -len(kv[1])):
        ok, med = _consistent(dys, min_shift=min_shift)
        if ok:
            new_offsets[pt] = round(float(cur_offsets.get(pt, 0.0)) + med, 2)
            size_fixed[pt] = med
            evid.append(f"{pt}pt 글자 {len(dys)}개 dy 중앙값 {med:+.2f}")
    if size_fixed:
        add("L-05", "D-OFFSET", "; ".join(evid) + " → 그 크기 줄 상자를 그만큼 올린다(양수=위로)",
            {"tool": "update_tune", "args": {"changes": {"size_offsets": new_offsets}}})

    def residual_dy(i: int, dy: float) -> float:
        return dy - size_fixed.get(str(round(float(spans[i]["pt"]), 2)), 0.0)

    # 4b. 칸 · 글 블록 일괄 이동
    for label, group, kx, ky in (("표 칸 글자", cell_rows, "cell_dx", "cell_dy"), ("표 밖 글 블록", text_rows, "text_dx", "text_dy")):
        if not group:
            continue
        changes = {}
        ok_x, med_x = _consistent([dx for _, dx, _ in group], min_shift=min_shift)
        if ok_x:
            changes[kx] = round(float(tune.get(kx, 0)) - med_x, 2)
        if not size_fixed:
            ok_y, med_y = _consistent([residual_dy(i, dy) for i, _, dy in group], min_shift=min_shift)
            if ok_y:
                changes[ky] = round(float(tune.get(ky, 0)) - med_y, 2)
        if changes:
            add("L-13" if kx.startswith("cell") else "L-15", "F-POS-001",
                f"{label} {len(group)}개가 같은 방향으로 밀림 (dx 중앙값 {med_x:+.2f})",
                {"tool": "update_tune", "args": {"changes": changes}})

    # 4c. 줄 높이 누적 (L-04): 여러 줄 블록에서 아래 줄일수록 dy 가 커진다
    slopes = []
    blocks_lines: dict[str, list[tuple[int, float]]] = {}
    for i, _dx, dy in text_rows + cell_rows:
        ln = span_line[i]
        blocks_lines.setdefault(line_block.get(ln["id"], ln["where"]), []).append((model["lines"].index(ln), residual_dy(i, dy)))
    for _b, pts in blocks_lines.items():
        idx = sorted({k for k, _ in pts})
        if len(idx) < 3:
            continue
        first = [d for k, d in pts if k == idx[0]]
        last = [d for k, d in pts if k == idx[-1]]
        slopes.append((_median(last) - _median(first)) / (len(idx) - 1))
    if slopes:
        slope = _median(slopes)
        if abs(slope) >= max(0.3, min_shift * 0.6) and sum(1 for s in slopes if s * slope > 0) / len(slopes) >= AGREE:
            lh = _median([ln["pt"] * 96 / 72 * model["fonts_f"].get(ln.get("font_ref") or "", 1.0) for ln in model["lines"]])
            scale = float(tune.get("line_height_scale", 1.0))
            new_scale = round(max(0.8, min(1.3, scale * (lh - slope) / lh)), 4) if lh else scale
            add("L-04", "F-POS-001", f"여러 줄 블록 {len(slopes)}개에서 줄마다 dy 가 {slope:+.2f}px 씩 쌓임",
                {"tool": "update_tune", "args": {"changes": {"line_height_scale": new_scale}}})

    # 4d. 자간 (L-06): 왼쪽은 맞는데 오른쪽 끝만 틀림
    right_only = [i for i, r in rows.items() if abs(r["dx"]) <= tol and abs(r["dx1"]) > tol and not _PUA.search(spans[i]["text"])]
    if right_only:
        no_tokens = [i for i in right_only if not spans[i].get("tokens")]
        engine_issues.append({"lesson": "L-06", "rule": "F-POS-001",
                              "evidence": f"왼쪽은 맞고 오른쪽 끝(dx1)만 틀린 글자 {len(right_only)}개 (그중 자간 토큰 없는 것 {len(no_tokens)}개): "
                                          + ", ".join(f"{where(i)} dx1 {rows[i]['dx1']:+.1f}" for i in right_only[:5]),
                              "fix": "01 을 --font 로 그 글꼴 파일과 함께 돌려 tokens 를 만들거나, 브라우저 글꼴이 원본과 같은지 확인"})

    # 4e. 들여쓰기 스냅 (L-17)
    snapped = [i for i, dx, _ in text_rows + cell_rows if abs(dx) > 4 and min(abs(dx) % 32, 32 - abs(dx) % 32) < 1.5]
    if snapped:
        engine_issues.append({"lesson": "L-17", "rule": "F-POS-001", "evidence": f"dx 가 32px 배수로 어긋난 글자 {len(snapped)}개",
                              "fix": "편집기 Indent 확장이 margin-left 를 32px 단위로 바꾸는지 확인"})

    # 5. 개별 위치 — 일괄 처방으로 설명되지 않는 것
    worst = sorted(((i, r) for i, r in rows.items() if r["err"] > tol and not _PUA.search(spans[i]["text"])), key=lambda it: -it[1]["err"])
    individual = [{"span": i, "where": where(i), "text": spans[i]["text"][:20], "dx": round(r["dx"], 2), "dx1": round(r["dx1"], 2), "dy": round(r["dy"], 2)}
                  for i, r in worst[:8]]

    # 6. 그림 · 픽셀
    if any(f.get("rule") == "F-IMG-001" for f in findings):
        engine_issues.append({"lesson": "-", "rule": "F-IMG-001", "evidence": "; ".join(f["msg"] for f in findings if f.get("rule") == "F-IMG-001")[:200],
                              "fix": "생성기가 PDF 그림을 image 블록으로 옮기는지 확인"})
    s = verify.get("summary") or {}
    pix, floor = s.get("pixels") or {}, s.get("noise_floor") or {}
    if pix and floor and not worst:
        notes.append(f"위치는 모두 허용 오차 안. ink F1 {pix.get('ink_f1_1px')}% vs 잡음 하한선 {floor.get('ink_f1_1px')}% — 남은 차이는 렌더러 몫일 수 있음 (L-11)")

    border_warn = sum(1 for f in findings if f.get("rule") == "F-RULE-001" and "두께" in f.get("msg", "") and "L-10" in f.get("msg", ""))
    if border_warn:
        notes.append(f"선 두께 WARN {border_warn}개: 크롬은 테두리를 정수 px 로 내린다 (0.96→1, 1.92→{css_border_px(1.92):.0f}). 고칠 대상 아님 (L-10)")

    return {
        "prescriptions": prescriptions,
        "engine_issues": engine_issues,
        "individual": individual,
        "table_rule_offsets": rule_off,
        "notes": notes,
    }
