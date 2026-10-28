"""FastAPI 루트 실행 진입점 (`python -c "import main"` 및 `uvicorn main:app` 호환)."""
from __future__ import annotations

import sys
from pathlib import Path

_ENGINE_SRC = Path(__file__).resolve().parents[2] / "packages" / "pdf-vdoc-engine"
if str(_ENGINE_SRC) not in sys.path:
    sys.path.insert(0, str(_ENGINE_SRC))

from app.main import app, create_app  # noqa: E402

__all__ = ["app", "create_app"]
