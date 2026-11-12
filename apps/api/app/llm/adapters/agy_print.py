"""agy CLI 단발 실행 (`--output-format json`, 프롬프트는 stdin) — 작업 폴더를 지정할 수 있는 얇은 실행기.

단발 호출(지식 카드 보강 · 서식 시맨틱 정밀화 · 벤치마크 비교군)은 모두 이 실행기 하나를 쓴다.
호출하는 쪽이 빈 샌드박스 폴더를 cwd 로 넘기면 agy 내장 도구가 사용자 파일을 건드리지 않는다.
"""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, Optional

from app.core.process_tree import CREATE_NO_WINDOW, popen_tree

from ..models import OneShotResult

logger = logging.getLogger(__name__)


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
) -> OneShotResult:
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
                elapsed = time.monotonic() - started
                logger.warning(
                    "[agy_print] timeout model=%s timeoutS=%d durationS=%.2f",
                    model,
                    timeout_seconds,
                    elapsed,
                )
                return OneShotResult(ok=False, error=f"timeout {timeout_seconds}s", duration_seconds=elapsed)
        duration = time.monotonic() - started
        env = _envelope(stdout)
        if env is None:
            err = (stderr or stdout or f"exit {tree.proc.returncode}")[:800]
            logger.warning(
                "[agy_print] missing_envelope model=%s rc=%s durationS=%.2f err=%s",
                model,
                tree.proc.returncode,
                duration,
                err[:200],
            )
            return OneShotResult(ok=False, error=err, duration_seconds=duration)
        usage = env.get("usage") or {}
        resp = env.get("response")
        text = resp if isinstance(resp, str) else json.dumps(resp, ensure_ascii=False) if resp is not None else ""
        status = str(env.get("status", "")).upper()
        ok = status in ("SUCCESS", "OK", "")
        result_duration = float(env.get("duration_seconds") or duration)
        num_turns = int(env.get("num_turns") or 0)
        usage_map = {
            k: int(usage.get(k) or 0)
            for k in ("input_tokens", "output_tokens", "thinking_tokens", "cache_read_tokens", "total_tokens")
        }
        error_msg = "" if ok else str(env.get("error") or status)
        log_fn = logger.info if ok else logger.warning
        log_fn(
            "[agy_print] model=%s status=%s durationS=%.2f turns=%d inTok=%d outTok=%d thinkTok=%d",
            model,
            status or "OK",
            result_duration,
            num_turns,
            usage_map["input_tokens"],
            usage_map["output_tokens"],
            usage_map["thinking_tokens"],
        )
        return OneShotResult(
            ok=ok,
            response=resp,
            text=text,
            error=error_msg,
            duration_seconds=result_duration,
            num_turns=num_turns,
            usage=usage_map,
            conversation_id=str(env.get("conversation_id") or ""),
        )
    finally:
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
