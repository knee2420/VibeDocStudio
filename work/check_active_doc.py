import json
import urllib.request
import websocket

targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read())
ws_url = [t['webSocketDebuggerUrl'] for t in targets if '5180' in t.get('url', '')][0]
ws = websocket.create_connection(ws_url, suppress_origin=True)

eval_code = """
(() => {
  const store = window.__studioDocStore;
  const state = store.getState();
  const current = state.docs.find(d => d.docId === state.activeDocId);
  return {
    activeDocId: state.activeDocId,
    currentDocId: current?.docId,
    currentDocTitle: current?.title,
    currentPages: (current?.pages || []).map(p => ({ pageId: p.pageId, blockCount: p.blocks?.length }))
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

