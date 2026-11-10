"""작업 공간 지도 생성기 및 군집 수집 도구 (표준 라이브러리만 사용).

에이전트가 탐색할 때:
1. `build_map`: 루트별 파일 수, 2단계 폴더 트리, 반복 구조 축약(Jaccard >= 0.8), 주요 군집, 허브 파일을 6KB 이내로 생성.
2. `collect`: 군집 이름('결정 카드', '회의록' 등), glob 패턴, frontmatter(key=val)로 대상 목록을 확정.
"""
from __future__ import annotations

import os
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, Callable, Optional

from harness_kit import packs

from .index import FileEntry, WorkspaceIndex

MAP_BUDGET_BYTES = 6000
COLLECT_BUDGET_BYTES = 9000

_LEXICON = "resource:lexicon.ko.json"
_CLUSTERS = "resource:clusters.json"
_compiled: dict[int, dict[str, Any]] = {}


def _lex() -> dict[str, Any]:
    """자료 지도 어휘 (서식/예시 · 초안 · 날짜 폴더) — 하네스 resource 팩."""
    raw = packs.data(_LEXICON)
    hit = _compiled.get(id(raw))
    if hit is None:
        hit = {k: (packs.compile_rx(v) if isinstance(v, dict) and "pattern" in v else v) for k, v in raw.items() if not k.startswith("_")}
        _compiled.clear()
        _compiled[id(raw)] = hit
    return hit


class _DateFolder:
    """`DATE_FOLDER_RE.match(...)` 자리 — 패턴은 어휘에서 읽는다."""

    def match(self, text: str):
        return _lex()["dateFolder"].match(text)


DATE_FOLDER_RE = _DateFolder()


@dataclass
class Cluster:
    name: str
    matcher: Callable[[FileEntry], bool]
    description: str
    pattern_example: str


def _clean_str(val: Any) -> str:
    if isinstance(val, str):
        return val.strip()
    if isinstance(val, list):
        return ", ".join(map(str, val)).strip()
    return ""


def is_scaffold(e: FileEntry) -> bool:
    stem = os.path.splitext(os.path.basename(e.rel))[0]
    lex = _lex()
    return (bool(lex["scaffoldDir"].search(e.rel)) or bool(lex["scaffoldName"].search(stem))
            or lex["scaffoldTypeWord"] in _clean_str(e.frontmatter.get("유형")))


def is_draft(e: FileEntry) -> bool:
    status = _clean_str(e.frontmatter.get("상태") or e.frontmatter.get("status"))
    lex = _lex()
    return bool(lex["draft"].search(status)) or bool(lex["draftName"].search(os.path.basename(e.rel)))


def partition(entries: list[FileEntry]) -> tuple[list[FileEntry], list[FileEntry], list[FileEntry]]:
    """군집 → (본 대상, 초안 · 검토 중, 서식 · 예시).

    본 대상이 하나도 없으면(전부 초안) 초안을 본 대상으로 올린다 — 그 자료에는 초안밖에 없는 것이다.
    """
    scaffolds = [e for e in entries if is_scaffold(e)]
    rest = [e for e in entries if not is_scaffold(e)]
    drafts = [e for e in rest if is_draft(e)]
    primary = [e for e in rest if not is_draft(e)]
    if not primary:
        primary, drafts = drafts, []
    return primary, drafts, scaffolds


def _group_label(rel: str) -> str:
    """파일이 속한 '반복 구조' 이름 — 날짜 폴더는 <날짜>로 접는다 (discussions/<날짜>/decisions)."""
    parts = rel.split("/")[:-1]
    folded = ["<날짜>" if (DATE_FOLDER_RE.match(p) or _lex()["shortDateFolder"].match(p)) else p for p in parts]
    return "/".join(folded) or "."


def target_entries(index: WorkspaceIndex, query: str) -> tuple[Optional[str], list[FileEntry], list[FileEntry], list[FileEntry]]:
    """요청 대상 이름 → (군집 이름, 본 대상, 초안, 서식). 군집이 아니면 파일 이름 glob 으로 찾는다."""
    cluster = match_cluster_query(query)
    if cluster:
        entries = [e for e in index.files if cluster.matcher(e)]
        name = cluster.name
    else:
        entries = index.glob(f"*{query}*")
        name = query
    primary, drafts, scaffolds = partition(entries)
    return name, primary, drafts, scaffolds


def _field(e: FileEntry, name: str) -> Any:
    base = os.path.basename(e.rel)
    if name == "rel":
        return e.rel
    if name == "relLower":
        return e.rel.lower()
    if name == "relLowerParts":
        return e.rel.lower().split("/")
    if name == "name":
        return base
    if name == "nameLower":
        return base.lower()
    if name.startswith("fm:"):
        return _clean_str(e.frontmatter.get(name[3:]))
    raise KeyError(f"군집 규칙의 field 를 모른다: {name}")


def _rule_ok(e: FileEntry, rule: dict[str, Any]) -> bool:
    value = _field(e, rule["field"])
    if "regex" in rule:
        return bool(packs.compile_rx({"pattern": rule["regex"], "flags": rule.get("flags", "")}).search(value))
    if "contains" in rule:
        return rule["contains"] in value
    if "startswith" in rule:
        return value.startswith(rule["startswith"])
    if "has" in rule:
        return rule["has"] in value
    raise KeyError(f"군집 규칙 형식을 모른다: {rule}")


def _cluster(spec: dict[str, Any]) -> Cluster:
    rules = list(spec.get("any") or [])
    skip_scaffold = bool(spec.get("excludeScaffold"))
    return Cluster(
        name=spec["name"],
        matcher=lambda e, rules=rules, skip=skip_scaffold: (not skip or not is_scaffold(e)) and any(_rule_ok(e, r) for r in rules),
        description=spec.get("description", ""),
        pattern_example=spec.get("patternExample", ""),
    )


def known_clusters() -> list[Cluster]:
    """자료 지도의 주요 군집 — 하네스 resource 팩(`clusters.json`)의 규칙 데이터."""
    return [_cluster(c) for c in packs.data(_CLUSTERS)["clusters"]]


def find_clusters(index: WorkspaceIndex) -> list[tuple[Cluster, list[FileEntry]]]:
    """색인 안에서 주요 군집별 매칭 파일 목록을 반환한다."""
    found: list[tuple[Cluster, list[FileEntry]]] = []
    for c in known_clusters():
        matched = [e for e in index.files if c.matcher(e)]
        if matched:
            found.append((c, matched))

    # 추가로 frontmatter 유형 중 빈도가 높은 것 추출 (기존 군집에 없는 것)
    type_counter: Counter = Counter()
    cfg = packs.data(_CLUSTERS)
    keys = cfg["frontmatterTypeKeys"]

    def fm_type(e: FileEntry) -> str:
        return _clean_str(next((e.frontmatter.get(k) for k in keys if e.frontmatter.get(k)), None))

    for e in index.files:
        val = fm_type(e)
        if val and not any(c.matcher(e) for c, _ in found):
            type_counter[val] += 1

    for tname, count in type_counter.most_common(int(cfg["frontmatterTypeTop"])):
        if count >= int(cfg["frontmatterTypeMinCount"]):
            matched = [e for e in index.files if fm_type(e) == tname]
            custom_cluster = Cluster(
                name=tname,
                matcher=lambda e, t=tname: fm_type(e) == t,
                description=f"frontmatter 유형 '{tname}'",
                pattern_example=f"유형={tname}",
            )
            found.append((custom_cluster, matched))

    return found


def match_cluster_query(query: str) -> Optional[Cluster]:
    """사용자가 입력한 질의가 어떤 알려진 군집에 해당하는지 판별한다 (이름 · queryKeywords)."""
    q = query.strip().lower()
    for spec in packs.data(_CLUSTERS)["clusters"]:
        name = spec["name"].lower()
        if q == name or q in name or any(k in q for k in spec.get("queryKeywords") or []):
            return _cluster(spec)
    return None


def _jaccard_similarity(set_a: set[str], set_b: set[str]) -> float:
    if not set_a and not set_b:
        return 1.0
    union = set_a | set_b
    if not union:
        return 0.0
    return len(set_a & set_b) / len(union)


def _normalize_name_for_similarity(name: str) -> str:
    # 날짜, 숫자 접두사/접미사 정규화
    n = re.sub(r"\d{2,4}[-.]\d{2}[-.]\d{2}", "<날짜>", name)
    n = re.sub(r"\bD\d+_", "D<N>_", n)
    n = re.sub(r"^\d+\.\d+_", "<N>.<N>_", n)
    return n


def build_map(index: WorkspaceIndex, budget_bytes: int = MAP_BUDGET_BYTES) -> str:
    """작업 공간의 핵심 지도(루트 정보, 주요 군집, 구조 요약, 허브)를 6KB 안쪽으로 압축 생성한다."""
    texts = index.text_files()
    total_lines = sum(e.lines for e in texts)
    dups = index.duplicates()
    dup_files = sum(len(g) - 1 for g in dups)

    # 1. 루트 정보
    root_lines = []
    if len(index.roots) == 1:
        r = index.roots[0]
        alias = index.root_aliases.get(r, os.path.basename(r) or "root")
        root_lines.append(f"루트: {alias} = {r}")
    else:
        parts = [f"{index.root_aliases.get(r, f'R{i+1}')} = {r}" for i, r in enumerate(index.roots)]
        root_lines.append("루트: " + " · ".join(parts))

    header = (
        f"파일 {len(index.files)}개 (텍스트 {len(texts)}개 · 그 외 {len(index.files) - len(texts)}개) · "
        f"{total_lines:,}줄 · 동일본 묶음 {len(dups)}개(중복 {dup_files}개)"
    )

    sections = [
        "[마운트된 자료 지도]",
        "\n".join(root_lines),
        header,
    ]

    # 2. 주요 군집
    clusters = find_clusters(index)
    if clusters:
        cluster_rows = ["[주요 군집 — ws_collect(\"군집명\") 으로 대상 확정]"]
        for c, entries in clusters:
            lines = sum(e.lines for e in entries)
            primary, drafts, _ = partition(entries)
            norm_rel = _normalize_name_for_similarity((primary or entries)[0].rel)
            split = f" · 본 대상 {len(primary)} / 초안 {len(drafts)}" if drafts else ""
            cluster_rows.append(f"- {c.name}: {len(entries)}개{split} (총 {lines:,}줄 · 예: {norm_rel}) — ws_collect(\"{c.name}\")")
        sections.append("\n".join(cluster_rows))

    # 3. 폴더 구조 분석 및 반복 구조 축약
    structure_rows = ["[구조 요약]"]
    # 폴더별 파일 구조 수집
    folder_children: dict[str, set[str]] = {}
    folder_file_count: Counter = Counter()

    for entry in index.files:
        parts = entry.rel.split("/")
        if len(parts) > 1:
            parent = "/".join(parts[:-1])
            folder_file_count[parent] += 1
            # 1단계 폴더
            top_folder = parts[0]
            # 2단계 상대 파일
            sub = "/".join(parts[1:])
            folder_children.setdefault(top_folder, set()).add(_normalize_name_for_similarity(sub))
        else:
            folder_file_count["."] += 1

    # 상위 폴더별 하위 날짜 폴더 반복 접기 검사
    top_folders: dict[str, list[str]] = {}
    for folder in folder_file_count:
        if folder == ".":
            continue
        parts = folder.split("/")
        top = parts[0]
        if len(parts) > 1:
            top_folders.setdefault(top, []).append(parts[1])

    folded_tops: set[str] = set()
    for top, subs in top_folders.items():
        date_subs = sorted([s for s in set(subs) if DATE_FOLDER_RE.match(s)])
        if len(date_subs) >= 3:
            # 날짜 폴더들의 하위 구조 비교
            sub_sets: list[set[str]] = []
            for ds in date_subs:
                prefix = f"{top}/{ds}/"
                fset = {
                    _normalize_name_for_similarity(e.rel[len(prefix):])
                    for e in index.files
                    if e.rel.startswith(prefix)
                }
                sub_sets.append(fset)

            # 첫번째와 마지막 및 중간 표본 비교
            sim1 = _jaccard_similarity(sub_sets[0], sub_sets[-1])
            if sim1 >= 0.7:
                folded_tops.add(top)
                count_files = sum(folder_file_count[f"{top}/{ds}"] for ds in date_subs if f"{top}/{ds}" in folder_file_count)
                structure_rows.append(f"- {top}/ (반복 구조 {len(date_subs)}개 회의/날짜 폴더 · 파일 {count_files}개)")
                structure_rows.append(f"  └─ <날짜> (×{len(date_subs)}: {date_subs[0]} … {date_subs[-1]})")
                # 대표 하위 구조 3개 예시
                rep_items = sorted(sub_sets[0])[:4]
                for item in rep_items:
                    structure_rows.append(f"     ├─ {item}")
                if len(sub_sets[0]) > 4:
                    structure_rows.append(f"     └─ … 외 {len(sub_sets[0]) - 4}개 패턴")

    # 나머지 상위 폴더들 출력
    direct_top_counts: Counter = Counter()
    for entry in index.files:
        parts = entry.rel.split("/")
        top = parts[0] if len(parts) > 1 else "."
        direct_top_counts[top] += 1

    for top, count in sorted(direct_top_counts.items()):
        if top in folded_tops:
            continue
        if top == ".":
            structure_rows.append(f"- 루트 파일: {count}개")
        else:
            structure_rows.append(f"- {top}/ (파일 {count}개)")

    sections.append("\n".join(structure_rows))

    # 4. 허브 파일 (백링크 상위)
    hubs = sorted(index.backlinks.items(), key=lambda kv: -len(kv[1]))[:6]
    if hubs:
        hub_rows = ["[허브 파일 — 백링크 많은 핵심 문서]"]
        for k, v in hubs:
            entry = index.by_key.get(k)
            if entry:
                hub_rows.append(f"- {entry.rel} (백링크 {len(v)}건)")
        sections.append("\n".join(hub_rows))

    text = "\n\n".join(sections)
    raw = text.encode("utf-8")
    if len(raw) <= budget_bytes:
        return text

    cut = raw[: budget_bytes - 150].decode("utf-8", errors="ignore")
    return cut + "\n\n… (지도가 길어 요약됨 — ws_tree · ws_collect 로 탐색)"


def collect(index: WorkspaceIndex, query: str, offset: int = 0) -> str:
    """군집 이름, glob 패턴, frontmatter 조건으로 대상 파일 목록을 확정하고 표로 반환한다."""
    q = (query or "").strip()
    if not q:
        return "query 가 비어있습니다. 군집 이름('결정 카드', '회의록', '템플릿') 또는 glob 패턴(*.md), 필드조건(유형=결정)을 입력하세요."

    offset = max(0, int(offset or 0))
    is_glob = any(ch in q for ch in "*?[]")
    target_cluster = None if is_glob else match_cluster_query(q)

    matches: list[FileEntry] = []
    category_name = q

    if target_cluster:
        matches = [e for e in index.files if target_cluster.matcher(e)]
        category_name = target_cluster.name
    elif "=" in q and not is_glob:
        field, _, val = q.partition("=")
        f_clean, v_clean = field.strip(), val.strip().lower()
        category_name = f"{f_clean}={v_clean}"
        for e in index.files:
            fval = _clean_str(e.frontmatter.get(f_clean)).lower()
            if v_clean in fval:
                matches.append(e)
    else:
        # glob 검색
        matches = index.glob(q)
        category_name = f"패턴 '{q}'"

    if not matches:
        return f"'{q}' 에 해당하는 대상을 찾지 못했습니다. ws_overview 로 전체 군집을 확인하세요."

    # 중복 파일(동일본) 여부 확인
    dup_map: dict[str, str] = {}
    dups = index.duplicates()
    for g in dups:
        first = g[0]
        for item in g[1:]:
            dup_map[item.key] = f"동일본(원본: {first.rel})"

    # 본 대상 → 초안 → 서식 순으로 세우고, 머리에 묶음 요약을 붙인다 (어디가 '진짜' 대상인지 먼저 보이게)
    primary, drafts, scaffolds = partition(matches)
    unique_primary = len({e.md5 or e.key for e in primary})
    matches = [*primary, *drafts, *scaffolds]
    total_count = len(matches)
    total_lines = sum(e.lines for e in matches)

    header = f"[대상 목록: {category_name}] 총 {total_count}개 파일 · {total_lines:,}줄"
    groups: Counter = Counter(_group_label(e.rel) for e in primary)
    summary_rows = [f"본 대상 {len(primary)}개 (고유 {unique_primary}개) — 요청이 이 묶음 전체라면 이것을 모두 읽는다"]
    summary_rows += [f"  · {g} ×{n}" for g, n in groups.most_common(6)]
    if drafts:
        dgroups: Counter = Counter(_group_label(e.rel) for e in drafts)
        summary_rows.append(f"초안 · 검토 중 {len(drafts)}개 — 확정본이 아니다 (비교 · 이력 확인용): "
                            + ", ".join(f"{g} ×{n}" for g, n in dgroups.most_common(3)))
    if scaffolds:
        summary_rows.append(f"서식 · 예시 {len(scaffolds)}개 — 내용이 아니라 틀이다 (표준을 만들 때 참고만)")
    rows = [header, *summary_rows, "경로 | 줄 수 | 상태 | 동일본 | resourceId | 요약/제목", "-" * 60]

    budget = COLLECT_BUDGET_BYTES - len(header.encode("utf-8")) - 300
    shown = 0

    for entry in matches[offset:]:
        dup_info = dup_map.get(entry.key, "-")
        summary = entry.summary.replace("\n", " ").strip() or entry.title or ""
        if len(summary) > 50:
            summary = summary[:47] + "…"
        status = _clean_str(entry.frontmatter.get("상태") or entry.frontmatter.get("status")) or "-"
        rid = getattr(entry, "resource_id", None) or "-"
        row = f"{entry.rel} | {entry.lines}줄 | {status} | {dup_info} | {rid} | {summary}"
        row_bytes = len(row.encode("utf-8")) + 1
        if budget - row_bytes < 0:
            break
        budget -= row_bytes
        rows.append(row)
        shown += 1

    remaining = total_count - offset - shown
    if remaining > 0:
        rows.append(f"… 외 {remaining}개 (ws_collect(query=\"{q}\", offset={offset + shown}) 으로 다음 쪽 확인)")

    return "\n".join(rows)
