"""벤치마크 공용 설정 — 말뭉치 · 경로 · 모델."""
from __future__ import annotations

import json
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parents[1]
for extra in (API_ROOT, REPO_ROOT / "packages" / "agent-core", REPO_ROOT / "packages" / "docstruct-engine",
              REPO_ROOT / "packages" / "harness-kit"):
    if str(extra) not in sys.path:
        sys.path.insert(0, str(extra))

BENCH_DIR = API_ROOT / "bench"
STATE = API_ROOT / "state" / "bench"
DECKS = STATE / "decks"
CACHE = STATE / "cache"
SANDBOX = STATE / "sandbox"
RESULTS = BENCH_DIR / "results"

ARCHIVE = REPO_ROOT.parent / "VibePatchNote" / "workbench" / "99.archive"

#: 말뭉치: 원문 경로 + 색인 범위 프로필 (원문 직접 탐색 비교군은 profile 과 무관하게 폴더 전체를 본다)
CORPORA: dict[str, dict] = {
    "agy": {
        "title": "Antigravity CLI Docs",
        "path": ARCHIVE / "antigravity-cli-docs",
        "profile": {},
    },
    "fsd": {
        "title": "Feature-Sliced Design Docs",
        "path": ARCHIVE / "feature-sliced-design",
        # 영어 원문 문서만 색인 (번역본 · 사이트 코드 제외) — dify 에서 api/core 만 고른 것과 같은 "범위 선별"
        "profile": {"include": ["feature-sliced-design/src/content/docs/docs/*"]},
    },
}

MODEL = "gemini-3.8-flash-low"
AGY = "agy"


def deck_dir(corpus: str, depth: str) -> Path:
    return DECKS / f"{corpus}-{depth}"


def deck_id(corpus: str, depth: str) -> str:
    return f"bench_{corpus}_{depth}"


def dump(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
