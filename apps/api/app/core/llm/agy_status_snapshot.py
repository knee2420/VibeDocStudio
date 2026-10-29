"""AGY TUI status-line JSON을 앱이 읽을 수 있는 안전한 snapshot으로 정규화한다."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class AgyStatusSnapshot:
    def __init__(self, path: Path) -> None:
        self._path = path

    def read(self) -> dict[str, Any] | None:
        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        if not isinstance(payload, dict):
            return None
        return {
            "updatedAt": payload.get("updatedAt"),
            "model": payload.get("model") or {},
            "cliVersion": payload.get("cliVersion"),
            "planTier": payload.get("planTier"),
            "contextWindow": payload.get("contextWindow") or {},
            "quota": payload.get("quota") or {},
            "agentState": payload.get("agentState"),
            "taskCount": payload.get("taskCount"),
            "artifactCount": payload.get("artifactCount"),
            "executionMode": payload.get("executionMode"),
            "exceeds200kTokens": payload.get("exceeds200kTokens"),
        }
