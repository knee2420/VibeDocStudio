"""선별 슬롯 정제(`SlotTextRefinerPort`)용 agy CLI 어댑터."""
from __future__ import annotations

import json
import logging
import shutil
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Iterator, Optional

from harness_kit import packs
from pdf_fidelity_engine.models import RefinedSlotPatch, SuspectSlot

from app.llm.catalog import normalize_agy_model
from app.llm.policy import CLI_PROVIDER, RuntimeExecutionPolicy

logger = logging.getLogger(__name__)


def _parse_json_payload(text: str) -> Optional[dict[str, Any]]:
    body = (text or "").strip()
    if not body:
        return None
    if body.startswith("```"):
        body = body.split("\n", 1)[1] if "\n" in body else ""
        body = body.rsplit("```", 1)[0]
    try:
        parsed = json.loads(body)
        return parsed if isinstance(parsed, dict) else None
    except ValueError:
        pass
    start, end = body.find("{"), body.rfind("}")
    if start >= 0 and end > start:
        try:
            parsed = json.loads(body[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except ValueError:
            return None
    return None


class AgySlotTextRefiner:
    """문제가 감지된 슬롯만 크롭 이미지와 함께 CLI VLM 에게 보내 본문 텍스트만 복원한다."""

    def __init__(
        self,
        *,
        one_shot: Optional[Callable[..., Any]],
        policy: Optional[RuntimeExecutionPolicy] = None,
        executable: Optional[str] = None,
        model: Optional[str] = None,
        timeout_seconds: int = 120,
        max_slots_per_call: int = 12,
        work_root: Optional[Path] = None,
    ) -> None:
        self._one_shot = one_shot
        self._policy = policy
        self._executable = executable
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._max_slots_per_call = max_slots_per_call
        self._work_root = work_root
        self.last_error: Optional[str] = None
        self.last_duration_s: float = 0.0

    @contextmanager
    def _scratch_dir(self) -> Iterator[Path]:
        if self._work_root is not None:
            run_dir = self._work_root / f"run_{uuid.uuid4().hex[:8]}"
            run_dir.mkdir(parents=True, exist_ok=True)
            try:
                yield run_dir
            finally:
                shutil.rmtree(run_dir, ignore_errors=True)
        else:
            with tempfile.TemporaryDirectory(prefix="vdoc_slot_refine_") as td:
                yield Path(td)

    def _resolve_target(self) -> tuple[Optional[str], Optional[str], int]:
        if self._policy is not None:
            if CLI_PROVIDER not in (self._policy.primary_provider, self._policy.fallback_provider):
                return None, None, self._timeout_seconds
            cli_bin = self._executable or self._policy.agent_cli_bin or "agy"
            resolved = shutil.which(cli_bin) or shutil.which("agy")
            model = self._model or normalize_agy_model(self._policy.agent_cli_model)
            timeout = min(self._policy.agent_cli_timeout_seconds or 180, self._timeout_seconds)
            return resolved, model, timeout
        return self._executable, self._model, self._timeout_seconds

    def refine_slots(
        self,
        *,
        page_png_bytes: Optional[bytes],
        doc_title: str,
        suspects: list[SuspectSlot],
        page_vdoc: dict[str, Any],
    ) -> dict[str, RefinedSlotPatch]:
        """의심 슬롯 목록에 대해 CLI 1-shot 호출을 수행하고 `{slotId: RefinedSlotPatch}` 를 돌려준다."""
        del page_vdoc
        self.last_error = None
        self.last_duration_s = 0.0
        resolved_bin, chosen_model, timeout = self._resolve_target()
        if not suspects or self._one_shot is None or not resolved_bin or not chosen_model:
            return {}

        prompts = packs.data("form-scaffold:prompts.json")
        target_suspects = suspects[: self._max_slots_per_call]

        with self._scratch_dir() as tmp_root:
            need_full_page = bool(page_png_bytes and any(not s.crop_png_bytes for s in target_suspects))
            page_path = tmp_root / "page.png"
            if need_full_page and page_png_bytes:
                page_path.write_bytes(page_png_bytes)

            items_lines: list[str] = []
            example_lines: list[str] = []
            for idx, item in enumerate(target_suspects):
                crop_path = tmp_root / f"crop_{idx}_{item.slot_id}.png"
                if item.crop_png_bytes:
                    crop_path.write_bytes(item.crop_png_bytes)
                    crop_ref = str(crop_path)
                elif need_full_page:
                    crop_ref = str(page_path)
                else:
                    crop_ref = "(none)"
                items_lines.append(
                    prompts["slotRefineItem"].format(
                        slot_id=item.slot_id,
                        kind=item.kind,
                        block_title=item.block_title,
                        reasons=", ".join(item.reasons),
                        raw_text=item.raw_text.replace("\n", " / ")[:240],
                        crop_path=crop_ref,
                    )
                )
                example_lines.append(f'    "{item.slot_id}": {{"paragraphs": ["..."]}}')

            page_ref = str(page_path) if need_full_page else "(crops-attached)"
            prompt_text = prompts["slotRefine"].format(
                doc_title=doc_title,
                page_path=page_ref,
                items="\n".join(items_lines),
                example_keys=",\n".join(example_lines),
            )

            try:
                res = self._one_shot(
                    prompt_text,
                    executable=resolved_bin,
                    model=chosen_model,
                    timeout_seconds=timeout,
                )
            except Exception as exc:
                self.last_error = f"{type(exc).__name__}: {exc}"
                logger.warning("[AgySlotTextRefiner] CLI call failed: %s", exc)
                return {}

        self.last_duration_s = float(getattr(res, "duration_seconds", 0.0) or 0.0)
        if not getattr(res, "ok", False):
            err_msg = str(getattr(res, "error", "") or "unknown")[:200]
            self.last_error = err_msg
            logger.warning("[AgySlotTextRefiner] CLI error (%.1fs): %s", self.last_duration_s, err_msg)
            return {}

        raw_response = getattr(res, "response", None)
        parsed = raw_response if isinstance(raw_response, dict) else _parse_json_payload(str(raw_response or ""))
        if not isinstance(parsed, dict):
            self.last_error = "invalid_json_response"
            return {}

        raw_patches = parsed.get("patches") if isinstance(parsed.get("patches"), dict) else parsed
        if not isinstance(raw_patches, dict):
            return {}

        valid_ids = {s.slot_id for s in target_suspects}
        out: dict[str, RefinedSlotPatch] = {}
        for sid, val in raw_patches.items():
            if sid not in valid_ids:
                continue
            paragraphs: list[str] = []
            if isinstance(val, list):
                paragraphs = [str(p) for p in val if str(p).strip()]
            elif isinstance(val, dict):
                raw_paras = val.get("paragraphs")
                if isinstance(raw_paras, list):
                    paragraphs = [str(p) for p in raw_paras if str(p).strip()]
                elif isinstance(val.get("text"), str) and val["text"].strip():
                    paragraphs = [line for line in val["text"].splitlines() if line.strip()]
            if paragraphs:
                out[sid] = RefinedSlotPatch(slot_id=sid, paragraphs=paragraphs)
        return out
