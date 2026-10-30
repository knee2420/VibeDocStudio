"""스킬 문서(`SKILL.md`)를 읽어 에이전트 시스템 프롬프트 조각으로 쓴다.

스킬은 IDE 에이전트용으로 쓴 마크다운 그대로다. CLI 루프도 같은 파일을 읽어야
IDE 와 CLI 가 같은 절차·규칙을 따른다. 여기서 사본을 따로 만들지 않는다.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

_FRONTMATTER = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)


@dataclass(frozen=True)
class Skill:
    name: str
    description: str
    body: str
    path: Path
    references: dict[str, str] = field(default_factory=dict)

    def as_prompt(self, *, max_chars: int = 14000) -> str:
        parts = [f"# SKILL: {self.name}", self.description, "", self.body.strip()]
        for ref_name, ref_text in self.references.items():
            parts += ["", f"## 참고 문서: {ref_name}", ref_text.strip()]
        text = "\n".join(parts)
        if len(text) > max_chars:
            text = text[:max_chars] + "\n…(스킬 본문 일부 생략)"
        return text


def _parse_frontmatter(raw: str) -> tuple[dict[str, str], str]:
    match = _FRONTMATTER.match(raw)
    if not match:
        return {}, raw
    meta: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, sep, value = line.partition(":")
        if sep:
            meta[key.strip()] = value.strip().strip('"')
    return meta, raw[match.end():]


def load_skill(skill_dir: Path | str, *, references: tuple[str, ...] = ()) -> Skill:
    """`<skill_dir>/SKILL.md` 와 지정한 참고 문서(상대 경로)를 읽는다."""
    root = Path(skill_dir)
    raw = (root / "SKILL.md").read_text(encoding="utf-8")
    meta, body = _parse_frontmatter(raw)
    refs = {rel: (root / rel).read_text(encoding="utf-8") for rel in references if (root / rel).exists()}
    return Skill(
        name=meta.get("name", root.name),
        description=meta.get("description", ""),
        body=body,
        path=root,
        references=refs,
    )
