"""하네스 사용량 원장 (`state/assistant/ledger.jsonl`) — 실행마다 한 줄: 하네스 · 모델 · 토큰 · 시간."""
from __future__ import annotations

import json
import threading
from collections import defaultdict
from pathlib import Path
from typing import Any


class JsonlUsageLedger:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()

    def record(self, entry: dict[str, Any]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock, self._path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def summary(self, limit: int = 2000) -> dict[str, Any]:
        if not self._path.exists():
            return {"harnesses": {}, "recent": []}
        with self._lock:
            lines = self._path.read_text(encoding="utf-8").splitlines()[-limit:]
        rows = []
        for line in lines:
            try:
                rows.append(json.loads(line))
            except ValueError:
                continue
        agg: dict[str, dict[str, float]] = defaultdict(lambda: {"runs": 0, "ok": 0, "totalTokens": 0, "inputTokens": 0, "outputTokens": 0, "ms": 0})
        for r in rows:
            a = agg[str(r.get("harnessId"))]
            a["runs"] += 1
            a["ok"] += 1 if r.get("ok") else 0
            a["totalTokens"] += int(r.get("total_tokens", 0))
            a["inputTokens"] += int(r.get("input_tokens", 0))
            a["outputTokens"] += int(r.get("output_tokens", 0))
            a["ms"] += int(r.get("durationMs", 0))
        harnesses = {
            k: {**v, "avgTokens": round(v["totalTokens"] / v["runs"]) if v["runs"] else 0, "avgMs": round(v["ms"] / v["runs"]) if v["runs"] else 0}
            for k, v in agg.items()
        }
        return {"harnesses": harnesses, "recent": rows[-30:][::-1]}
