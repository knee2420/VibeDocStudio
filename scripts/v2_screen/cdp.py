"""Tiny CDP driver for the user's Chrome on :9222 (screen-driven verification).

usage:
  cdp.py open <url>                 open a new tab (remembers its id), 1920x1080
  cdp.py eval <js>                  evaluate JS (await ok), print JSON result
  cdp.py evalfile <file.js>         evaluate JS from a file
  cdp.py click <css>                real mouse click at element center
  cdp.py clicktext <text> [css]     click the first visible element whose text includes <text>
  cdp.py type <text>                insert text at focus (IME-safe)
  cdp.py key <Enter|Escape|Tab>     press a key
  cdp.py shot <out.png> [css]       screenshot (viewport or one element)
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
import urllib.request

import websockets

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, "cdp_tab.json")
BASE = "http://127.0.0.1:9222"


def _http(path: str, method: str = "GET") -> object:
    req = urllib.request.Request(BASE + path, method=method)
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))


def _ws_url() -> str:
    with open(STATE, encoding="utf-8") as fh:
        tab_id = json.load(fh)["id"]
    for t in _http("/json/list"):  # type: ignore[union-attr]
        if t["id"] == tab_id:
            return t["webSocketDebuggerUrl"]
    raise SystemExit("remembered tab is gone — run `open` again")


class Cdp:
    def __init__(self, ws) -> None:
        self.ws, self.n = ws, 0

    async def call(self, method: str, **params):
        self.n += 1
        mid = self.n
        await self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            msg = json.loads(await self.ws.recv())
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(msg["error"])
                return msg.get("result", {})

    async def eval(self, expr: str):
        res = await self.call("Runtime.evaluate", expression=expr, awaitPromise=True, returnByValue=True, userGesture=True)
        if res.get("exceptionDetails"):
            raise RuntimeError(json.dumps(res["exceptionDetails"], ensure_ascii=False)[:800])
        return res.get("result", {}).get("value")

    async def viewport(self) -> None:
        await self.call("Emulation.setDeviceMetricsOverride", width=1920, height=1080, deviceScaleFactor=1, mobile=False)

    async def click_at(self, x: float, y: float) -> None:
        for kind in ("mouseMoved", "mousePressed", "mouseReleased"):
            await self.call("Input.dispatchMouseEvent", type=kind, x=x, y=y, button="left", clickCount=1)


CENTER_JS = """(() => { const el = %s; if (!el) return null; el.scrollIntoView({block:'center', inline:'center'});
 const r = el.getBoundingClientRect(); return {x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height}; })()"""


async def main(argv: list[str]) -> None:
    cmd = argv[0]
    if cmd == "open":
        tab = _http("/json/new?" + urllib.request.quote(argv[1], safe=":/?&=%"), method="PUT")
        with open(STATE, "w", encoding="utf-8") as fh:
            json.dump({"id": tab["id"]}, fh)  # type: ignore[index]
    async with websockets.connect(_ws_url(), max_size=64 * 1024 * 1024) as ws:
        cdp = Cdp(ws)
        await cdp.viewport()
        if cmd == "open":
            await cdp.call("Page.bringToFront")
            print(json.dumps({"opened": argv[1]}))
        elif cmd == "eval":
            print(json.dumps(await cdp.eval(argv[1]), ensure_ascii=False, indent=1))
        elif cmd == "evalfile":
            with open(argv[1], encoding="utf-8") as fh:
                print(json.dumps(await cdp.eval(fh.read()), ensure_ascii=False, indent=1))
        elif cmd in ("click", "clicktext"):
            if cmd == "click":
                finder = f"document.querySelector({json.dumps(argv[1])})"
            else:
                scope = json.dumps(argv[2] if len(argv) > 2 else "button, [role=tab], [role=menuitem], a, li, span, div")
                finder = (f"[...document.querySelectorAll({scope})].filter(e => e.offsetParent && (e.innerText||'').includes({json.dumps(argv[1])}))"
                          ".sort((a,b) => (a.innerText||'').length - (b.innerText||'').length)[0]")
            pos = await cdp.eval(CENTER_JS % finder)
            if not pos:
                raise SystemExit(f"not found: {argv[1:]}")
            await asyncio.sleep(0.15)
            pos = await cdp.eval(CENTER_JS % finder)
            await cdp.click_at(pos["x"], pos["y"])
            print(json.dumps({"clicked": argv[1], **pos}))
        elif cmd == "type":
            await cdp.call("Input.insertText", text=argv[1])
            print(json.dumps({"typed": len(argv[1])}))
        elif cmd == "key":
            key = argv[1]
            codes = {"Enter": 13, "Escape": 27, "Tab": 9, "Backspace": 8}
            for kind in ("keyDown", "keyUp"):
                await cdp.call("Input.dispatchKeyEvent", type=kind, key=key, code=key, windowsVirtualKeyCode=codes.get(key, 0),
                               **({"text": "\r"} if key == "Enter" and kind == "keyDown" else {}))
            print(json.dumps({"key": key}))
        elif cmd == "shot":
            params: dict = {"format": "png"}
            if len(argv) > 2:
                pos = await cdp.eval(CENTER_JS % f"document.querySelector({json.dumps(argv[2])})")
                if pos:
                    params["clip"] = {"x": pos["x"] - pos["w"] / 2, "y": pos["y"] - pos["h"] / 2, "width": pos["w"], "height": pos["h"], "scale": 1}
            data = (await cdp.call("Page.captureScreenshot", **params))["data"]
            with open(argv[1], "wb") as fh:
                fh.write(base64.b64decode(data))
            print(json.dumps({"shot": argv[1]}))
        else:
            raise SystemExit(__doc__)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    asyncio.run(main(sys.argv[1:]))
