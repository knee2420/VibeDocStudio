"""개정 이력 — 저장 한 번에 바뀐 슬롯 · 변수를 작성자(사람 | 하네스)와 함께 남긴다 (git 의 커밋 역할).

- 사람 타이핑은 자동 저장마다 들어오므로, 같은 칸을 90초 안에 이어서 고친 기록은 하나로 합친다.
- AI 변경안 승인은 합치지 않는다 (하네스 · 실행 단위로 되돌리고 추적해야 하므로).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable, Optional

COALESCE_SECONDS = 90


def _slot_map(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    slots = payload.get("slots") or {}
    return slots if isinstance(slots, dict) else {}


def build_revision_entry(
    old: dict[str, Any],
    new: dict[str, Any],
    notes: Iterable[dict[str, Any]],
    *,
    rev: int,
    now: str,
) -> Optional[dict[str, Any]]:
    """바뀐 것이 없으면 None."""
    notes = list(notes)
    by_slot: dict[str, dict[str, Any]] = {}
    by_var: dict[str, dict[str, Any]] = {}
    for note in notes:
        for sid in note.get("slotIds") or []:
            by_slot[sid] = note
        for key in note.get("variables") or []:
            by_var[key] = note
    old_slots, new_slots = _slot_map(old), _slot_map(new)
    slot_changes = []
    for sid in sorted(set(old_slots) | set(new_slots)):
        before = str((old_slots.get(sid) or {}).get("content", ""))
        after = str((new_slots.get(sid) or {}).get("content", ""))
        if before == after:
            continue
        note = by_slot.get(sid) or {}
        slot_changes.append({
            "slotId": sid,
            "label": (new_slots.get(sid) or old_slots.get(sid) or {}).get("label", sid),
            "before": before,
            "after": after,
            "author": note.get("author", "human"),
            "harnessId": note.get("harnessId"),
            "runId": note.get("runId"),
        })
    old_vars = old.get("variables") or {}
    new_vars = new.get("variables") or {}
    var_changes = [
        {"key": k, "before": old_vars.get(k), "after": new_vars.get(k), "author": (by_var.get(k) or {}).get("author", "human")}
        for k in sorted(set(old_vars) | set(new_vars))
        if old_vars.get(k) != new_vars.get(k)
    ]
    if not slot_changes and not var_changes:
        return None
    authors = {c["author"] for c in slot_changes} | {c["author"] for c in var_changes}
    ai_notes = [n for n in notes if n.get("author") == "ai"]
    return {
        "rev": rev,
        "at": now,
        "author": "ai" if "ai" in authors else "human",
        "label": "; ".join(n["label"] for n in notes if n.get("label")) or ("AI 변경 적용" if "ai" in authors else "편집"),
        "harnessId": ai_notes[0].get("harnessId") if ai_notes else None,
        "runId": ai_notes[0].get("runId") if ai_notes else None,
        "slots": slot_changes,
        "variables": var_changes,
    }


def _parse(at: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(at.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def coalesce(last: Optional[dict[str, Any]], entry: dict[str, Any]) -> Optional[dict[str, Any]]:
    """사람의 연속 타이핑이면 합친 기록을, 아니면 None."""
    if not last or last.get("author") != "human" or entry.get("author") != "human":
        return None
    if entry.get("variables") or last.get("variables"):
        return None
    if {c["slotId"] for c in last.get("slots", [])} != {c["slotId"] for c in entry.get("slots", [])}:
        return None
    t0, t1 = _parse(str(last.get("since") or last.get("at", ""))), _parse(str(entry.get("at", "")))
    if not t0 or not t1 or (t1 - t0).total_seconds() > COALESCE_SECONDS:
        return None
    befores = {c["slotId"]: c["before"] for c in last["slots"]}
    merged_slots = [{**c, "before": befores.get(c["slotId"], c["before"])} for c in entry["slots"]]
    return {**entry, "slots": merged_slots, "since": last.get("since", last.get("at"))}
