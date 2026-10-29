import json
import urllib.request
import websocket

targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read())
ws_url = [t['webSocketDebuggerUrl'] for t in targets if '5180' in t.get('url', '')][0]
ws = websocket.create_connection(ws_url, suppress_origin=True)

eval_code = """
(() => {
  const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
    text: b.innerText.trim(),
    className: b.className
  }));
  return buttons.filter(b => b.text.includes('설계') || b.text.includes('회의록') || b.text.includes('Invoice'));
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

