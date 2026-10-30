#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
02_measure_browser_page.py
디버그 크롬(CDP)에 떠 있는 후보 페이지를 재서 measure.json 과 candidate.png 를 만든다.
판정은 하지 않는다. 판정은 03 이 한다.

재는 것 (단위 CSS px, 쪽 요소 왼쪽 위 원점):
  spans   truth.json 의 글자마다 DOM 에서 같은 글자열을 찾아 Range 사각형을 잰다.
          같은 글자열이 여러 군데 있으면 후보를 모두 모은 뒤, 정답 좌표에 가장 가까운 것끼리 짝짓는다 (L-08).
          계산된 font-size · font-family · color 와, 크롬이 실제로 그린 글꼴(CSS.getPlatformFontsForNode)도 기록한다.
  rules   테두리 · <hr> · 얇은 칠 요소 (실제로 그려진 두께, 크롬은 테두리 두께를 정수 px 로 내린다, L-10)
  images  img · svg · canvas
  calibration (--calibrate) 글자 크기마다 "글자 상자 위쪽 - 줄 상자 위쪽" 오프셋 (생성기 보정값, L-05)

화면을 바꾸는 동작은 없다. 마우스를 구석으로 옮기고 포커스를 풀어 편집 도구 모양만 숨긴다.
--reload 는 편집 중인 문서에서 쓰지 말 것 (떠나기 확인 창이 뜨면 탭이 멈춘다).

사용법:
  python 02_measure_browser_page.py --truth work/fidelity/truth.json --out-dir work/fidelity \\
      --target-url-contains localhost:5180 --page-selector "main section > div.bg-white" --page-text "SEO MINGYU"
"""

import argparse
import base64
import itertools
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fidelity_core as core  # noqa: E402


class CDP:
    def __init__(self, ws_url):
        websocket = core.need("websocket", "websocket-client")
        self.ws = websocket.create_connection(ws_url, suppress_origin=True, max_size=None)
        self.ids = itertools.count(1)

    def call(self, method, timeout=60, **params):
        i = next(self.ids)
        self.ws.send(json.dumps({"id": i, "method": method, "params": params}))
        self.ws.settimeout(timeout)
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == i:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    def ev(self, expr, await_promise=False, by_value=True):
        res = self.call("Runtime.evaluate", expression=expr, returnByValue=by_value, awaitPromise=await_promise)
        if "exceptionDetails" in res:
            raise RuntimeError(json.dumps(res["exceptionDetails"], ensure_ascii=False)[:800])
        return res["result"].get("value") if by_value else res["result"]


def pick_target(endpoint, needle):
    targets = json.loads(urllib.request.urlopen(endpoint.rstrip("/") + "/json").read())
    pages = [t for t in targets if t.get("type") == "page" and (not needle or needle in t.get("url", ""))]
    if not pages:
        print(f"[ERROR] '{needle}' 를 포함한 탭이 없습니다. 열린 탭:", file=sys.stderr)
        for t in targets:
            if t.get("type") == "page":
                print(f"   - {t.get('url')}", file=sys.stderr)
        sys.exit(2)
    if len(pages) > 1:
        print(f"[WARN] 조건에 맞는 탭 {len(pages)}개 → 첫 번째 사용: {pages[0]['url']}")
    return pages[0]


PAGE_JS = r"""
window.__vfPage = (() => {
  const sel = %(sel)s, text = %(text)s;
  const all = [...document.querySelectorAll(sel)];
  const hits = text ? all.filter(e => e.innerText.includes(text)) : all;
  return hits.length ? hits[hits.length - 1] : null;
})();
"""

MEASURE_JS = r"""
((targets) => {
  const page = window.__vfPage, pr = page.getBoundingClientRect();
  const rel = (r) => ({x: r.left - pr.left, y: r.top - pr.top, x1: r.right - pr.left, y1: r.bottom - pr.top});
  // 글자 노드를 "가장 가까운 블록 조상" 단위로 묶어 하나의 문자열로 만든다.
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
  // 투명한 편집 도구 모양(손잡이 · 버튼)과 data-fidelity-ignore 표시 요소는 그림에 없으므로 뺀다.
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
    .filter(i => i.x1 - i.x > 24 && i.y1 - i.y > 24);   // 아이콘 크기 이하는 편집 도구 모양으로 본다
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
      id: bid,
      x: +(o.x.toFixed(2)),
      y: +(o.y.toFixed(2)),
      x1: +(o.x1.toFixed(2)),
      y1: +(o.y1.toFixed(2)),
      w: +(r.width.toFixed(2)),
      h: +(r.height.toFixed(2))
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


def match_nearest(truth_spans, cand_lists):
    """같은 글자열 후보 중 정답 좌표에 가장 가까운 것을 전역 탐욕법으로 짝짓는다 (후보 하나는 한 번만)."""
    pairs = []
    for ti, (t, cands) in enumerate(zip(truth_spans, cand_lists)):
        for ci, c in enumerate(cands):
            pairs.append((abs(c["x"] - t["x"]) + abs(c["y"] - t["y"]), ti, ci))
    pairs.sort()
    chosen, used = {}, set()
    for _, ti, ci in pairs:
        key = (round(cand_lists[ti][ci]["x"]), round(cand_lists[ti][ci]["y"]))
        if ti in chosen or key in used:
            continue
        chosen[ti] = cand_lists[ti][ci]
        used.add(key)
    return [chosen.get(i) for i in range(len(truth_spans))]


def platform_fonts(cdp, probes):
    """CSS.getPlatformFontsForNode — 계산된 font-family 가 아니라 크롬이 실제로 그린 글꼴."""
    out = {}
    try:
        cdp.call("DOM.enable")
        cdp.call("CSS.enable")
        cdp.call("DOM.getDocument", depth=0)
        for p in sorted(probes):
            obj = cdp.ev(f"window.__vfProbe[{p}]", by_value=False)
            node = cdp.call("DOM.requestNode", objectId=obj["objectId"])["nodeId"]
            fonts = cdp.call("CSS.getPlatformFontsForNode", nodeId=node).get("fonts", [])
            out[p] = [{"family": f["familyName"], "postscript": f.get("postScriptName", ""),
                       "glyphs": f["glyphCount"], "custom": f.get("isCustomFont", False)} for f in fonts]
    except RuntimeError as exc:
        print(f"[WARN] 실제 글꼴 확인 실패: {exc}")
    finally:
        try:
            cdp.call("CSS.disable")
            cdp.call("DOM.disable")
        except RuntimeError:
            pass
    return out


def main():
    ap = argparse.ArgumentParser(description="CDP 로 후보 페이지를 재서 measure.json · candidate.png 생성")
    ap.add_argument("--truth", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--cdp", default="http://127.0.0.1:9222")
    ap.add_argument("--target-url-contains", default="", help="탭 URL 에 들어 있는 문자열")
    ap.add_argument("--page-selector", default="body", help="쪽(종이) 요소 CSS 선택자")
    ap.add_argument("--page-text", default="", help="여러 쪽 중 이 글자를 포함한 쪽을 고른다")
    ap.add_argument("--viewport", default="1920x1400", help="재는 동안 쓸 창 크기 (확대율 1)")
    ap.add_argument("--reload", action="store_true", help="재기 전에 새로고침 (편집 중인 문서에는 쓰지 말 것)")
    ap.add_argument("--calibrate", action="store_true", help="글자 크기별 상자 오프셋도 잰다")
    ap.add_argument("--settle", type=float, default=0.8, help="스크롤 후 기다릴 초")
    ap.add_argument("--hide-selector", action="append", default=["[data-fidelity-ignore]"],
                    help="잴 때 숨길 편집 도구 모양 CSS 선택자 (여러 번 지정 가능)")
    args = ap.parse_args()

    with open(args.truth, encoding="utf-8") as f:
        truth = json.load(f)
    os.makedirs(args.out_dir, exist_ok=True)
    target = pick_target(args.cdp, args.target_url_contains)
    cdp = CDP(target["webSocketDebuggerUrl"])
    cdp.call("Page.enable")
    cdp.call("Page.bringToFront")
    cdp.call("Runtime.enable")

    vw, vh = (int(v) for v in args.viewport.lower().split("x"))
    cdp.call("Emulation.setDeviceMetricsOverride", width=vw, height=vh, deviceScaleFactor=1, mobile=False)
    try:
        if args.reload:
            cdp.call("Page.reload")
            time.sleep(4)
        cdp.ev("document.fonts.ready.then(() => 1)", await_promise=True)
        found = cdp.ev(PAGE_JS % {"sel": json.dumps(args.page_selector), "text": json.dumps(args.page_text)} + "!!window.__vfPage")
        if not found:
            print(f"[ERROR] 쪽 요소 없음: selector={args.page_selector!r} text={args.page_text!r}", file=sys.stderr)
            sys.exit(2)
        # 편집 도구 모양(포커스 윤곽 · 손잡이 · 버튼)이 사진에 들어가지 않게 한다.
        # <head> 에 임시 style 만 넣는다 — 에디터 DOM 은 건드리지 않는다.
        hide_css = ", ".join(args.hide_selector) + " { visibility: hidden !important; }"
        cdp.ev(f"(() => {{ const s = document.createElement('style'); s.id = '__vf_hide'; s.textContent = {json.dumps(hide_css)};"
               " document.head.appendChild(s); })()")
        cdp.ev("document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.getSelection().removeAllRanges()")
        cdp.ev("window.__vfPage.scrollIntoView({block: 'start'})")
        cdp.call("Input.dispatchMouseEvent", type="mouseMoved", x=vw - 2, y=vh - 2)
        time.sleep(args.settle)

        rect = cdp.ev("(() => { const r = window.__vfPage.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        pw, ph = truth["page"]["width"], truth["page"]["height"]
        if abs(rect[2] - pw) > 1 or abs(rect[3] - ph) > 1:
            print(f"[WARN] 쪽 크기 불일치: 후보 {rect[2]:.1f}×{rect[3]:.1f} vs 원본 {pw}×{ph} (테두리가 크기를 바꾸는지 확인, L-13)")
        shot = cdp.call("Page.captureScreenshot", format="png",
                        clip={"x": rect[0], "y": rect[1], "width": pw, "height": ph, "scale": 1})
        with open(os.path.join(args.out_dir, "candidate.png"), "wb") as f:
            f.write(base64.b64decode(shot["data"]))

        texts = [s["text"] for s in truth["spans"]]
        data = cdp.ev(MEASURE_JS % {"targets": json.dumps(texts, ensure_ascii=False)})
        matched = match_nearest(truth["spans"], data["spans"])
        used_probes = {m["probe"] for m in matched if m}
        rendered = platform_fonts(cdp, used_probes)
        for m in matched:
            if m:
                m["rendered_fonts"] = rendered.get(m.pop("probe"), [])
        calibration = cdp.ev(CALIBRATE_JS) if args.calibrate else None
        chrome = cdp.ev(VISIBLE_CHROME_JS)
        cdp.ev("delete window.__vfProbe; delete window.__vfPage")
    finally:
        try:
            cdp.ev("document.getElementById('__vf_hide')?.remove()")
        finally:
            cdp.call("Emulation.clearDeviceMetricsOverride")

    measure = {
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
    out = os.path.join(args.out_dir, "measure.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(measure, f, ensure_ascii=False, indent=1)

    missing = sum(1 for m in matched if m is None)
    print(f"[OK] {out}")
    print(f"  쪽 {rect[2]:.1f}×{rect[3]:.1f}px @({rect[0]:.1f},{rect[1]:.1f}) | 글자 {len(matched) - missing}/{len(matched)} 찾음"
          f" | 선 {len(data['rules'])} | 그림 {len(data['images'])}")
    print(f"  불러온 웹 글꼴: {', '.join(sorted(set(data['fonts']))) or '(없음)'}")
    if chrome:
        print(f"  [WARN] 사진에 찍힌 편집 도구 모양 {len(chrome)}개: {', '.join(c['desc'] for c in chrome[:5])}"
              " → --hide-selector 로 숨기세요")
    if calibration:
        for size, rows in sorted(calibration.items(), key=lambda kv: float(kv[0][:-2])):
            offs = sorted({row["rect_minus_box_top"] for row in rows})
            print(f"  calibrate {size}: 글자상자-줄상자 위쪽 = {offs}")
    print("  판정은 03_verify_fidelity.py 로 하세요.")


if __name__ == "__main__":
    main()
