"""Wait until the v2 Composer is idle (no stop button, no running status) for `quiet` seconds, then dump the conversation.

usage: wait_idle.py [max_seconds=900] [quiet=20]
"""
import asyncio
import json
import sys
import time

sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
import websockets  # noqa: E402

from cdp import Cdp, _ws_url  # noqa: E402

PROBE = r"""(() => {
  const panel = document.querySelector('[data-testid=ai-composer-panel]');
  if (!panel) return {busy: false, missing: true};
  const stop = panel.querySelector('[data-testid=composer-stop]');
  const text = panel.innerText;
  const busy = !!stop || /응답 중…|도구 실행 중…|연결 중…|승인 대기/.test(text);
  return {busy, len: text.length};
})()"""

DUMP = r"""(() => {
  const panel = document.querySelector('[data-testid=ai-composer-panel]');
  const staged = document.querySelector('[data-testid=v2-staged-panel]');
  return {conversation: panel ? panel.innerText : null, staged: staged ? staged.innerText : null};
})()"""


async def main() -> None:
    max_s = float(sys.argv[1]) if len(sys.argv) > 1 else 900
    quiet = float(sys.argv[2]) if len(sys.argv) > 2 else 20
    start = time.time()
    idle_since = None
    last_len = -1
    async with websockets.connect(_ws_url(), max_size=64 * 1024 * 1024) as ws:
        cdp = Cdp(ws)
        while time.time() - start < max_s:
            p = await cdp.eval(PROBE)
            if p.get("busy") or p.get("len") != last_len:
                idle_since = None
            elif idle_since is None:
                idle_since = time.time()
            last_len = p.get("len", -1)
            if idle_since and time.time() - idle_since >= quiet:
                break
            await asyncio.sleep(3)
        out = await cdp.eval(DUMP)
        out["elapsed_s"] = round(time.time() - start)
        print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    asyncio.run(main())
