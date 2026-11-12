"""Windows WinRT Media.Ocr adapter implementing OcrPort with ko/en-US numeric pass."""
from __future__ import annotations

import json
import re
import shutil
import statistics
import subprocess
from pathlib import Path
from typing import Any, Optional

from PIL import Image

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


def _measure_word_ink_height_pt(gray: Any, wd: dict[str, Any], sy: float) -> Optional[float]:
    """Measure tight vertical dark-ink span inside an OCR word pixel box in pt."""
    if gray is None:
        return None
    gw, gh = gray.size
    x0 = max(0, min(gw, int(round(float(wd["x"])))))
    y0 = max(0, min(gh, int(round(float(wd["y"])))))
    x1 = max(x0, min(gw, int(round(float(wd["x"]) + float(wd["w"])))))
    y1 = max(y0, min(gh, int(round(float(wd["y"]) + float(wd["h"])))))
    cw, ch = x1 - x0, y1 - y0
    if cw < 2 or ch < 2:
        return None
    raw = gray.crop((x0, y0, x1, y1)).tobytes()
    first_y = -1
    last_y = -1
    for ry in range(ch):
        row = raw[ry * cw : (ry + 1) * cw]
        dark = sum(1 for v in row if v < 195)
        if 0 < dark < cw * 0.92:
            if first_y < 0:
                first_y = ry
            last_y = ry
    if first_y < 0:
        return None
    return (last_y - first_y + 1) * sy


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

        gray_img: Optional[Image.Image] = None
        if image_path.is_file():
            try:
                gray_img = Image.open(image_path).convert("L")
            except Exception:
                gray_img = None

        scan_scale = float(self.registry.get("scanFontScale", 0.85))
        box_scale = float(self.registry.get("scanBoxFontScale", 0.72))

        words_out: list[Word] = []
        seq = 0
        try:
            for line_idx, ln in enumerate(primary.get("lines") or []):
                raw_wds = [
                    (str(wd.get("text") or "").strip(), wd)
                    for wd in (ln.get("words") or [])
                    if str(wd.get("text") or "").strip()
                ]
                if not raw_wds:
                    continue
                ink_vals: list[Optional[float]] = [
                    _measure_word_ink_height_pt(gray_img, wd, sy) for _, wd in raw_wds
                ]
                multi_inks = [
                    iv for (txt, _), iv in zip(raw_wds, ink_vals) if iv is not None and len(txt) >= 2
                ]
                any_inks = [iv for iv in ink_vals if iv is not None]
                line_ink_pt = (
                    float(statistics.median(multi_inks))
                    if multi_inks
                    else (float(max(any_inks)) if any_inks else None)
                )

                for (txt, wd), word_ink in zip(raw_wds, ink_vals):
                    bx = _scale_box(wd, sx, sy)
                    if line_ink_pt is not None:
                        eff_ink = (
                            word_ink
                            if word_ink is not None and len(txt) >= 2 and abs(word_ink - line_ink_pt) > line_ink_pt * 0.25
                            else line_ink_pt
                        )
                        est_pt = round(max(6.0, eff_ink * scan_scale), 1)
                    else:
                        est_pt = round(max(6.0, (bx[3] - bx[1]) * box_scale), 1)
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
        finally:
            if gray_img is not None:
                gray_img.close()

        return words_out

