import json
import urllib.request
import websocket

targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read())
ws_url = [t['webSocketDebuggerUrl'] for t in targets if '5180' in t.get('url', '')][0]
ws = websocket.create_connection(ws_url, suppress_origin=True)

# Check window.__lastError or trigger a re-render
eval_code = """
(() => {
  const store = window.__studioDocStore;
  // Let's force trigger an update or switch
  store.getState().setActiveDocId("vdoc-1a186916bea-0a3d05f9");
  return {
    stateNow: store.getState().activeDocId,
    elements: Array.from(document.querySelectorAll('section[id^="vdoc-page-"]')).map(s => s.id)
  };
})()
"""

ws.send(json.dumps({
    'id': 1,
    'method': 'Runtime.evaluate',
    'params': {
        'expression': eval_code,
        'returnByValue': True
    }
}))

res = json.loads(ws.recv())
print(json.dumps(res, indent=2, ensure_ascii=True))
ws.close()

