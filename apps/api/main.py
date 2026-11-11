"""FastAPI 루트 실행 진입점 (`python -c "import main"` 및 `uvicorn main:app` 호환)."""
from __future__ import annotations

import sys
from pathlib import Path

_PACKAGES = Path(__file__).resolve().parents[2] / "packages"
for _src in (_PACKAGES / "pdf-vdoc-engine", _PACKAGES / "webpage-fidelity-engine", _PACKAGES / "harness-kit"):
    if str(_src) not in sys.path:
        sys.path.insert(0, str(_src))

from app.main import create_app  # noqa: E402

#: `uvicorn main:app` 이 쓰는 앱 인스턴스. 앱 조립(설정 읽기 · 시드)은 이 진입점을 import 할 때만 일어난다.
app = create_app()

__all__ = ["app", "create_app"]
