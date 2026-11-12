"""C4/C5 optional CDP DOM & computed-style measurement helper (evaluation-only).

This module never spawns a browser on its own. When a local Chromium / Edge
DevTools endpoint (default ``http://127.0.0.1:9222``) and Studio dev server are
available and explicitly requested via ``--render``, it captures real DOM boxes,
line counts (via Range.getClientRects()), computed styles, and screenshots.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Callable, Optional

from pydantic import BaseModel, Field


class MeasuredCellDOM(BaseModel):
    slotId: str
    cellId: str = ""
    clientWidth: float
    clientHeight: float
    scrollHeight: float
    lineCount: int = 1
    paddingTop: float = 0.0
    paddingRight: float = 0.0
    paddingBottom: float = 0.0
    paddingLeft: float = 0.0


class MeasuredPageDOM(BaseModel):
    pageNumber: int
    sheetWidthPx: float
    sheetHeightPx: float
    contentScrollHeightPx: float
    overflowPx: float
    hasOverflow: bool
    background: str = ""
    cells: list[MeasuredCellDOM] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


_PROBE_JS = r"""(() => {
  const sheet = document.querySelector('[id^="vdoc-page-"] > div');
  if (!sheet) return { error: 'SHEET_NOT_FOUND' };
  const sRect = sheet.getBoundingClientRect();
  const cs = getComputedStyle(sheet);
  const cells = [];
  for (const td of sheet.querySelectorAll('td[data-slot-id]')) {
    const slotId = td.getAttribute('data-slot-id') || '';
    const cellId = td.getAttribute('data-cell-id') || '';
    const tcs = getComputedStyle(td);
    const range = document.createRange();
    range.selectNodeContents(td);
    const lineYs = [];
    for (const r of range.getClientRects()) {
      if (r.width < 1 || r.height < 1) continue;
      if (!lineYs.some(y => Math.abs(y - r.top) < 3)) lineYs.push(r.top);
    }
    cells.push({
      slotId,
      cellId,
      clientWidth: td.clientWidth,
      clientHeight: td.clientHeight,
      scrollHeight: td.scrollHeight,
      lineCount: Math.max(1, lineYs.length),
      paddingTop: parseFloat(tcs.paddingTop) || 0,
      paddingRight: parseFloat(tcs.paddingRight) || 0,
      paddingBottom: parseFloat(tcs.paddingBottom) || 0,
      paddingLeft: parseFloat(tcs.paddingLeft) || 0,
    });
  }
  return {
    sheetWidthPx: sRect.width,
    sheetHeightPx: sRect.height,
    contentScrollHeightPx: sheet.scrollHeight,
    overflowPx: Math.max(0, sheet.scrollHeight - sRect.height),
    background: cs.backgroundColor || '',
    cells,
  };
})()"""


def check_cdp_available(cdp_url: str = "http://127.0.0.1:9222", *, timeout_s: float = 0.4) -> bool:
    """Return True iff a Chrome/Edge DevTools JSON version endpoint responds."""
    url = cdp_url.rstrip("/") + "/json/version"
    try:
        with urllib.request.urlopen(url, timeout=timeout_s) as resp:
            data = json.loads(resp.read().decode("utf-8", errors="ignore"))
            return isinstance(data, dict) and ("Browser" in data or "webSocketDebuggerUrl" in data)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return False


def probe_vdoc_dom(
    page_number: int = 1,
    *,
    cdp_url: str = "http://127.0.0.1:9222",
    evaluator: Optional[Callable[[str], dict[str, Any]]] = None,
    overflow_tol_px: float = 2.0,
) -> Optional[MeasuredPageDOM]:
    """Run ``_PROBE_JS`` via an injected evaluator or active CDP websocket target."""
    raw: Optional[dict[str, Any]] = None
    if evaluator is not None:
        raw = evaluator(_PROBE_JS)
    else:
        if not check_cdp_available(cdp_url):
            return None
        try:
            with urllib.request.urlopen(cdp_url.rstrip("/") + "/json/list", timeout=1.0) as resp:
                targets = json.loads(resp.read().decode("utf-8", errors="ignore"))
        except Exception:
            return None
        page_target = next((t for t in targets if t.get("type") == "page" and t.get("webSocketDebuggerUrl")), None)
        if not page_target:
            return None
        # Optional websocket client if installed in environment
        try:
            import websocket  # type: ignore[import-not-found]
        except ImportError:
            return None
        ws = websocket.create_connection(page_target["webSocketDebuggerUrl"], timeout=3.0)
        try:
            ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate", "params": {"expression": _PROBE_JS, "returnByValue": True}}))
            msg = json.loads(ws.recv())
            raw = (((msg.get("result") or {}).get("result") or {}).get("value")) or {}
        finally:
            ws.close()

    if not raw or raw.get("error"):
        return None

    ov = float(raw.get("overflowPx") or 0.0)
    return MeasuredPageDOM(
        pageNumber=page_number,
        sheetWidthPx=float(raw.get("sheetWidthPx") or 794.0),
        sheetHeightPx=float(raw.get("sheetHeightPx") or 1123.0),
        contentScrollHeightPx=float(raw.get("contentScrollHeightPx") or 0.0),
        overflowPx=round(ov, 1),
        hasOverflow=ov > overflow_tol_px,
        background=str(raw.get("background") or ""),
        cells=[MeasuredCellDOM(**c) for c in (raw.get("cells") or [])],
        errors=list(raw.get("errors") or []),
    )

