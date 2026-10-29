"""BaseLlmHarness 구현체 — Antigravity CLI(agy).

규칙:
- `--dangerously-skip-permissions` 필수 (헤드리스에서 권한 프롬프트가 자동 거부됨)
- 윈도우 UTF-8 입출력 강제 / `CREATE_NO_WINDOW` 로 콘솔 창 억제
- `--json-schema` 로 구조화 출력 강제 (단, 항상 지켜지지는 않으므로 파서가 방어)

전송 방식: stdin 파일 스트림 (`--output-format json`).
프롬프트는 텍스트 파일(.txt)로 저장한 뒤 stdin 파일 스트림(`stdin=f`)으로 공급하고,
출력은 `--output-format json` 단일 엔벨로프로 회수합니다.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union

from ..base import (
    STATUS_FAILED,
    STATUS_PARSE_ERROR,
    STATUS_TIMEOUT,
    BaseLlmHarness,
    LlmExecutionResult,
)
from ..parsing import parse_json_payload
from ..registry import DEFAULT_MODEL_NAME, get_model_spec, resolve_effort

logger = logging.getLogger(__name__)

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0

DEFAULT_MODEL = DEFAULT_MODEL_NAME
DEFAULT_TIMEOUT_SECONDS = 180


def _extract_result_envelope(stdout: str) -> Optional[Dict[str, Any]]:
    """NDJSON 스트림에서 최종 결과 엔벨로프를 회수한다."""
    envelope: Optional[Dict[str, Any]] = None
    for line in stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        if not isinstance(msg, dict):
            continue
        msg_type = msg.get("type")
        if msg_type == "result" or (
            msg_type is None and ("status" in msg or "response" in msg)
        ):
            envelope = msg
    return envelope


def _extract_token_counts(msg: Dict[str, Any]) -> Tuple[int, int, int, int]:
    """결과 엔벨로프의 usage / stats / metadata 에서 토큰 수를 회수한다."""
    candidates = [
        msg.get("usage"),
        msg.get("stats"),
        msg.get("metadata", {}).get("usage") if isinstance(msg.get("metadata"), dict) else None,
        msg,
    ]
    for c in candidates:
        if not isinstance(c, dict):
            continue
        inp = c.get("input_tokens") or c.get("prompt_tokens") or 0
        out = c.get("output_tokens") or c.get("completion_tokens") or 0
        think = c.get("thinking_tokens") or c.get("reasoning_tokens") or 0
        total = c.get("total_tokens") or 0
        if inp or out or total:
            calc_total = total or (inp + out + think)
            return int(inp), int(out), int(think), int(calc_total)
    return 0, 0, 0, 0


class AgyCliHarness(BaseLlmHarness):
    """Antigravity CLI (agy) 실행 하네스."""

    name = "agy-cli"

    def __init__(
        self,
        model: str = DEFAULT_MODEL,
        effort: Optional[str] = None,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        executable: Optional[str] = None,
        cli_executable: Optional[str] = None,
    ) -> None:
        super().__init__(model=model, timeout_seconds=timeout_seconds)
        self.effort = effort
        self.executable = executable or cli_executable or "agy"
        self.cli_executable = self.executable

    def run_structured(
        self,
        prompt: str,
        *,
        schema_path: Optional[Union[str, Path]] = None,
        json_schema: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None,
        effort: Optional[str] = None,
        conversation_id: Optional[str] = None,
        timeout: Optional[int] = None,
        file_path: Optional[Union[str, Path]] = None,
        **kwargs: Any,
    ) -> LlmExecutionResult:
        """CLI 를 서브프로세스로 기동하여 구조화 출력을 회수한다."""
        target_model = model or self.model
        spec = get_model_spec(target_model)
        chosen_effort = resolve_effort(spec, effort if effort is not None else self.effort)
        timeout_limit = timeout or self.timeout_seconds

        tmp_dir = Path(tempfile.mkdtemp(prefix="agy_harness_"))
        prompt_file = tmp_dir / "prompt.txt"
        schema_file_to_clean: Optional[Path] = None
        isolated_source_dir: Optional[str] = None

        try:
            effective_prompt = prompt
            if file_path:
                fp = Path(file_path).resolve()
                if fp.exists() and fp.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
                    if not prompt.startswith("참조 이미지:") and f"@{fp}" not in prompt:
                        effective_prompt = f"참조 이미지: @{fp}\n\n{prompt}"
            prompt_file.write_text(effective_prompt, encoding="utf-8")

            final_schema_path: Optional[str] = None
            if json_schema is not None:
                schema_file_to_clean = tmp_dir / "schema.json"
                schema_file_to_clean.write_text(
                    json.dumps(json_schema, ensure_ascii=False),
                    encoding="utf-8",
                )
                final_schema_path = str(schema_file_to_clean)
            elif schema_path is not None:
                final_schema_path = str(Path(schema_path).resolve())

            cmd = [
                self.cli_executable,
                "--dangerously-skip-permissions",
                "--output-format", "json",
                "--model", target_model,
            ]
            if chosen_effort:
                cmd.extend(["--effort", chosen_effort])
            if final_schema_path and spec.supports_structured_schema:
                cmd.extend(["--json-schema", final_schema_path])
            if conversation_id:
                cmd.extend(["-c", str(conversation_id)])
            if file_path:
                isolated_source_dir = self._prepare_isolated_source_dir(file_path)
                if isolated_source_dir:
                    cmd.extend(["--add-dir", isolated_source_dir])

            start_time = time.monotonic()
            logger.info("[AgyCliHarness] CLI 호출 시작: %s (model=%s)", " ".join(cmd[:6]), target_model)

            with open(prompt_file, "r", encoding="utf-8") as f_in:
                proc = subprocess.Popen(
                    cmd,
                    stdin=f_in,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    creationflags=CREATE_NO_WINDOW,
                )
                try:
                    stdout, stderr = proc.communicate(timeout=timeout_limit)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    stdout, stderr = proc.communicate()
                    duration = time.monotonic() - start_time
                    logger.error("[AgyCliHarness] 타임아웃 (%ss 초과)", timeout_limit)
                    return LlmExecutionResult(
                        status=STATUS_TIMEOUT,
                        model=target_model,
                        error=f"CLI timeout after {timeout_limit} seconds",
                        duration_seconds=duration,
                        telemetry_metadata={
                            "provider": self.name,
                            "effort": chosen_effort,
                            "command": " ".join(cmd),
                        },
                    )

            duration = time.monotonic() - start_time
            envelope = _extract_result_envelope(stdout)

            if proc.returncode != 0 and envelope is None:
                err_msg = stderr.strip() or stdout.strip() or f"Process exited with code {proc.returncode}"
                logger.error("[AgyCliHarness] 비정상 종료 (code=%s): %s", proc.returncode, err_msg[:300])
                return LlmExecutionResult(
                    status=STATUS_FAILED,
                    model=target_model,
                    error=err_msg,
                    raw_response=stdout,
                    duration_seconds=duration,
                    telemetry_metadata={
                        "provider": self.name,
                        "exit_code": proc.returncode,
                        "stderr": stderr[:500],
                        "command": " ".join(cmd),
                    },
                )

            raw_text = ""
            structured_out: Optional[Dict[str, Any]] = None
            inp_tok, out_tok, think_tok, total_tok = 0, 0, 0, 0
            resolved_conv_id = conversation_id

            if envelope is not None:
                inp_tok, out_tok, think_tok, total_tok = _extract_token_counts(envelope)
                resolved_conv_id = envelope.get("conversation_id") or conversation_id
                resp_field = envelope.get("response")
                if isinstance(resp_field, dict):
                    structured_out = resp_field
                    raw_text = json.dumps(resp_field, ensure_ascii=False)
                elif isinstance(resp_field, str):
                    raw_text = resp_field
                else:
                    raw_text = stdout

                if envelope.get("status") in ("error", "failed"):
                    return LlmExecutionResult(
                        status=STATUS_FAILED,
                        model=target_model,
                        raw_response=raw_text or stdout,
                        error=str(envelope.get("error") or "CLI returned error status"),
                        duration_seconds=duration,
                        input_tokens=inp_tok,
                        output_tokens=out_tok,
                        thinking_tokens=think_tok,
                        total_tokens=total_tok,
                        conversation_id=resolved_conv_id,
                        telemetry_metadata={
                            "provider": self.name,
                            "effort": chosen_effort,
                            "envelope": envelope,
                        },
                    )
            else:
                raw_text = stdout

            if structured_out is None and raw_text:
                try:
                    loaded = json.loads(raw_text.strip())
                    if isinstance(loaded, dict):
                        structured_out = loaded
                except Exception:
                    pass

                # NDJSON 또는 다중 라인 JSON 객체 역순 탐색 (최신 완성본 우선)
                if structured_out is None:
                    for line in reversed(raw_text.strip().splitlines()):
                        line_clean = line.strip()
                        if not (line_clean.startswith("{") and line_clean.endswith("}")):
                            continue
                        try:
                            candidate_obj = json.loads(line_clean)
                            if isinstance(candidate_obj, dict):
                                structured_out = candidate_obj
                                break
                        except Exception:
                            continue

                # 마크다운 코드펜스 등 관용적 페이로드 회수
                if structured_out is None:
                    structured_out = parse_json_payload(raw_text)


            if structured_out is None:
                logger.warning("[AgyCliHarness] 구조화 JSON 파싱 실패 (raw_len=%d)", len(raw_text))
                return LlmExecutionResult(
                    status=STATUS_PARSE_ERROR,
                    model=target_model,
                    raw_response=raw_text,
                    error="Failed to parse structured JSON from CLI response",
                    duration_seconds=duration,
                    input_tokens=inp_tok,
                    output_tokens=out_tok,
                    thinking_tokens=think_tok,
                    total_tokens=total_tok,
                    conversation_id=resolved_conv_id,
                    telemetry_metadata={
                        "provider": self.name,
                        "effort": chosen_effort,
                        "raw_sample": raw_text[:300],
                    },
                )

            return LlmExecutionResult(
                status="SUCCESS",
                model=target_model,
                structured_output=structured_out,
                raw_response=raw_text,
                conversation_id=resolved_conv_id,
                duration_seconds=duration,
                input_tokens=inp_tok,
                output_tokens=out_tok,
                thinking_tokens=think_tok,
                total_tokens=total_tok,
                telemetry_metadata={
                    "provider": self.name,
                    "effort": chosen_effort,
                    "command": " ".join(cmd),
                },
            )

        finally:
            if isolated_source_dir:
                self._cleanup_isolated_dir(isolated_source_dir)
            shutil.rmtree(tmp_dir, ignore_errors=True)

    @staticmethod
    def _prepare_isolated_source_dir(file_path: Union[str, Path]) -> Optional[str]:
        """단일 source 파일만 존재하는 격리된 디렉터리를 구성하여 --add-dir에 넘긴다."""
        src = Path(file_path).resolve()
        if not src.exists():
            return None

        if src.is_dir():
            return str(src)

        iso_dir = Path(tempfile.mkdtemp(prefix="agy_source_iso_"))
        target = iso_dir / src.name
        try:
            os.link(src, target)
        except Exception:
            try:
                shutil.copy2(src, target)
            except Exception as e:
                logger.warning("[agy] 격리 source 디렉터리 복사 실패: %s", e)
                try:
                    shutil.rmtree(iso_dir, ignore_errors=True)
                except Exception:
                    pass
                return None

        return str(iso_dir)

    @staticmethod
    def _cleanup_isolated_dir(isolated_dir: Optional[str]) -> None:
        if isolated_dir and os.path.exists(isolated_dir):
            try:
                shutil.rmtree(isolated_dir, ignore_errors=True)
            except Exception:
                pass

    @staticmethod
    def _resolve_schema_file(
        schema_path: Optional[Union[str, Path]],
        json_schema: Optional[Dict[str, Any]],
    ) -> Tuple[Optional[str], bool]:
        """`--json-schema` 에 넘길 파일 경로를 확정한다. 반환: (경로, 임시파일여부)"""
        if schema_path and Path(schema_path).exists():
            return str(Path(schema_path).resolve()), False
        if json_schema:
            try:
                handle = tempfile.NamedTemporaryFile(
                    mode="w", suffix=".json", delete=False, encoding="utf-8"
                )
                json.dump(json_schema, handle, ensure_ascii=False, indent=2)
                handle.close()
                return handle.name, True
            except Exception as e:
                logger.warning("[agy] 임시 스키마 생성 실패 — 스키마 없이 진행: %s", e)
        return None, False

    @staticmethod
    def _cleanup_schema(schema_file: Optional[str], is_temp: bool) -> None:
        if is_temp and schema_file and os.path.exists(schema_file):
            try:
                os.unlink(schema_file)
            except OSError:
                pass
