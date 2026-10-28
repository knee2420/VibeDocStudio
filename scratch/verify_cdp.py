import urllib.request
import json
import base64
import time
from websocket import create_connection

# 1. Find VibeDocStudio tab
resp = urllib.request.urlopen("http://127.0.0.1:9222/json")
tabs = json.loads(resp.read().decode())
vibe_tab = None
for t in tabs:
    if "5180" in t.get("url", ""):
        vibe_tab = t
        break

if not vibe_tab:
    print("VibeDocStudio tab not found!")
    exit(1)

ws_url = vibe_tab["webSocketDebuggerUrl"]
print("Connecting to:", ws_url)
ws = create_connection(ws_url)

# 2. Reload page
ws.send(json.dumps({"id": 1, "method": "Page.reload"}))
time.sleep(2.5)

# 3. Capture screenshot
ws.send(json.dumps({"id": 2, "method": "Page.captureScreenshot", "params": {"format": "png"}}))
while True:
    res = json.loads(ws.recv())
    if res.get("id") == 2:
        img_bytes = base64.b64decode(res["result"]["data"])
        out_path = r"C:\AI_Projects\WebNovelAssistant\VibeDocStudio\scratch\vdoc_studio_dom_verified.png"
        with open(out_path, "wb") as f:
            f.write(img_bytes)
        print("Captured screenshot to:", out_path)
        break

ws.close()

