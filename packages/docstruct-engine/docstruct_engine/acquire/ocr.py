"""Windows WinRT Media.Ocr adapter implementing OcrPort with ko/en-US numeric pass."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Optional

from ..config import load_registry
from ..ir.model import BBox, Word, bbox_iou

_PS1_PATH = Path(__file__).resolve().with_name("ocr_windows.ps1")


def _run_ps_ocr(image_path: Path, lang: str, *, timeout_s: float = 45.0) -> dict[str, Any]:
    exe = shutil.which("powershell") or shutil.which("pwsh") or "powershell.exe"
    cmd = [
        exe,
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(_PS1_PATH),
        "-ImagePath",
        str(image_path),
        "-Lang",
        lang,
    ]
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout_s,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"WinRT OCR ({lang}) failed: {proc.stderr.strip() or proc.stdout.strip()}")
    raw = proc.stdout.strip()
    if not raw:
        return {"width": 0, "height": 0, "lines": []}
    return json.loads(raw)


def _scale_box(w_dict: dict[str, Any], sx: float, sy: float) -> BBox:
    x0 = max(0.0, round(float(w_dict["x"]) * sx, 2))
    y0 = max(0.0, round(float(w_dict["y"]) * sy, 2))
    x1 = max(x0 + 0.5, round((float(w_dict["x"]) + float(w_dict["w"])) * sx, 2))
    y1 = max(y0 + 0.5, round((float(w_dict["y"]) + float(w_dict["h"])) * sy, 2))
    return (x0, y0, x1, y1)


def _is_suspicious_token(text: str) -> bool:
    s = text.strip()
    if not s:
        return True
    # Odd mixed symbols / isolated control-like garbage often seen on low-contrast OCR
    weird = sum(1 for ch in s if ch in "|~`^\\")
    if weird >= max(1, len(s) // 2):
        return True
    return False


class WindowsOcrAdapter:
    """WinRT Windows.Media.Ocr adapter (`ko` primary + optional `en-US` retry on numeric/ASCII tokens)."""

    def __init__(
        self,
        *,
        primary_lang: str = "ko",
        secondary_lang: Optional[str] = "en-US",
        timeout_s: float = 45.0,
        registry: Optional[dict[str, Any]] = None,
    ) -> None:
        self.primary_lang = primary_lang
        self.secondary_lang = secondary_lang
        self.timeout_s = timeout_s
        self.registry = registry or load_registry()
        num_pat = self.registry.get("ocrNumericPattern") or r"^[\d\s.,:%+\-/~()]+$"
        self._num_re = re.compile(str(num_pat))

    def recognize(
        self,
        image_path: Path,
        page_size_pt: tuple[float, float],
        *,
        dpi: int = 300,
    ) -> list[Word]:
        primary = _run_ps_ocr(image_path, self.primary_lang, timeout_s=self.timeout_s)
        img_w = float(primary.get("width") or 0)
        img_h = float(primary.get("height") or 0)
        if img_w <= 0 or img_h <= 0:
            scale = 72.0 / max(72.0, float(dpi))
            sx = sy = scale
        else:
            sx = float(page_size_pt[0]) / img_w
            sy = float(page_size_pt[1]) / img_h

        secondary_words: list[tuple[str, BBox]] = []
        if self.secondary_lang and self.secondary_lang != self.primary_lang:
            try:
                sec = _run_ps_ocr(image_path, self.secondary_lang, timeout_s=self.timeout_s)
                sw = float(sec.get("width") or img_w or 1.0)
                sh = float(sec.get("height") or img_h or 1.0)
                ssx = float(page_size_pt[0]) / sw if sw > 0 else sx
                ssy = float(page_size_pt[1]) / sh if sh > 0 else sy
                for ln in sec.get("lines") or []:
                    for wd in ln.get("words") or []:
                        t = str(wd.get("text") or "").strip()
                        if t:
                            secondary_words.append((t, _scale_box(wd, ssx, ssy)))
            except Exception:
                secondary_words = []

        words_out: list[Word] = []
        seq = 0
        for line_idx, ln in enumerate(primary.get("lines") or []):
            for wd in ln.get("words") or []:
                txt = str(wd.get("text") or "").strip()
                if not txt:
                    continue
                bx = _scale_box(wd, sx, sy)
                est_pt = round(max(6.0, (bx[3] - bx[1]) * 0.8), 1)
                conf = 0.88

                # If suspicious or mostly ASCII/digits, cross-check against en-US pass
                is_asciiish = all(ord(ch) < 128 for ch in txt)
                suspicious = _is_suspicious_token(txt)
                if secondary_words and (suspicious or is_asciiish or bool(self._num_re.match(txt))):
                    best_sec = max(
                        ((st, bbox_iou(bx, sbx)) for st, sbx in secondary_words),
                        key=lambda item: item[1],
                        default=("", 0.0),
                    )
                    if best_sec[1] >= 0.45:
                        sec_txt = best_sec[0]
                        if suspicious and not _is_suspicious_token(sec_txt):
                            txt = sec_txt
                            conf = 0.78
                        elif sec_txt == txt:
                            conf = 0.94
                        elif is_asciiish and any(c.isdigit() for c in sec_txt) and not any(c.isdigit() for c in txt):
                            txt = sec_txt
                            conf = 0.72
                        elif is_asciiish and sec_txt != txt:
                            conf = 0.60

                if _is_suspicious_token(txt):
                    conf = min(conf, 0.50)

                words_out.append(
                    Word(
                        id=f"w{seq}",
                        text=txt,
                        bbox=bx,
                        conf=round(conf, 3),
                        src="ocr",
                        size=est_pt,
                        needsReview=conf < 0.65,
                        baseline=round(bx[3], 2),
                        lineHint=line_idx,
                    )
                )
                seq += 1

        return words_out

