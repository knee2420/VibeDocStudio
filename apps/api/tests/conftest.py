"""테스트 격리: 실제 `data/` · `cache/` · `state/` 대신 세션 임시 폴더를 쓰고 외부 LLM 호출을 끈다.

`app.core.config.settings` 는 import 시점에 환경 변수를 읽으므로, 테스트 모듈이 `main` 을
import 하기 전(=conftest 로드 시점)에 설정해야 한다.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

_SESSION_ROOT = Path(tempfile.mkdtemp(prefix="vibe-api-tests-"))

for _name, _sub in (
    ("VIBE_DATA_DIR", "data"),
    ("VIBE_CACHE_DIR", "cache"),
    ("VIBE_STATE_DIR", "state"),
    ("VIBE_CONFIG_DIR", "config"),
):
    os.environ[_name] = str(_SESSION_ROOT / _sub)

os.environ["VIBE_EXTERNAL_LLM"] = "0"
