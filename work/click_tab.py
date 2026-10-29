import json
import urllib.request
import websocket
import time

targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read())
ws_url = [t["webSocketDebuggerUrl"] for t in targets if "5180" in t.get("url", "")][0]
ws = websocket.create_connection(ws_url, suppress_origin=True)

click_script = """
(() => {
  const buttons = Array.from(document.querySelectorAll('button'));
  const targetBtn = buttons.find(b => b.innerText.trim() === '설계 심사회의록');
  if (targetBtn) {
    targetBtn.click();
    return { clicked: true, text: targetBtn.innerText };
  }
  return { clicked: false, buttons: buttons.map(b => b.innerText.trim()).filter(t => t.length > 0) };
})()
"""

ws.send(json.dumps({
    "id": 1,
    "method": "Runtime.evaluate",
    "params": {
        "expression": click_script,
        "returnByValue": True
    }
}))

res = json.loads(ws.recv())
print("Click result:", json.dumps(res, indent=2, ensure_ascii=True))

time.sleep(0.5)

# Check rendered sections now
ws.send(json.dumps({
    "id": 2,
    "method": "Runtime.evaluate",
    "params": {
        "expression": "Array.from(document.querySelectorAll('section[id^=\"vdoc-page-\"]')).map(s => s.id)",
        "returnByValue": True
    }
}))

res2 = json.loads(ws.recv())
print("Rendered sections now:", json.dumps(res2, indent=2, ensure_ascii=True))
ws.close()

