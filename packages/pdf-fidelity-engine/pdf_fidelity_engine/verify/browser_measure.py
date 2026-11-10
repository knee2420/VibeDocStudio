"""디버그 크롬(CDP) DOM Range · 선분 · 스크린샷 측정."""
from __future__ import annotations

import base64
import importlib
import itertools
import json
import os
import time
import urllib.request
from typing import Any, Optional


class CDP:
    def __init__(self, ws_url: str) -> None:
        try:
            websocket = importlib.import_module("websocket")
        except ImportError as exc:
            raise RuntimeError("websocket-client 가 필요합니다: pip install pdf-fidelity-engine[verify]") from exc
        self.ws = websocket.create_connection(ws_url, suppress_origin=True, max_size=None)
        self.ids = itertools.count(1)

    def call(self, method: str, timeout: int = 60, **params: Any) -> dict[str, Any]:
        i = next(self.ids)
        self.ws.send(json.dumps({"id": i, "method": method, "params": params}))
        self.ws.settimeout(timeout)
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == i:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    def ev(self, expr: str, await_promise: bool = False, by_value: bool = True) -> Any:
        res = self.call("Runtime.evaluate", expression=expr, returnByValue=by_value, awaitPromise=await_promise)
        if "exceptionDetails" in res:
            raise RuntimeError(json.dumps(res["exceptionDetails"], ensure_ascii=False)[:800])
        return res["result"].get("value") if by_value else res["result"]


def pick_target(endpoint: str, needle: str) -> dict[str, Any]:
    targets = json.loads(urllib.request.urlopen(endpoint.rstrip("/") + "/json").read())
    pages = [t for t in targets if t.get("type") == "page" and (not needle or needle in t.get("url", ""))]
    if not pages:
        raise RuntimeError(f"'{needle}' 를 포함한 CDP 탭이 없습니다.")
    return pages[0]


PAGE_JS = r"""
window.__vfPage = (() => {
  const sel = %(sel)s, text = %(text)s;
  const all = [...document.querySelectorAll(sel)];
  const hits = text ? all.filter(e => e.innerText.replace(/ /g, ' ').includes(text)) : all;
  return hits.length ? hits[hits.length - 1] : null;
})();
"""

MEASURE_JS = r"""
((targets) => {
  const page = window.__vfPage, pr = page.getBoundingClientRect();
  const rel = (r) => ({x: r.left - pr.left, y: r.top - pr.top, x1: r.right - pr.left, y1: r.bottom - pr.top});
  const blockOf = (n) => { let e = n.parentElement;
    while (e && e !== page && getComputedStyle(e).display.startsWith('inline')) e = e.parentElement; return e || page; };
  const groups = new Map();
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    if (!n.textContent) continue;
    const st = getComputedStyle(n.parentElement);
    if (st.visibility === 'hidden' || st.display === 'none') continue;
    const b = blockOf(n); if (!groups.has(b)) groups.set(b, []); groups.get(b).push(n);
  }
  const blocks = [...groups.values()].map(nodes => { let acc = 0;
    const parts = nodes.map(n => { const p = [n, acc]; acc += n.textContent.length; return p; });
    return {parts, full: nodes.map(n => n.textContent).join('').replace(/ /g, ' ')}; });
  const at = (parts, k) => { for (let j = parts.length - 1; j >= 0; j--) if (k >= parts[j][1]) return [parts[j][0], k - parts[j][1]]; };
  window.__vfProbe = [];
  const spans = targets.map(t => { const cands = [];
    for (const b of blocks) for (let i = b.full.indexOf(t); i >= 0; i = b.full.indexOf(t, i + 1)) {
      const [sn, so] = at(b.parts, i), [en, eo] = at(b.parts, i + t.length - 1);
      const rg = document.createRange(); rg.setStart(sn, so); rg.setEnd(en, eo + 1);
      const rects = [...rg.getClientRects()].filter(r => r.width > 0 && r.height > 0); if (!rects.length) continue;
      const el = sn.parentElement, s = getComputedStyle(el);
      window.__vfProbe.push(el);
      cands.push({x: Math.min(...rects.map(r => r.left)) - pr.left, y: Math.min(...rects.map(r => r.top)) - pr.top,
        x1: Math.max(...rects.map(r => r.right)) - pr.left, y1: Math.max(...rects.map(r => r.bottom)) - pr.top,
        lines: (() => { const ts = rects.map(r => r.top).sort((a,b)=>a-b); let c=0, l=-999; for(const t of ts){ if(t-l > 4.0){ c++; l=t; } } return c; })(), font_size: s.fontSize, font_family: s.fontFamily,
        font_weight: s.fontWeight, color: s.color, letter_spacing: s.letterSpacing, kerning: s.fontKerning,
        underline: (() => { for (let a = el; a && a !== page; a = a.parentElement)
          if (getComputedStyle(a).textDecorationLine.includes('underline')) return true; return false; })(),
        probe: window.__vfProbe.length - 1});
    }
    return cands; });
  const invisible = (e) => { if (e.closest('[data-fidelity-ignore], button, input, select, textarea')) return true;
    for (let a = e; a && a !== page.parentElement; a = a.parentElement) if (parseFloat(getComputedStyle(a).opacity) === 0) return true;
    return false; };
  const rules = [];
  for (const e of page.querySelectorAll('*')) {
    const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || invisible(e)) continue;
    const r = e.getBoundingClientRect(); if (!r.width && !r.height) continue;
    const o = rel(r);
    for (const side of ['Top', 'Bottom', 'Left', 'Right']) {
      const w = parseFloat(s['border' + side + 'Width']), st = s['border' + side + 'Style'];
      if (!(w > 0) || st === 'none' || st === 'hidden') continue;
      const c = s['border' + side + 'Color'];
      if (side === 'Top') rules.push({x: o.x, y: o.y, x1: o.x1, y1: o.y + w, thickness: w, orient: 'h', color: c});
      if (side === 'Bottom') rules.push({x: o.x, y: o.y1 - w, x1: o.x1, y1: o.y1, thickness: w, orient: 'h', color: c});
      if (side === 'Left') rules.push({x: o.x, y: o.y, x1: o.x + w, y1: o.y1, thickness: w, orient: 'v', color: c});
      if (side === 'Right') rules.push({x: o.x1 - w, y: o.y, x1: o.x1, y1: o.y1, thickness: w, orient: 'v', color: c});
    }
    const bg = s.backgroundColor, thin = Math.min(r.width, r.height);
    if (thin > 0 && thin <= 6 && bg && !/rgba\(.*,\s*0\)$/.test(bg) && bg !== 'transparent' && !e.children.length)
      rules.push({...o, thickness: thin, orient: r.width >= r.height ? 'h' : 'v', color: bg});
  }
  const images = [...page.querySelectorAll('img, svg, canvas')]
    .filter(e => (!e.parentElement.closest('svg')) && !invisible(e))
    .map(e => ({...rel(e.getBoundingClientRect()), tag: e.tagName.toLowerCase()}))
    .filter(i => i.x1 - i.x > 24 && i.y1 - i.y > 24);
  const fonts = [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight} ${f.style}`);
  const blockElements = [...page.querySelectorAll('[data-block-id]')];
  const measuredBlocks = [];
  const seenBlockIds = new Set();
  for (const el of blockElements) {
    const bid = el.getAttribute('data-block-id');
    if (!bid || seenBlockIds.has(bid)) continue;
    seenBlockIds.add(bid);
    const r = el.getBoundingClientRect();
    const o = rel(r);
    measuredBlocks.push({
      id: bid, x: +(o.x.toFixed(2)), y: +(o.y.toFixed(2)),
      x1: +(o.x1.toFixed(2)), y1: +(o.y1.toFixed(2)),
      w: +(r.width.toFixed(2)), h: +(r.height.toFixed(2))
    });
  }
  return {spans, rules, images, fonts, blocks: measuredBlocks};
})(%(targets)s)
"""

VISIBLE_CHROME_JS = r"""
(() => { const page = window.__vfPage, pr = page.getBoundingClientRect(), out = [];
  for (const e of page.querySelectorAll('button, input, select, textarea, [role=button], [contenteditable=false] svg')) {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    let shown = true; for (let a = e; a && a !== page.parentElement; a = a.parentElement) {
      const s = getComputedStyle(a); if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) === 0) { shown = false; break; } }
    if (shown) out.push({desc: `${e.tagName.toLowerCase()}${e.getAttribute('aria-label') ? '[' + e.getAttribute('aria-label') + ']' : ''}`,
      x: r.left - pr.left, y: r.top - pr.top, x1: r.right - pr.left, y1: r.bottom - pr.top});
  }
  return out; })()
"""

CALIBRATE_JS = r"""
(() => { const page = window.__vfPage, out = {};
  for (const e of page.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, th, div')) {
    if (!e.innerText || !e.innerText.trim() || e.querySelector('p, li, div, td, th')) continue;
    const box = e.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(e);
    const first = [...rg.getClientRects()].find(r => r.width > 0); if (!first) continue;
    const s = getComputedStyle(e);
    (out[s.fontSize] = out[s.fontSize] || []).push({rect_minus_box_top: +(first.top - box.top).toFixed(3),
      line_height: s.lineHeight, box_height: +box.height.toFixed(3)});
  }
  return out; })()
"""


def match_nearest(truth_spans: list[dict[str, Any]], cand_lists: list[list[dict[str, Any]]]) -> list[Optional[dict[str, Any]]]:
    pairs = []
    for ti, (t, cands) in enumerate(zip(truth_spans, cand_lists)):
        for ci, c in enumerate(cands):
            pairs.append((abs(c["x"] - t["x"]) + abs(c["y"] - t["y"]), ti, ci))
    pairs.sort()
    chosen: dict[int, dict[str, Any]] = {}
    used: set[tuple[int, int]] = set()
    for _, ti, ci in pairs:
        key = (round(cand_lists[ti][ci]["x"]), round(cand_lists[ti][ci]["y"]))
        if ti in chosen or key in used:
            continue
        chosen[ti] = cand_lists[ti][ci]
        used.add(key)
    return [chosen.get(i) for i in range(len(truth_spans))]


def platform_fonts(cdp: CDP, probes: set[int]) -> dict[int, list[dict[str, Any]]]:
    out: dict[int, list[dict[str, Any]]] = {}
    try:
        cdp.call("DOM.enable")
        cdp.call("CSS.enable")
        cdp.call("DOM.getDocument", depth=0)
        for p in sorted(probes):
            obj = cdp.ev(f"window.__vfProbe[{p}]", by_value=False)
            node = cdp.call("DOM.requestNode", objectId=obj["objectId"])["nodeId"]
            fonts = cdp.call("CSS.getPlatformFontsForNode", nodeId=node).get("fonts", [])
            out[p] = [
                {
                    "family": f["familyName"],
                    "postscript": f.get("postScriptName", ""),
                    "glyphs": f["glyphCount"],
                    "custom": f.get("isCustomFont", False),
                }
                for f in fonts
            ]
    except RuntimeError:
        pass
    finally:
        try:
            cdp.call("CSS.disable")
            cdp.call("DOM.disable")
        except RuntimeError:
            pass
    return out


def measure_browser_page(
    *,
    truth: dict[str, Any],
    out_dir: str,
    cdp_endpoint: str = "http://127.0.0.1:9222",
    target_url_contains: str = "",
    page_selector: str = "body",
    page_text: str = "",
    viewport: str = "1920x1400",
    reload_page: bool = False,
    calibrate: bool = False,
    settle: float = 0.8,
    hide_selectors: Optional[list[str]] = None,
) -> dict[str, Any]:
    os.makedirs(out_dir, exist_ok=True)
    target = pick_target(cdp_endpoint, target_url_contains)
    cdp = CDP(target["webSocketDebuggerUrl"])
    cdp.call("Page.enable")
    cdp.call("Page.bringToFront")
    cdp.call("Runtime.enable")

    vw, vh = (int(v) for v in viewport.lower().split("x"))
    cdp.call("Emulation.setDeviceMetricsOverride", width=vw, height=vh, deviceScaleFactor=1, mobile=False)
    hides = hide_selectors or ["[data-fidelity-ignore]"]
    try:
        if reload_page:
            cdp.call("Page.reload")
            time.sleep(4)
        cdp.ev("document.fonts.ready.then(() => 1)", await_promise=True)
        found = cdp.ev(PAGE_JS % {"sel": json.dumps(page_selector), "text": json.dumps(page_text)} + "!!window.__vfPage")
        if not found:
            raise RuntimeError(f"쪽 요소 없음: selector={page_selector!r} text={page_text!r}")
        hide_css = ", ".join(hides) + " { visibility: hidden !important; }"
        cdp.ev(
            f"(() => {{ const s = document.createElement('style'); s.id = '__vf_hide'; "
            f"s.textContent = {json.dumps(hide_css)}; document.head.appendChild(s); }})()"
        )
        cdp.ev("document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.getSelection().removeAllRanges()")
        cdp.ev("window.__vfPage.scrollIntoView({block: 'start'})")
        cdp.call("Input.dispatchMouseEvent", type="mouseMoved", x=vw - 2, y=vh - 2)
        time.sleep(settle)

        rect = cdp.ev("(() => { const r = window.__vfPage.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        pw, ph = truth["page"]["width"], truth["page"]["height"]
        shot = cdp.call("Page.captureScreenshot", format="png", clip={"x": rect[0], "y": rect[1], "width": pw, "height": ph, "scale": 1})
        with open(os.path.join(out_dir, "candidate.png"), "wb") as f:
            f.write(base64.b64decode(shot["data"]))

        texts = [s["text"] for s in truth["spans"]]
        data = cdp.ev(MEASURE_JS % {"targets": json.dumps(texts, ensure_ascii=False)})
        matched = match_nearest(truth["spans"], data["spans"])
        used_probes = {m["probe"] for m in matched if m}
        rendered = platform_fonts(cdp, used_probes)
        for m in matched:
            if m:
                m["rendered_fonts"] = rendered.get(m.pop("probe"), [])
        calibration = cdp.ev(CALIBRATE_JS) if calibrate else None
        chrome = cdp.ev(VISIBLE_CHROME_JS)
        cdp.ev("delete window.__vfProbe; delete window.__vfPage")
    finally:
        try:
            cdp.ev("document.getElementById('__vf_hide')?.remove()")
        finally:
            cdp.call("Emulation.clearDeviceMetricsOverride")

    measure: dict[str, Any] = {
        "target_url": target["url"],
        "page_rect": rect,
        "candidate_png": "candidate.png",
        "spans": matched,
        "candidates_per_span": [len(c) for c in data["spans"]],
        "rules": data["rules"],
        "images": data["images"],
        "blocks": data.get("blocks", []),
        "loaded_fonts": data["fonts"],
        "visible_chrome": chrome,
    }
    if calibration is not None:
        measure["calibration"] = calibration
    return measure

