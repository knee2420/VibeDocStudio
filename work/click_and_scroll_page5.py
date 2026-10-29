import json
import urllib.request
import websocket
import time

targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read())
ws_url = [t["webSocketDebuggerUrl"] for t in targets if "5180" in t.get("url", "")][0]
ws = websocket.create_connection(ws_url, suppress_origin=True)

script = """
(() => {
  const buttons = Array.from(document.querySelectorAll('button'));
  const targetBtn = buttons.find(b => b.innerText.includes('10월 4주차'));
  if (targetBtn) {
    targetBtn.click();
  }
  
  // Wait brief moment and check sections
  return {
    clicked: Boolean(targetBtn),
    pagesInPreview: document.querySelectorAll('button[type=\"button\"]').length,
    sections: Array.from(document.querySelectorAll('section[id^=\"vdoc-page-\"]')).map(s => s.id)
  };
})()
"""

ws.send(json.dumps({
    "id": 1,
    "method": "Runtime.evaluate",
    "params": {
        "expression": script,
        "returnByValue": True
    }
}))

res = json.loads(ws.recv())
print("Tab click result:", json.dumps(res, indent=2, ensure_ascii=True))

time.sleep(0.5)

# Scroll to mm_page_5
scroll_script = """
(() => {
  const p5 = document.querySelector('#vdoc-page-mm_page_5');
  if (p5) {
    p5.scrollIntoView({ behavior: 'instant', block: 'start' });
    return { foundP5: true };
  }
  return {
    foundP5: false,
    allSections: Array.from(document.querySelectorAll('section[id^=\"vdoc-page-\"]')).map(s => s.id)
  };
})()
"""

ws.send(json.dumps({
    "id": 2,
    "method": "Runtime.evaluate",
    "params": {
        "expression": scroll_script,
        "returnByValue": True
    }
}))

res2 = json.loads(ws.recv())
print("Scroll result:", json.dumps(res2, indent=2, ensure_ascii=True))
ws.close()

