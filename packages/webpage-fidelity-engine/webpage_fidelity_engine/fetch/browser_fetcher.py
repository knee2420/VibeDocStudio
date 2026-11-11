"""선택적 브라우저(CDP) DOM 및 레이아웃 실측 어댑터 (`CdpBrowserDomFetcher`).

실행 중인 디버그 크롬(CDP `9222`)에 우선 연결하고, 열려 있지 않으면 OS 에 설치된 Chrome/Edge 를
일회성 headless 로 잠시 띄워 `getBoundingClientRect` · `getComputedStyle` 스냅샷을 수집한 뒤 종료한다.
브라우저 연결·기동이 불가능할 때는 `None` 을 반환해 상위 파이프라인이 정적 HTML 휴리스틱으로 폴백하게 한다.
"""
from __future__ import annotations

import base64
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

from ..extract.css_normalizer import normalize_css_color, parse_css_length_px
from ..models import (
    BrowserElementGeometry,
    BrowserLayoutSnapshot,
    BrowserScreenshotTile,
    MeasuredRect,
    TextInlineStyle,
    WebImage,
    WebLinkCard,
    WebTableCell,
)
from .http_fetcher import validate_public_http_url

_IS_WINDOWS = sys.platform == "win32"

# 공용 JS: 바깥 window · same-origin iframe(네이버 블로그 #mainFrame 등) · 내부 overflow 컨테이너 중
# 실제 스크롤 주체를 판별해 좌표를 이동/측정한다.
_SCROLL_HELPER_JS = r"""
  const _docHeight = (d) => Math.max(
    d && d.body ? d.body.scrollHeight : 0,
    d && d.documentElement ? d.documentElement.scrollHeight : 0
  );
  const _findScrollTarget = () => {
    let doc = document, win = window, targetIframe = null;
    const outerLen = ((document.body && document.body.innerText) || '').trim().length;
    const outerH = _docHeight(document);
    const outerMax = Math.max(0, outerH - (window.innerHeight || 0));
    if (outerLen < 160 || outerMax <= 40) {
      let bestScore = outerLen;
      for (const ifr of document.querySelectorAll('iframe')) {
        try {
          const idoc = ifr.contentDocument;
          if (!idoc || !idoc.body) continue;
          const flen = (idoc.body.innerText || '').trim().length;
          const iwin = idoc.defaultView || window;
          const ih = _docHeight(idoc);
          const ivh = ifr.clientHeight || iwin.innerHeight || 900;
          if (flen > 120 && (ih - ivh > outerMax + 80 || (outerLen < 160 && flen > bestScore + 200))) {
            bestScore = flen;
            doc = idoc;
            win = iwin;
            targetIframe = ifr;
          }
        } catch (_e) {}
      }
    }
    const innerH = _docHeight(doc);
    const innerVh = targetIframe ? (targetIframe.clientHeight || win.innerHeight || 900) : (win.innerHeight || 900);
    const innerMax = Math.max(0, innerH - innerVh);
    if (targetIframe && innerMax > 40) {
      return { mode: 'win', doc, win, el: null, totalHeight: innerH, vh: innerVh, sameDoc: false };
    }
    if (outerMax > 40) {
      return { mode: 'win', doc: document, win: window, el: null, totalHeight: outerH, vh: window.innerHeight || 900, sameDoc: true };
    }
    let bestEl = null, bestOverflow = 0;
    for (const cand of doc.querySelectorAll('main, article, [role="main"], #root, #app, div, section')) {
      try {
        const ch = cand.clientHeight || 0;
        const sh = cand.scrollHeight || 0;
        if (ch < 240 || sh - ch <= 80) continue;
        const ov = (win.getComputedStyle(cand).overflowY || '').toLowerCase();
        if ((ov === 'auto' || ov === 'scroll' || ov === 'overlay') && sh - ch > bestOverflow) {
          bestOverflow = sh - ch;
          bestEl = cand;
        }
      } catch (_e) {}
    }
    if (bestEl) {
      return { mode: 'el', doc, win, el: bestEl, totalHeight: bestEl.scrollHeight, vh: bestEl.clientHeight || innerVh, sameDoc: doc === document };
    }
    return { mode: 'win', doc, win, el: null, totalHeight: Math.max(outerH, innerH), vh: innerVh, sameDoc: doc === document };
  };
  const _scrollTargetTo = (st, y) => {
    const ty = Math.max(0, Number(y) || 0);
    if (st.mode === 'el' && st.el) {
      try { st.el.scrollTo({ top: ty, left: 0, behavior: 'instant' }); } catch (_e) {}
      st.el.scrollTop = ty;
    } else {
      try { st.win.scrollTo({ top: ty, left: 0, behavior: 'instant' }); } catch (_e) { st.win.scrollTo(0, ty); }
      if (st.doc && st.doc.documentElement && Math.abs((st.win.scrollY || 0) - ty) > 2) {
        try { st.doc.documentElement.scrollTop = ty; } catch (_e) {}
      }
      if (st.doc && st.doc.body && Math.abs((st.win.scrollY || 0) - ty) > 2) {
        try { st.doc.body.scrollTop = ty; } catch (_e) {}
      }
    }
  };
  const _readScrollY = (st) => {
    if (st.mode === 'el' && st.el) return st.el.scrollTop || 0;
    const d = st.doc;
    return st.win.scrollY || (d && d.documentElement ? d.documentElement.scrollTop : 0) || (d && d.body ? d.body.scrollTop : 0) || 0;
  };
"""

# JS: 스크롤을 단계적으로 훑어 lazy 이미지를 깨운 뒤, 본문 루트를 격리하고
# 모든 가시 블록의 실측 bounding box 및 getComputedStyle 을 JSON 직렬화한다.
_MEASURE_ARTICLE_JS = r"""
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => (s || '').replace(/[\u200B\uFEFF\u00A0]/g, ' ').replace(/\s+/g, ' ').trim();
  const escAttr = (s) => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
__SCROLL_HELPER__
  const scrollTarget = _findScrollTarget();
  const doc = scrollTarget.doc;
  const win = scrollTarget.win;

  // 2. lazy-load 이미지 활성화를 위해 전체 높이를 구간 스크롤 후 복귀 (최대 ~1.3초)
  try {
    const totalH = scrollTarget.totalHeight;
    const vh = Math.max(400, scrollTarget.vh || 900);
    const step = Math.max(500, Math.floor(vh * 0.85));
    const maxSteps = 18;
    const stride = totalH > step * maxSteps ? Math.ceil(totalH / maxSteps) : step;
    for (let y = 0; y <= totalH; y += stride) {
      _scrollTargetTo(scrollTarget, y);
      await sleep(60);
    }
    _scrollTargetTo(scrollTarget, 0);
    await sleep(120);
  } catch (_e) {}

  // 대기 중인 visible 이미지 최대 ~1.2s 로딩 대기
  try {
    const pending = [...doc.querySelectorAll('img')].filter((im) => !im.complete && (im.getAttribute('src') || im.dataset?.lazySrc || im.dataset?.src));
    if (pending.length) {
      await Promise.race([
        Promise.all(pending.slice(0, 24).map((im) => new Promise((res) => {
          if (im.complete) return res();
          im.addEventListener('load', res, { once: true });
          im.addEventListener('error', res, { once: true });
        }))),
        sleep(1200),
      ]);
    }
  } catch (_e) {}

  const scrollX = win.scrollX || 0;
  const scrollY = _readScrollY(scrollTarget);
  const absRect = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: +(r.left + scrollX).toFixed(1),
      y: +(r.top + scrollY).toFixed(1),
      width: +r.width.toFixed(1),
      height: +r.height.toFixed(1),
    };
  };

  const NOISE_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','SVG','NAV','HEADER','FOOTER','ASIDE','FORM','IFRAME','BUTTON','DIALOG','SELECT','TEXTAREA','TEMPLATE']);
  const NOISE_ROLES = new Set(['navigation','banner','contentinfo','complementary','search','menu','menubar','dialog']);
  const NOISE_RE = /(?:^|[-_])(nav|navbar|gnb|lnb|snb|menu|sidebar|side-bar|aside|footer|header|ad|ads|adsense|advert|banner|sponsor|promo|popup|modal|cookie|consent|comment|comments|reply|replies|share|sns|social|like|bookmark|related|recommend|popular|ranking|trending|more-news|paging|pagination|breadcrumb|tts|floating)(?:$|[-_])/i;

  const isVisible = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 || r.height >= 1;
  };

  const classStrOf = (el) => (typeof el.className === 'string' ? el.className : (el.getAttribute('class') || ''));

  const isNoise = (el) => {
    if (!el || el.nodeType !== 1) return true;
    const tag = el.tagName;
    if (NOISE_TAGS.has(tag)) return true;
    if ((el.getAttribute('aria-hidden') || '').toLowerCase() === 'true') return true;
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (NOISE_ROLES.has(role)) return true;
    if (tag === 'ARTICLE' || tag === 'MAIN' || role === 'main' || (el.getAttribute('itemprop') || '').toLowerCase() === 'articlebody') {
      return false;
    }
    try {
      const cs = win.getComputedStyle(el);
      if (cs.position === 'fixed') return true;
    } catch (_e) {}
    const id = el.id || '';
    if (id && NOISE_RE.test(id)) return true;
    const cls = classStrOf(el);
    if (cls && cls.split(/\s+/).some((c) => NOISE_RE.test(c))) return true;
    return false;
  };

  const isTransparentOrWhite = (c) => {
    if (!c) return true;
    const low = c.replace(/\s+/g, '').toLowerCase();
    if (low === 'transparent' || low === 'rgba(0,0,0,0)') return true;
    const m = low.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([0-9.]+))?\)$/);
    if (!m) return false;
    if (m[4] !== undefined && parseFloat(m[4]) <= 0.05) return true;
    const r = +m[1], g = +m[2], b = +m[3];
    return r >= 250 && g >= 250 && b >= 250;
  };

  const borderPx = (cs, side) => {
    const bs = cs['border' + side + 'Style'];
    if (!bs || bs === 'none' || bs === 'hidden') return 0;
    return parseFloat(cs['border' + side + 'Width']) || 0;
  };

  const lineCountOf = (el) => {
    try {
      const range = doc.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 1);
      if (!rects.length) return 1;
      const tops = rects.map((r) => r.top).sort((a, b) => a - b);
      let cnt = 0, last = -9999;
      for (const t of tops) {
        if (t - last > 4) { cnt++; last = t; }
      }
      return Math.max(1, cnt);
    } catch (_e) {
      return 1;
    }
  };

  // 3. 메타데이터 수집
  const metaMap = {};
  for (const m of doc.querySelectorAll('meta')) {
    const k = (m.getAttribute('property') || m.getAttribute('name') || '').trim().toLowerCase();
    const v = clean(m.getAttribute('content') || '');
    if (k && v && !metaMap[k]) metaMap[k] = v;
  }
  let h1Text = '';
  for (const h1 of doc.querySelectorAll('h1')) {
    if (!isNoise(h1) && isVisible(h1)) {
      const t = clean(h1.innerText || h1.textContent);
      if (t.length >= 4) { h1Text = t; break; }
    }
  }
  const title = metaMap['og:title'] || h1Text || clean(doc.title) || clean(document.title) || '';

  // 4. 사이트 비의존 본문 루트 격리
  const scoreRoot = (cand) => {
    if (!cand || isNoise(cand) || !isVisible(cand)) return -1;
    const rr = cand.getBoundingClientRect();
    if (rr.width < 200 || rr.height < 60) return -1;
    let totalTxt = 0, linkTxt = 0, pCount = 0, hCount = 0, imgCount = 0;
    const walkScore = (el, inA) => {
      if (el.nodeType === 3) {
        const l = clean(el.textContent).length;
        totalTxt += l;
        if (inA) linkTxt += l;
        return;
      }
      if (el.nodeType !== 1 || isNoise(el) || !isVisible(el)) return;
      const t = el.tagName;
      if (t === 'P') pCount++;
      else if (t === 'H1' || t === 'H2' || t === 'H3' || t === 'H4') hCount++;
      else if (t === 'IMG') {
        const ir = el.getBoundingClientRect();
        if (ir.width > 40 && ir.height > 40) imgCount++;
      }
      const nextA = inA || t === 'A';
      for (const ch of el.childNodes) walkScore(ch, nextA);
    };
    walkScore(cand, false);
    if (totalTxt < 50 && imgCount < 2) return -1;
    const nonLink = Math.max(0, totalTxt - linkTxt);
    const linkRatio = linkTxt / Math.max(1, totalTxt);
    const penalty = linkRatio > 0.65 ? 0.25 : 1.0;
    return (nonLink + pCount * 45 + hCount * 65 + imgCount * 40) * penalty;
  };

  let articleRoot = null;
  const semanticCands = [
    ...doc.querySelectorAll('[itemprop="articleBody"], [itemprop="articlebody"], article, main, [role="main"]'),
  ];
  let bestSemantic = null, bestSemanticScore = -1;
  for (const c of semanticCands) {
    const s = scoreRoot(c);
    if (s > bestSemanticScore) { bestSemanticScore = s; bestSemantic = c; }
  }
  const containerCands = doc.querySelectorAll('section, div');
  let bestBox = null, bestBoxScore = -1;
  for (const c of containerCands) {
    const s = scoreRoot(c);
    if (s > bestBoxScore || (bestBox && c.contains(bestBox) === false && bestBox.contains(c) && s >= bestBoxScore * 0.9)) {
      bestBoxScore = s;
      bestBox = c;
    }
  }
  if (bestSemantic && bestSemanticScore >= Math.max(120, bestBoxScore * 0.8)) {
    articleRoot = bestSemantic;
  } else if (bestBox && bestBoxScore > 0) {
    articleRoot = bestBox;
  } else {
    articleRoot = doc.body || doc.documentElement;
  }

  // root 내부에서 점수의 90% 이상을 유지하는 가장 타이트한 자식 컨테이너로 좁힘
  let tightened = articleRoot;
  const baseScore = scoreRoot(tightened);
  while (baseScore > 0 && tightened) {
    let nextChild = null;
    for (const ch of tightened.children) {
      if (isNoise(ch) || !isVisible(ch)) continue;
      const cs = scoreRoot(ch);
      if (cs >= baseScore * 0.88) { nextChild = ch; break; }
    }
    if (!nextChild) break;
    tightened = nextChild;
  }
  articleRoot = tightened || articleRoot;

  // 본문 기본 폰트 크기 중앙값 측정
  const bodySizes = [];
  for (const p of articleRoot.querySelectorAll('p, div, span, li')) {
    if (!isVisible(p) || isNoise(p)) continue;
    const t = clean(p.innerText || p.textContent);
    if (t.length >= 25 && p.children.length <= 4) {
      const fs = parseFloat(win.getComputedStyle(p).fontSize);
      if (fs >= 10 && fs <= 28) bodySizes.push(fs);
    }
  }
  bodySizes.sort((a, b) => a - b);
  const medianFontPx = bodySizes.length ? bodySizes[Math.floor(bodySizes.length / 2)] : 16.0;

  // 5. 이미지 URL 및 아이콘 판별
  const SKIP_IMG_RE = /(1x1|spacer|blank|pixel|loading|spinner|transparent)\.gif/i;
  const ICON_RE = /(icon|avatar|profile|emoji|badge|favicon|logo)/i;
  const pickImgSrc = (img) => {
    const cands = [
      img.getAttribute('data-lazy-src'),
      img.getAttribute('data-original'),
      img.getAttribute('data-src'),
      img.getAttribute('data-url'),
      img.getAttribute('data-image-src'),
      img.currentSrc,
      img.getAttribute('src'),
    ];
    for (const raw0 of cands) {
      const raw = (raw0 || '').trim();
      if (!raw || raw.startsWith('data:image/svg+xml') || SKIP_IMG_RE.test(raw)) continue;
      try {
        return new URL(raw, doc.baseURI || win.location.href).href;
      } catch (_e) {
        return raw;
      }
    }
    return '';
  };

  const isTinyIcon = (img, src, rect) => {
    if ((rect.width > 0 && rect.width <= 32) && (rect.height > 0 && rect.height <= 32)) return true;
    const nw = img.naturalWidth || parseInt(img.getAttribute('width') || '0', 10) || 0;
    const nh = img.naturalHeight || parseInt(img.getAttribute('height') || '0', 10) || 0;
    if (nw > 0 && nh > 0 && nw <= 32 && nh <= 32) return true;
    const cls = classStrOf(img);
    if (cls && ICON_RE.test(cls) && rect.width < 96) return true;
    const leafName = (src.split('/').pop() || '').split('?')[0];
    if (ICON_RE.test(leafName) && !(img.getAttribute('alt') || '').toLowerCase().includes('logo') && rect.width < 96) return true;
    return false;
  };

  // 6. 인라인 HTML 직렬화 (Tiptap 호환 + computed style 색상/배경/굵기 보존)
  const renderInlineHtml = (rootEl, parentFontSize, parentColor) => {
    const htmlParts = [];
    const textParts = [];
    const walkIn = (cur) => {
      if (cur.nodeType === 3) {
        const txt = (cur.textContent || '').replace(/[\u200B\uFEFF\u00A0]/g, ' ');
        if (txt) {
          htmlParts.push(escHtml(txt));
          textParts.push(txt);
        }
        return;
      }
      if (cur.nodeType !== 1 || isNoise(cur) || cur.tagName === 'IMG') return;
      const tag = cur.tagName;
      if (tag === 'BR') { htmlParts.push('<br/>'); textParts.push(' '); return; }
      const cs = win.getComputedStyle(cur);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;

      const idx0 = htmlParts.length;
      for (const ch of cur.childNodes) walkIn(ch);
      if (htmlParts.length === idx0) return;

      const fw = cs.fontWeight;
      const isBold = tag === 'STRONG' || tag === 'B' || fw === 'bold' || parseInt(fw, 10) >= 600;
      const isItalic = tag === 'EM' || tag === 'I' || cs.fontStyle === 'italic';
      const td = cs.textDecorationLine || '';
      const isUnder = tag === 'U' || td.includes('underline');
      const isStrike = tag === 'S' || tag === 'DEL' || tag === 'STRIKE' || td.includes('line-through');

      if (tag === 'CODE') {
        htmlParts.splice(idx0, 0, '<code>');
        htmlParts.push('</code>');
      } else if (tag === 'MARK') {
        htmlParts.splice(idx0, 0, '<mark>');
        htmlParts.push('</mark>');
      } else if (tag === 'A') {
        let href = (cur.getAttribute('href') || '').trim();
        if (href && !href.startsWith('#') && !/^(javascript|data|vbscript):/i.test(href)) {
          try { href = new URL(href, doc.baseURI || win.location.href).href; } catch (_e) {}
          htmlParts.splice(idx0, 0, `<a href="${escAttr(href)}">`);
          htmlParts.push('</a>');
        }
      } else if (tag === 'SPAN') {
        const styles = [];
        if (cs.color && cs.color !== parentColor) styles.push(`color: ${cs.color}`);
        if (cs.backgroundColor && !isTransparentOrWhite(cs.backgroundColor)) styles.push(`background-color: ${cs.backgroundColor}`);
        if (styles.length) {
          htmlParts.splice(idx0, 0, `<span style="${escAttr(styles.join('; '))}">`);
          htmlParts.push('</span>');
        }
      }

      if (isUnder) { htmlParts.splice(idx0, 0, '<u>'); htmlParts.push('</u>'); }
      if (isStrike) { htmlParts.splice(idx0, 0, '<s>'); htmlParts.push('</s>'); }
      if (isItalic && tag !== 'BLOCKQUOTE') { htmlParts.splice(idx0, 0, '<em>'); htmlParts.push('</em>'); }
      if (isBold && tag !== 'H1' && tag !== 'H2' && tag !== 'H3' && tag !== 'H4') {
        htmlParts.splice(idx0, 0, '<strong>');
        htmlParts.push('</strong>');
      }
    };
    for (const ch of rootEl.childNodes) walkIn(ch);
    return {
      text: clean(textParts.join('')),
      html: htmlParts.join('').replace(/[ \t\r\n]+/g, ' ').trim(),
    };
  };

  // visual border / underline 판별 (본인 + 직계 래퍼/내부 컨테이너 + ::after)
  const inspectVisualBox = (el) => {
    const cs = win.getComputedStyle(el);
    let bTop = borderPx(cs, 'Top');
    let bBot = borderPx(cs, 'Bottom');
    let bLeft = borderPx(cs, 'Left');
    let bRight = borderPx(cs, 'Right');
    let bColor = bBot > 0 ? cs.borderBottomColor : (bLeft > 0 ? cs.borderLeftColor : '');
    let bg = !isTransparentOrWhite(cs.backgroundColor) ? cs.backgroundColor : '';

    // 내부 단일/장식 컨테이너 혹은 직계 부모 래퍼의 border/bg 확인
    const related = [...el.children].slice(0, 4);
    if (el.parentElement && el.parentElement !== articleRoot && el.parentElement.children.length <= 2) {
      related.push(el.parentElement);
    }
    for (const rel of related) {
      if (!isVisible(rel)) continue;
      const rcs = win.getComputedStyle(rel);
      const rb = borderPx(rcs, 'Bottom');
      const rt = borderPx(rcs, 'Top');
      const rl = borderPx(rcs, 'Left');
      const rr = borderPx(rcs, 'Right');
      if (rb > bBot) { bBot = rb; if (!bColor) bColor = rcs.borderBottomColor; }
      if (rt > bTop) bTop = rt;
      if (rl > bLeft) { bLeft = rl; if (!bColor) bColor = rcs.borderLeftColor; }
      if (rr > bRight) bRight = rr;
      if (!bg && !isTransparentOrWhite(rcs.backgroundColor)) bg = rcs.backgroundColor;
      const rectRel = rel.getBoundingClientRect();
      if (rectRel.height > 0 && rectRel.height <= 4 && rectRel.width >= 60 && !isTransparentOrWhite(rcs.backgroundColor)) {
        bBot = Math.max(bBot, rectRel.height);
        bColor = bColor || rcs.backgroundColor;
      }
    }
    for (const pseudo of ['::before', '::after']) {
      try {
        const pcs = win.getComputedStyle(el, pseudo);
        if (pcs && pcs.content && pcs.content !== 'none') {
          const pbh = borderPx(pcs, 'Bottom');
          const ph = parseFloat(pcs.height);
          const pw = parseFloat(pcs.width);
          if (pbh > 0 && (!isNaN(pw) && pw > 60)) {
            bBot = Math.max(bBot, pbh);
            bColor = bColor || pcs.borderBottomColor;
          } else if (!isNaN(ph) && ph > 0 && ph <= 4 && !isNaN(pw) && pw >= 60 && !isTransparentOrWhite(pcs.backgroundColor)) {
            bBot = Math.max(bBot, ph);
            bColor = bColor || pcs.backgroundColor;
          }
        }
      } catch (_e) {}
    }

    const align = ['left', 'center', 'right', 'justify'].includes(cs.textAlign) ? cs.textAlign : null;
    const hasBottomRule = bBot > 0 && bTop === 0 && bLeft === 0 && bRight === 0 && !bg;
    const hasBoxBorder = bTop > 0 && bBot > 0 && bLeft > 0 && bRight > 0;
    return {
      align,
      fontSizePx: +(parseFloat(cs.fontSize) || 14).toFixed(1),
      fontWeight: (cs.fontWeight === 'bold' || parseInt(cs.fontWeight, 10) >= 600) ? 'bold' : 'normal',
      color: cs.color || '',
      bgColor: bg || '',
      lineHeight: cs.lineHeight && cs.lineHeight !== 'normal' ? cs.lineHeight : '',
      hasBottomRule,
      hasLeftBorder: bLeft >= 1.5,
      hasBoxBorder,
      borderColor: bColor || '',
    };
  };

  // 7. 본문 시각 요소 트리 순회
  const elements = [];
  const BLOCK_TAGS = new Set(['ADDRESS','ARTICLE','BLOCKQUOTE','DIV','DL','DT','DD','FIGCAPTION','FIGURE','H1','H2','H3','H4','H5','H6','HR','LI','OL','P','PRE','SECTION','TABLE','UL']);

  const hasBlockChild = (el) => {
    for (const ch of el.children) {
      if (isNoise(ch) || !isVisible(ch)) continue;
      if (BLOCK_TAGS.has(ch.tagName) || ch.tagName === 'IMG' || ch.tagName === 'A') {
        if (ch.tagName === 'A') {
          const acs = win.getComputedStyle(ch);
          if (!acs.display.startsWith('inline') || ch.querySelector('div,p,h1,h2,h3,h4,img')) return true;
        } else {
          return true;
        }
      }
      if (hasBlockChild(ch)) return true;
    }
    return false;
  };

  const extractLinkCard = (aEl) => {
    let href = (aEl.getAttribute('href') || '').trim();
    if (!href || href.startsWith('#') || /^(javascript|data|vbscript):/i.test(href)) return null;
    try { href = new URL(href, doc.baseURI || win.location.href).href; } catch (_e) {}
    const r = absRect(aEl);
    const vis = inspectVisualBox(aEl);
    const acs = win.getComputedStyle(aEl);
    const looksCard = !acs.display.startsWith('inline') || vis.hasBoxBorder || vis.bgColor || acs.boxShadow !== 'none';
    if (!looksCard || r.height < 42) return null;
    const chunks = [];
    for (const n of aEl.querySelectorAll('strong, b, h1, h2, h3, h4, p, span, div')) {
      if (n.children.length === 0 || [...n.children].every((c) => c.tagName === 'BR')) {
        const t = clean(n.innerText || n.textContent);
        if (t && !chunks.includes(t)) chunks.push(t);
      }
    }
    if (!chunks.length) {
      const full = clean(aEl.innerText || aEl.textContent);
      if (full) chunks.push(full);
    }
    if (chunks.length < 2 && !(vis.hasBoxBorder || vis.bgColor)) return null;
    const titleTxt = chunks[0] || href;
    const domain = (() => { try { return new URL(href).hostname; } catch (_e) { return ''; } })();
    const desc = chunks.slice(1).filter((c) => c !== domain && c !== titleTxt).join(' ').slice(0, 180);
    let thumb = null;
    const img = aEl.querySelector('img');
    if (img && isVisible(img)) {
      const src = pickImgSrc(img);
      const ir = absRect(img);
      if (src && !isTinyIcon(img, src, ir)) {
        thumb = { src, alt: clean(img.getAttribute('alt') || titleTxt), widthPx: img.naturalWidth || 0, heightPx: img.naturalHeight || 0, renderWidthPx: ir.width, renderHeightPx: ir.height, rect: ir };
      }
    }
    elements.push({
      kindHint: 'link_card',
      tag: 'a',
      rect: r,
      text: `${titleTxt}${domain ? ' — ' + domain : ''}`,
      linkCard: { url: href, title: titleTxt, description: desc, domain, thumb },
      style: vis,
      lineCount: Math.max(2, chunks.length),
    });
    return true;
  };

  const extractTable = (tbl) => {
    const trs = [...tbl.querySelectorAll('tr, [role="row"]')].filter((tr) => {
      let p = tr.parentElement;
      while (p && p !== tbl) {
        if (p.tagName === 'TABLE' || ['table', 'grid'].includes((p.getAttribute('role') || '').toLowerCase())) return false;
        p = p.parentElement;
      }
      return isVisible(tr);
    });
    const rows = [];
    trs.forEach((tr, rIdx) => {
      const cells = [];
      for (const cell of tr.children) {
        const role = (cell.getAttribute('role') || '').toLowerCase();
        if (!['TD', 'TH'].includes(cell.tagName) && !['cell', 'gridcell', 'columnheader', 'rowheader'].includes(role)) continue;
        if (!isVisible(cell)) continue;
        const cs = win.getComputedStyle(cell);
        const res = renderInlineHtml(cell, parseFloat(cs.fontSize) || 14, cs.color || '');
        const align = ['left', 'center', 'right'].includes(cs.textAlign) ? cs.textAlign : 'left';
        const inThead = tr.parentElement && (tr.parentElement.tagName === 'THEAD' || ((tr.parentElement.getAttribute('role') || '').toLowerCase() === 'rowgroup' && rIdx === 0));
        const isHeader = cell.tagName === 'TH' || ['columnheader', 'rowheader'].includes(role) || (rIdx === 0 && Boolean(inThead));
        cells.push({
          text: res.text,
          html: res.html ? `<p>${res.html}</p>` : '<p></p>',
          isHeader,
          colSpan: Math.max(1, parseInt(cell.getAttribute('colspan') || cell.getAttribute('aria-colspan') || '1', 10) || 1),
          rowSpan: Math.max(1, parseInt(cell.getAttribute('rowspan') || cell.getAttribute('aria-rowspan') || '1', 10) || 1),
          align,
        });
      }
      if (cells.length) rows.push(cells);
    });
    if (!rows.length) return;
    if (rows.length === 1 && rows[0].length === 1) return;
    const nonEmpty = rows.reduce((acc, r) => acc + r.filter((c) => c.text).length, 0);
    if (!nonEmpty) return;
    elements.push({
      kindHint: 'table',
      tag: tbl.tagName.toLowerCase(),
      rect: absRect(tbl),
      text: rows.map((r) => r.map((c) => c.text).join(' | ')).join('\n'),
      rows,
      style: inspectVisualBox(tbl),
      lineCount: rows.length,
    });
  };

  const emitImageEl = (img, caption = '') => {
    if (!isVisible(img) || isNoise(img)) return;
    const r = absRect(img);
    const src = pickImgSrc(img);
    if (!src || isTinyIcon(img, src, r)) return;
    const alt = clean(img.getAttribute('alt') || '');
    const cap = clean(caption);
    elements.push({
      kindHint: 'image',
      tag: 'img',
      rect: r,
      text: cap || alt,
      image: {
        src,
        alt,
        caption: cap,
        widthPx: img.naturalWidth || Math.round(r.width) || 0,
        heightPx: img.naturalHeight || Math.round(r.height) || 0,
        renderWidthPx: r.width,
        renderHeightPx: r.height,
        rect: r,
      },
      style: inspectVisualBox(img),
      lineCount: 1,
    });
  };

  const walk = (el) => {
    if (!el || el.nodeType !== 1 || isNoise(el) || !isVisible(el)) return;
    const tag = el.tagName;
    const role = (el.getAttribute('role') || '').toLowerCase();

    if (/^H[1-6]$/.test(tag)) {
      const cs = win.getComputedStyle(el);
      const res = renderInlineHtml(el, parseFloat(cs.fontSize) || 18, cs.color || '');
      if (res.text) {
        elements.push({
          kindHint: 'heading',
          tag: tag.toLowerCase(),
          level: Math.min(4, parseInt(tag[1], 10) || 2),
          rect: absRect(el),
          text: res.text,
          html: res.html || escHtml(res.text),
          style: inspectVisualBox(el),
          lineCount: lineCountOf(el),
        });
      }
      return;
    }

    if (tag === 'HR') {
      elements.push({ kindHint: 'divider', tag: 'hr', rect: absRect(el), style: inspectVisualBox(el), lineCount: 1 });
      return;
    }

    if (tag === 'IMG') {
      emitImageEl(el, '');
      return;
    }

    if (tag === 'FIGURE') {
      const capEl = el.querySelector('figcaption');
      const cap = capEl ? clean(capEl.innerText || capEl.textContent) : '';
      const imgs = [...el.querySelectorAll('img')];
      if (imgs.length) {
        imgs.forEach((im, idx) => emitImageEl(im, idx === imgs.length - 1 ? cap : ''));
        return;
      }
      if (cap) {
        elements.push({ kindHint: 'paragraph', tag: 'figcaption', rect: absRect(el), text: cap, html: escHtml(cap), style: inspectVisualBox(el), lineCount: lineCountOf(el) });
        return;
      }
    }

    if (tag === 'PRE') {
      const codeTxt = (el.innerText || el.textContent || '').replace(/\n+$/, '');
      if (codeTxt.trim()) {
        elements.push({
          kindHint: 'code',
          tag: 'pre',
          rect: absRect(el),
          text: codeTxt,
          html: `<pre><code>${escHtml(codeTxt)}</code></pre>`,
          style: inspectVisualBox(el),
          lineCount: Math.max(1, codeTxt.split('\n').length),
        });
      }
      return;
    }

    if (tag === 'BLOCKQUOTE') {
      const cs = win.getComputedStyle(el);
      const res = renderInlineHtml(el, parseFloat(cs.fontSize) || 15, cs.color || '');
      if (res.text) {
        elements.push({
          kindHint: 'quote',
          tag: 'blockquote',
          rect: absRect(el),
          text: res.text,
          html: res.html || escHtml(res.text),
          style: inspectVisualBox(el),
          lineCount: lineCountOf(el),
        });
      }
      return;
    }

    if (tag === 'UL' || tag === 'OL') {
      const items = [], itemHtmls = [];
      for (const ch of el.children) {
        if (ch.tagName !== 'LI' || !isVisible(ch)) continue;
        const cs = win.getComputedStyle(ch);
        const res = renderInlineHtml(ch, parseFloat(cs.fontSize) || 14, cs.color || '');
        if (res.text) {
          items.push(res.text);
          itemHtmls.push(res.html || escHtml(res.text));
        }
      }
      if (items.length) {
        elements.push({
          kindHint: 'list',
          tag: tag.toLowerCase(),
          ordered: tag === 'OL',
          rect: absRect(el),
          text: items.join('\n'),
          items,
          itemHtmls,
          style: inspectVisualBox(el),
          lineCount: items.length,
        });
      }
      return;
    }

    if (tag === 'TABLE' || role === 'table' || role === 'grid') {
      extractTable(el);
      return;
    }

    if (tag === 'A' && extractLinkCard(el)) {
      return;
    }

    if (tag === 'P' || tag === 'FIGCAPTION' || tag === 'DD' || tag === 'DT') {
      const imgs = [...el.querySelectorAll('img')];
      const cs = win.getComputedStyle(el);
      const res = renderInlineHtml(el, parseFloat(cs.fontSize) || 14, cs.color || '');
      if (res.text) {
        elements.push({
          kindHint: 'paragraph',
          tag: tag.toLowerCase(),
          rect: absRect(el),
          text: res.text,
          html: res.html || escHtml(res.text),
          style: inspectVisualBox(el),
          lineCount: lineCountOf(el),
        });
      }
      for (const im of imgs) emitImageEl(im, '');
      return;
    }

    // 텍스트 없는 얇은 구분선 <div> (height <= 6px, width >= 80px, border 또는 bg 있음)
    if (!clean(el.innerText || el.textContent) && !el.querySelector('img')) {
      const r = absRect(el);
      const vis = inspectVisualBox(el);
      if (r.height > 0 && r.height <= 6 && r.width >= 80 && (vis.hasBottomRule || vis.bgColor || vis.hasBoxBorder)) {
        elements.push({ kindHint: 'divider', tag: tag.toLowerCase(), rect: r, style: vis, lineCount: 1 });
        return;
      }
    }

    // 블록 자식이 없는 말단 텍스트 컨테이너 (div/section 등)
    if (['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'BLOCKQUOTE', 'SPAN'].includes(tag) && !hasBlockChild(el)) {
      const cs = win.getComputedStyle(el);
      const res = renderInlineHtml(el, parseFloat(cs.fontSize) || 14, cs.color || '');
      if (res.text) {
        elements.push({
          kindHint: 'paragraph',
          tag: tag.toLowerCase(),
          rect: absRect(el),
          text: res.text,
          html: res.html || escHtml(res.text),
          style: inspectVisualBox(el),
          lineCount: lineCountOf(el),
        });
      }
      return;
    }

    for (const ch of el.children) walk(ch);
  };

  walk(articleRoot);

  // 루트 밖에 <h1> 제목이 있었는데 내부에 heading h1 이 없으면 상단에 합성 보강
  if (h1Text && !elements.some((e) => e.kindHint === 'heading' && e.level === 1)) {
    const r = absRect(articleRoot);
    elements.unshift({
      kindHint: 'heading',
      tag: 'h1',
      level: 1,
      rect: { x: r.x, y: Math.max(0, r.y - 44), width: r.width, height: 36 },
      text: h1Text,
      html: escHtml(h1Text),
      style: { align: 'left', fontSizePx: 24, fontWeight: 'bold', color: '', bgColor: '', lineHeight: '', hasBottomRule: true, hasLeftBorder: false, hasBoxBorder: false, borderColor: '#cbd5e1' },
      lineCount: 1,
    });
  }

  return JSON.stringify({
    url: win.location.href || doc.URL,
    title,
    siteName: metaMap['og:site_name'] || '',
    author: metaMap['author'] || metaMap['article:author'] || '',
    description: metaMap['og:description'] || metaMap['description'] || '',
    rawTextChars: clean(articleRoot.innerText || articleRoot.textContent).length,
    bodyFontSizePx: +medianFontPx.toFixed(1),
    rootRect: absRect(articleRoot),
    elements,
  });
})();
""".replace("__SCROLL_HELPER__", _SCROLL_HELPER_JS)


def _find_browser_executable() -> Optional[str]:
    """OS 표준 경로 및 `VIBE_BROWSER_BIN` 에서 Chrome/Edge 실행 파일을 탐색한다."""
    env_bin = (os.environ.get("VIBE_BROWSER_BIN") or "").strip()
    if env_bin and Path(env_bin).is_file():
        return env_bin

    candidates: list[str] = []
    if _IS_WINDOWS:
        pf = os.environ.get("ProgramFiles", r"C:\Program Files")
        pf86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        local = os.environ.get("LOCALAPPDATA", "")
        candidates.extend([
            rf"{pf}\Google\Chrome\Application\chrome.exe",
            rf"{pf86}\Google\Chrome\Application\chrome.exe",
            rf"{local}\Google\Chrome\Application\chrome.exe" if local else "",
            rf"{pf86}\Microsoft\Edge\Application\msedge.exe",
            rf"{pf}\Microsoft\Edge\Application\msedge.exe",
        ])
        for cmd_name in ("chrome.exe", "msedge.exe", "chrome", "msedge"):
            found = shutil.which(cmd_name)
            if found:
                candidates.append(found)
    elif sys.platform == "darwin":
        candidates.extend([
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ])
    else:
        for cmd_name in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge"):
            found = shutil.which(cmd_name)
            if found:
                candidates.append(found)

    for cand in candidates:
        if cand and Path(cand).is_file():
            return cand
    return None


def _pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _cdp_alive(cdp_http: str, timeout_s: float = 0.8) -> bool:
    try:
        with urllib.request.urlopen(f"{cdp_http.rstrip('/')}/json/version", timeout=timeout_s) as res:
            return res.status == 200
    except Exception:
        return False


def _kill_process_tree(proc: subprocess.Popen[bytes]) -> None:
    if proc.poll() is not None:
        return
    if _IS_WINDOWS:
        try:
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
                check=False,
            )
            return
        except Exception:
            pass
    try:
        proc.terminate()
        proc.wait(timeout=3)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def _parse_style_dict(raw: dict[str, Any] | None) -> TextInlineStyle:
    if not raw:
        return TextInlineStyle()
    align_val = str(raw.get("align") or "").lower()
    align = align_val if align_val in ("left", "center", "right", "justify") else None
    fs = raw.get("fontSizePx")
    font_size_px: Optional[float] = None
    if isinstance(fs, (int, float)) and 10.0 <= float(fs) <= 48.0:
        font_size_px = round(max(11.0, min(30.0, float(fs))), 1)

    fg = normalize_css_color(str(raw.get("color") or ""))
    if fg in ("#ffffff", "#fefefe", "#fafafa"):
        fg = None
    bg = normalize_css_color(str(raw.get("bgColor") or ""))
    if bg in ("#ffffff", "#fefefe", "#000000"):
        bg = None
    b_col = normalize_css_color(str(raw.get("borderColor") or ""))

    lh_raw = str(raw.get("lineHeight") or "").strip().lower()
    lh_px = parse_css_length_px(lh_raw) if lh_raw.endswith(("px", "pt", "em", "rem")) else None
    line_height = f"{round(lh_px, 1)}px" if lh_px else (lh_raw if lh_raw else None)

    return TextInlineStyle(
        align=align,  # type: ignore[arg-type]
        font_size_px=font_size_px,
        font_weight="bold" if raw.get("fontWeight") == "bold" else None,
        color=fg,
        bg_color=bg,
        line_height=line_height,
        has_bottom_rule=bool(raw.get("hasBottomRule")),
        has_left_border=bool(raw.get("hasLeftBorder")),
        has_box_border=bool(raw.get("hasBoxBorder")),
        border_color=b_col,
    )


def _rect_from_dict(raw: dict[str, Any] | None) -> MeasuredRect:
    if not raw:
        return MeasuredRect(0.0, 0.0, 0.0, 0.0)
    return MeasuredRect(
        x=float(raw.get("x") or 0.0),
        y=float(raw.get("y") or 0.0),
        width=max(0.0, float(raw.get("width") or 0.0)),
        height=max(0.0, float(raw.get("height") or 0.0)),
    )


def parse_browser_snapshot_json(raw_json: str, *, fallback_url: str = "") -> Optional[BrowserLayoutSnapshot]:
    """JS 프로브가 반환한 JSON 문자열을 `BrowserLayoutSnapshot` 데이터클래스로 복원한다."""
    try:
        data = json.loads(raw_json)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None

    elements: list[BrowserElementGeometry] = []
    for item in data.get("elements") or []:
        if not isinstance(item, dict):
            continue
        rect = _rect_from_dict(item.get("rect"))
        style = _parse_style_dict(item.get("style"))

        im_obj: Optional[WebImage] = None
        raw_img = item.get("image")
        if isinstance(raw_img, dict) and raw_img.get("src"):
            im_obj = WebImage(
                src=str(raw_img["src"]),
                alt=str(raw_img.get("alt") or ""),
                caption=str(raw_img.get("caption") or ""),
                width_px=int(raw_img.get("widthPx") or 0),
                height_px=int(raw_img.get("heightPx") or 0),
                render_width_px=float(raw_img.get("renderWidthPx") or rect.width or 0.0),
                render_height_px=float(raw_img.get("renderHeightPx") or rect.height or 0.0),
                rect=_rect_from_dict(raw_img.get("rect")) if raw_img.get("rect") else rect,
            )

        lc_obj: Optional[WebLinkCard] = None
        raw_lc = item.get("linkCard")
        if isinstance(raw_lc, dict) and raw_lc.get("url"):
            thumb: Optional[WebImage] = None
            raw_thumb = raw_lc.get("thumb")
            if isinstance(raw_thumb, dict) and raw_thumb.get("src"):
                thumb = WebImage(
                    src=str(raw_thumb["src"]),
                    alt=str(raw_thumb.get("alt") or ""),
                    width_px=int(raw_thumb.get("widthPx") or 0),
                    height_px=int(raw_thumb.get("heightPx") or 0),
                    render_width_px=float(raw_thumb.get("renderWidthPx") or 0.0),
                    render_height_px=float(raw_thumb.get("renderHeightPx") or 0.0),
                )
            lc_obj = WebLinkCard(
                url=str(raw_lc["url"]),
                title=str(raw_lc.get("title") or raw_lc["url"]),
                description=str(raw_lc.get("description") or ""),
                domain=str(raw_lc.get("domain") or ""),
                thumbnail=thumb,
            )

        rows_out: list[list[WebTableCell]] = []
        for raw_row in item.get("rows") or []:
            if not isinstance(raw_row, list):
                continue
            r_cells: list[WebTableCell] = []
            for raw_c in raw_row:
                if not isinstance(raw_c, dict):
                    continue
                calign = str(raw_c.get("align") or "left")
                r_cells.append(
                    WebTableCell(
                        text=str(raw_c.get("text") or ""),
                        html=str(raw_c.get("html") or "<p></p>"),
                        is_header=bool(raw_c.get("isHeader")),
                        col_span=int(raw_c.get("colSpan") or 1),
                        row_span=int(raw_c.get("rowSpan") or 1),
                        align=calign if calign in ("left", "center", "right") else "left",  # type: ignore[arg-type]
                    )
                )
            if r_cells:
                rows_out.append(r_cells)

        elements.append(
            BrowserElementGeometry(
                kind_hint=str(item.get("kindHint") or "paragraph"),
                tag=str(item.get("tag") or "div"),
                rect=rect,
                text=str(item.get("text") or ""),
                html=str(item.get("html") or ""),
                level=int(item.get("level") or 0),
                ordered=bool(item.get("ordered")),
                items=[str(x) for x in (item.get("items") or [])],
                item_htmls=[str(x) for x in (item.get("itemHtmls") or [])],
                rows=rows_out,
                image=im_obj,
                link_card=lc_obj,
                style=style,
                line_count=max(1, int(item.get("lineCount") or 1)),
            )
        )

    return BrowserLayoutSnapshot(
        url=str(data.get("url") or fallback_url),
        title=str(data.get("title") or ""),
        site_name=str(data.get("siteName") or ""),
        author=str(data.get("author") or ""),
        description=str(data.get("description") or ""),
        raw_text_chars=int(data.get("rawTextChars") or 0),
        body_font_size_px=float(data.get("bodyFontSizePx") or 16.0),
        root_rect=_rect_from_dict(data.get("rootRect")) if data.get("rootRect") else None,
        elements=elements,
    )


def compute_scroll_bands(
    total_height: int,
    viewport_height: int,
    overlap_px: int = 80,
    max_tiles: int = 24,
) -> list[int]:
    """스크롤 높이 대비 캡처할 Y 좌표 목록을 계산한다 (상단 0 및 하단 누락 방지, 최대 타일 예산 내 균등 표집)."""
    vh = max(240, int(viewport_height))
    total = max(vh, int(total_height))
    if total <= vh or max_tiles <= 1:
        return [0]
    step = max(200, vh - max(0, int(overlap_px)))
    max_y = total - vh
    bands = list(range(0, max_y, step))
    if not bands or bands[-1] != max_y:
        bands.append(max_y)
    if len(bands) <= max_tiles:
        return bands
    # 첫 장(0) 과 마지막 장은 반드시 포함하고 나머지를 균등 샘플링
    picked = [0]
    inner_slots = max_tiles - 2
    for slot in range(1, inner_slots + 1):
        idx = round(slot * (len(bands) - 1) / (inner_slots + 1))
        if bands[idx] not in picked:
            picked.append(bands[idx])
    if bands[-1] not in picked:
        picked.append(bands[-1])
    return sorted(picked)


_SCROLL_INFO_JS = """
(() => {
__SCROLL_HELPER__
  const st = _findScrollTarget();
  return JSON.stringify({totalHeight: st.totalHeight, sameDoc: st.sameDoc, scrollMode: st.mode});
})()
""".replace("__SCROLL_HELPER__", _SCROLL_HELPER_JS)


_TAB_READY_JS = r"""
(() => {
  const outerLen = (document.body && document.body.innerText ? document.body.innerText.trim().length : 0);
  let maxLen = outerLen;
  let ready = document.readyState === 'complete';
  if (ready && outerLen <= 120) {
    for (const ifr of document.querySelectorAll('iframe')) {
      try {
        const idoc = ifr.contentDocument;
        if (idoc && idoc.body) {
          const flen = (idoc.body.innerText || '').trim().length;
          if (flen > maxLen) {
            maxLen = flen;
            ready = idoc.readyState === 'complete';
          }
        }
      } catch (_e) {}
    }
  }
  return JSON.stringify({href: location.href, ready, len: maxLen});
})()
"""


def _toggle_sticky_js(hidden: bool) -> str:
    flag = "true" if hidden else "false"
    return f"""
(() => {{
  const hide = {flag};
  const docs = [document];
  for (const ifr of document.querySelectorAll('iframe')) {{
    try {{ if (ifr.contentDocument) docs.push(ifr.contentDocument); }} catch (_e) {{}}
  }}
  for (const d of docs) {{
    const w = d.defaultView || window;
    for (const el of d.querySelectorAll('*')) {{
      if (hide) {{
        const cs = w.getComputedStyle(el);
        if (cs.position === 'fixed' || cs.position === 'sticky') {{
          const r = el.getBoundingClientRect();
          if (r.height > 0 && r.height <= 200 && cs.visibility !== 'hidden') {{
            el.setAttribute('data-vdoc-prev-vis', el.style.visibility || '');
            el.setAttribute('data-vdoc-masked', '1');
            el.style.visibility = 'hidden';
          }}
        }}
      }} else if (el.getAttribute('data-vdoc-masked') === '1') {{
        el.style.visibility = el.getAttribute('data-vdoc-prev-vis') || '';
        el.removeAttribute('data-vdoc-prev-vis');
        el.removeAttribute('data-vdoc-masked');
      }}
    }}
  }}
}})()
"""


def _scroll_tile_js(scroll_y: int, *, mask_sticky: bool = False, wait_images: bool = True) -> str:
    mask_stmt = (_toggle_sticky_js(True).strip() + ";") if mask_sticky else ""
    img_wait_ms = 450 if wait_images else 0
    return (
        """
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
__SCROLL_HELPER__
  const st = _findScrollTarget();
  const targetY = __TARGET_Y__;
  _scrollTargetTo(st, targetY);
  await nextFrame();
  await sleep(120);
  __MASK_CALL__
  if (__IMG_WAIT_MS__ > 0 && st.doc) {
    try {
      const vh = Math.max(400, st.vh || 900);
      const pending = [...st.doc.querySelectorAll('img')].filter((im) => {
        if (im.complete) return false;
        const src = im.currentSrc || im.getAttribute('src') || im.dataset?.lazySrc || im.dataset?.src;
        if (!src) return false;
        const r = im.getBoundingClientRect();
        return r.bottom >= -150 && r.top <= vh + 150;
      });
      if (pending.length) {
        await Promise.race([
          Promise.all(pending.slice(0, 12).map((im) => new Promise((res) => {
            if (im.complete) return res();
            im.addEventListener('load', res, { once: true });
            im.addEventListener('error', res, { once: true });
          }))),
          sleep(__IMG_WAIT_MS__),
        ]);
      }
    } catch (_e) {}
  }
  await nextFrame();
  return JSON.stringify({actualY: Math.round(_readScrollY(st)), mode: st.mode});
})()
""".replace("__SCROLL_HELPER__", _SCROLL_HELPER_JS)
        .replace("__TARGET_Y__", str(max(0, int(scroll_y))))
        .replace("__MASK_CALL__", mask_stmt)
        .replace("__IMG_WAIT_MS__", str(img_wait_ms))
    )


class CdpBrowserDomFetcher:
    """디버그 크롬(CDP) 또는 임시 헤드리스 Chrome/Edge 탭에서 렌더 DOM · 기하 좌표를 수집한다."""

    def __init__(
        self,
        cdp_http: str = "http://127.0.0.1:9222",
        *,
        auto_launch: bool = True,
        allow_private_hosts: bool = False,
    ) -> None:
        self._cdp_http = cdp_http.rstrip("/")
        self._auto_launch = auto_launch
        self._allow_private = allow_private_hosts

    @contextmanager
    def _cdp_endpoint(self, *, viewport_width: int = 1280) -> Iterator[Optional[str]]:
        if _cdp_alive(self._cdp_http):
            yield self._cdp_http
            return

        if not self._auto_launch:
            yield None
            return

        browser_bin = _find_browser_executable()
        if not browser_bin:
            yield None
            return

        port = _pick_free_port()
        tmp_dir = tempfile.TemporaryDirectory(prefix="vdoc_cdp_")
        proc: Optional[subprocess.Popen[bytes]] = None
        try:
            cmd = [
                browser_bin,
                "--headless=new",
                "--disable-gpu",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-extensions",
                "--disable-background-networking",
                "--disable-dev-shm-usage",
                f"--window-size={max(480, viewport_width)},900",
                f"--remote-debugging-port={port}",
                f"--user-data-dir={tmp_dir.name}",
                "about:blank",
            ]
            popen_kw: dict[str, Any] = {
                "stdout": subprocess.DEVNULL,
                "stderr": subprocess.DEVNULL,
            }
            if _IS_WINDOWS:
                popen_kw["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | getattr(subprocess, "CREATE_NO_WINDOW", 0)
            proc = subprocess.Popen(cmd, **popen_kw)

            endpoint = f"http://127.0.0.1:{port}"
            deadline = time.monotonic() + 5.0
            while time.monotonic() < deadline:
                if proc.poll() is not None:
                    yield None
                    return
                if _cdp_alive(endpoint, timeout_s=0.4):
                    yield endpoint
                    return
                time.sleep(0.15)
            yield None
        except Exception:
            yield None
        finally:
            if proc is not None:
                _kill_process_tree(proc)
            try:
                tmp_dir.cleanup()
            except Exception:
                pass

    def _open_and_wait_tab(
        self,
        endpoint: str,
        url: str,
        *,
        viewport_width: int,
        viewport_height: int = 900,
        timeout_s: float = 18.0,
    ) -> Optional[tuple[dict[str, Any], Any]]:
        import websocket

        req = urllib.request.Request(
            f"{endpoint}/json/new?about:blank",
            method="PUT",
        )
        with urllib.request.urlopen(req, timeout=4) as res:
            target = json.loads(res.read())

        ws = websocket.create_connection(
            target["webSocketDebuggerUrl"],
            suppress_origin=True,
            max_size=None,
            timeout=timeout_s,
        )
        msg_id = 0

        def call(method: str, **params: object) -> dict[str, Any]:
            nonlocal msg_id
            msg_id += 1
            ws.send(json.dumps({"id": msg_id, "method": method, "params": params}))
            while True:
                msg = json.loads(ws.recv())
                if msg.get("id") == msg_id:
                    return msg.get("result", {})

        call("Page.enable")
        call(
            "Emulation.setDeviceMetricsOverride",
            width=max(480, int(viewport_width)),
            height=max(400, int(viewport_height)),
            deviceScaleFactor=1,
            mobile=False,
        )
        call("Page.navigate", url=url)
        time.sleep(0.2)

        deadline = time.monotonic() + timeout_s
        while time.monotonic() < deadline:
            ev = call(
                "Runtime.evaluate",
                expression=_TAB_READY_JS,
                returnByValue=True,
            )
            raw = str(ev.get("result", {}).get("value") or "")
            try:
                probe = json.loads(raw) if raw else {}
            except ValueError:
                probe = {}
            href = str(probe.get("href") or "")
            ready = bool(probe.get("ready"))
            text_len = int(probe.get("len") or 0)
            if href and href != "about:blank" and ready and text_len > 120:
                break
            time.sleep(0.25)

        return target, (ws, call)

    @contextmanager
    def _tab_session(
        self,
        url: str,
        *,
        viewport_width: int,
        viewport_height: int = 900,
        timeout_s: float = 18.0,
    ) -> Iterator[Optional[Any]]:
        try:
            import websocket  # noqa: F401
        except ImportError:
            yield None
            return

        try:
            safe_url = validate_public_http_url(url, allow_private_hosts=self._allow_private)
        except ValueError:
            yield None
            return

        with self._cdp_endpoint(viewport_width=viewport_width) as endpoint:
            if not endpoint:
                yield None
                return
            target: Optional[dict[str, Any]] = None
            ws = None
            try:
                opened = self._open_and_wait_tab(
                    endpoint,
                    safe_url,
                    viewport_width=viewport_width,
                    viewport_height=viewport_height,
                    timeout_s=timeout_s,
                )
            except Exception:
                opened = None
            if not opened:
                yield None
                return
            target, (ws, call) = opened
            try:
                yield call
            finally:
                if ws is not None:
                    try:
                        ws.close()
                    except Exception:
                        pass
                if target and target.get("id"):
                    try:
                        urllib.request.urlopen(f"{endpoint}/json/close/{target['id']}", timeout=3).read()
                    except Exception:
                        pass

    def _capture_viewport_tiles(
        self,
        call: Any,
        *,
        viewport_width: int,
        viewport_height: int,
        overlap_px: int,
        max_screenshots: int,
    ) -> list[BrowserScreenshotTile]:
        vw = max(480, int(viewport_width))
        vh = max(400, int(viewport_height))
        info_raw = call("Runtime.evaluate", expression=_SCROLL_INFO_JS, returnByValue=True).get("result", {}).get("value")
        try:
            info = json.loads(info_raw or "{}")
        except ValueError:
            info = {}
        total_h = int(info.get("totalHeight") or vh)
        bands = compute_scroll_bands(total_h, vh, overlap_px=overlap_px, max_tiles=max_screenshots)
        tiles: list[BrowserScreenshotTile] = []
        masked = False
        try:
            for idx, scroll_y in enumerate(bands, start=1):
                if scroll_y > 0:
                    masked = True
                scroll_res_raw = (
                    call(
                        "Runtime.evaluate",
                        expression=_scroll_tile_js(scroll_y, mask_sticky=(scroll_y > 0), wait_images=True),
                        returnByValue=True,
                        awaitPromise=True,
                    )
                    .get("result", {})
                    .get("value")
                )
                actual_y = scroll_y
                if isinstance(scroll_res_raw, str) and scroll_res_raw:
                    try:
                        parsed = json.loads(scroll_res_raw)
                        if isinstance(parsed, dict) and parsed.get("actualY") is not None:
                            actual_y = int(parsed["actualY"])
                    except (ValueError, TypeError):
                        pass
                shot = call("Page.captureScreenshot", format="png")
                b64 = shot.get("data") if isinstance(shot, dict) else None
                if not isinstance(b64, str) or not b64:
                    continue
                tiles.append(
                    BrowserScreenshotTile(
                        index=idx,
                        scroll_y=actual_y,
                        width=vw,
                        height=vh,
                        png_bytes=base64.b64decode(b64),
                        total_height=total_h,
                    )
                )
        finally:
            if masked:
                try:
                    call("Runtime.evaluate", expression=_toggle_sticky_js(False), returnByValue=True)
                except Exception:
                    pass
            try:
                call(
                    "Runtime.evaluate",
                    expression=_scroll_tile_js(0, mask_sticky=False, wait_images=False),
                    returnByValue=True,
                    awaitPromise=True,
                )
            except Exception:
                pass
        return tiles

    def render_dom(self, url: str, *, timeout_s: float = 15.0) -> Optional[tuple[str, str]]:
        """JS 평가 완료 후 `(outerHTML, final_url)` 을 반환한다."""
        with self._tab_session(url, viewport_width=1280, timeout_s=timeout_s) as call:
            if call is None:
                return None
            res = call(
                "Runtime.evaluate",
                expression="JSON.stringify({html: document.documentElement.outerHTML, url: location.href})",
                returnByValue=True,
                awaitPromise=False,
            )
            raw = res.get("result", {}).get("value")
        if not isinstance(raw, str) or not raw:
            return None
        try:
            payload = json.loads(raw)
        except Exception:
            return None
        return str(payload.get("html") or ""), str(payload.get("url") or url)

    def render_layout_snapshot(
        self,
        url: str,
        *,
        viewport_width: int = 1280,
        timeout_s: float = 18.0,
        capture_screenshots: bool = False,
        viewport_height: int = 900,
        overlap_px: int = 80,
        max_screenshots: int = 24,
    ) -> Optional[BrowserLayoutSnapshot]:
        """가시 DOM 요소의 `getBoundingClientRect` · `getComputedStyle` 실측 스냅샷과 선택적 PNG 타일을 반환한다."""
        with self._tab_session(
            url,
            viewport_width=viewport_width,
            viewport_height=viewport_height,
            timeout_s=timeout_s,
        ) as call:
            if call is None:
                return None
            res = call(
                "Runtime.evaluate",
                expression=_MEASURE_ARTICLE_JS,
                returnByValue=True,
                awaitPromise=True,
            )
            raw = res.get("result", {}).get("value")
            if not isinstance(raw, str) or not raw:
                return None
            snapshot = parse_browser_snapshot_json(raw, fallback_url=url)
            if capture_screenshots and snapshot is not None:
                snapshot.screenshots = self._capture_viewport_tiles(
                    call,
                    viewport_width=viewport_width,
                    viewport_height=viewport_height,
                    overlap_px=overlap_px,
                    max_screenshots=max_screenshots,
                )
            return snapshot
