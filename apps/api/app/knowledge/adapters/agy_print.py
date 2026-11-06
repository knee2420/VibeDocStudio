"""agy CLI 단발 실행 (`agy -p` · `--output-format json`) — 작업 폴더를 지정할 수 있는 얇은 실행기.

카드 보강은 빈 샌드박스 폴더에서 돌린다 (agy 내장 도구가 사용자 파일을 건드리지 않게).
벤치마크의 "원문 직접 탐색" 비교군도 같은 실행기로, 작업 폴더만 원문 사본으로 바꿔 돌린다.
"""
from __future__ import annotations

import json
import logging
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from app.core.process_tree import popen_tree

logger = logging.getLogger(__name__)
CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


@dataclass
class AgyPrintResult:
    ok: bool
    response: Any = None
    text: str = ""
    error: str = ""
    duration_seconds: float = 0.0
    num_turns: int = 0
    usage: dict[str, int] = field(default_factory=dict)
    conversation_id: str = ""


def _envelope(stdout: str) -> Optional[dict[str, Any]]:
    found = None
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        if isinstance(msg, dict) and ("status" in msg or "response" in msg):
            found = msg
    if found is None:
        try:
            msg = json.loads(stdout)
            if isinstance(msg, dict):
                found = msg
        except ValueError:
            pass
    return found


def run_agy_print(
    prompt: str,
    *,
    executable: str,
    model: str,
    cwd: Path,
    schema: Optional[dict[str, Any]] = None,
    timeout_seconds: int = 300,
    effort: Optional[str] = None,
    extra_args: Optional[list[str]] = None,
) -> AgyPrintResult:
    cwd.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="kdeck_agy_"))
    try:
        prompt_file = tmp / "prompt.txt"
        prompt_file.write_text(prompt, encoding="utf-8")
        cmd = [executable, "--dangerously-skip-permissions", "--disable-slash-commands", "--output-format", "json", "--model", model]
        if effort:
            cmd += ["--effort", effort]
        if schema is not None:
            schema_file = tmp / "schema.json"
            schema_file.write_text(json.dumps(schema, ensure_ascii=False), encoding="utf-8")
            cmd += ["--json-schema", str(schema_file)]
        cmd += extra_args or []
        started = time.monotonic()
        with prompt_file.open("r", encoding="utf-8") as stdin:
            tree = popen_tree(
                cmd, stdin=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=str(cwd),
                text=True, encoding="utf-8", errors="replace", creationflags=CREATE_NO_WINDOW,
            )
            try:
                stdout, stderr = tree.proc.communicate(timeout=timeout_seconds)
            except subprocess.TimeoutExpired:
                tree.kill()
                stdout, stderr = tree.proc.communicate()
                return AgyPrintResult(ok=False, error=f"timeout {timeout_seconds}s", duration_seconds=time.monotonic() - started)
        duration = time.monotonic() - started
        env = _envelope(stdout)
        if env is None:
            return AgyPrintResult(ok=False, error=(stderr or stdout or f"exit {tree.proc.returncode}")[:800], duration_seconds=duration)
        usage = env.get("usage") or {}
        resp = env.get("response")
        text = resp if isinstance(resp, str) else json.dumps(resp, ensure_ascii=False) if resp is not None else ""
        status = str(env.get("status", "")).upper()
        return AgyPrintResult(
            ok=status in ("SUCCESS", "OK", ""),
            response=resp,
            text=text,
            error="" if status in ("SUCCESS", "OK", "") else str(env.get("error") or status),
            duration_seconds=float(env.get("duration_seconds") or duration),
            num_turns=int(env.get("num_turns") or 0),
            usage={k: int(usage.get(k) or 0) for k in ("input_tokens", "output_tokens", "thinking_tokens", "cache_read_tokens", "total_tokens")},
            conversation_id=str(env.get("conversation_id") or ""),
        )
    finally:
        import shutil

        shutil.rmtree(tmp, ignore_errors=True)


def parse_json_text(text: str) -> Any:
    """모델이 코드펜스 · 머리말을 붙여도 첫 JSON 객체를 꺼낸다."""
    if not text:
        return None
    body = text.strip()
    if body.startswith("```"):
        body = body.split("\n", 1)[1] if "\n" in body else ""
        body = body.rsplit("```", 1)[0]
    try:
        return json.loads(body)
    except ValueError:
        pass
    # 머리말 · 꼬리말이 붙은 경우: 바깥 괄호 쌍(객체 또는 배열)을 찾아 다시 읽는다
    for open_ch, close_ch in (("[", "]"), ("{", "}")):
        start, end = body.find(open_ch), body.rfind(close_ch)
        if start >= 0 and end > start:
            try:
                return json.loads(body[start:end + 1])
            except ValueError:
                continue
    return None


class AgyCardEnricher:
    """`CardEnricher` 구현 — 빈 샌드박스에서 agy 를 돌려 카드 재료 JSON 을 받는다."""

    def __init__(self, *, executable: str, model: str, sandbox_dir: Path, timeout_seconds: int = 300) -> None:
        self.executable = executable
        self.model = model
        self.sandbox_dir = sandbox_dir
        self.timeout_seconds = timeout_seconds

    def run(self, prompt: str, schema: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
        result = run_agy_print(prompt, executable=self.executable, model=self.model, cwd=self.sandbox_dir,
                               schema=schema, timeout_seconds=self.timeout_seconds)
        meta: dict[str, Any] = {"calls": 1, **result.usage, "seconds": round(result.duration_seconds, 2)}
        if not result.ok:
            logger.warning("[knowledge] agy 보강 실패: %s", result.error[:300])
            return None, meta
        data = result.response if isinstance(result.response, (dict, list)) else parse_json_text(result.text)
        return data, meta
