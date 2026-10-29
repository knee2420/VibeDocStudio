import json
import urllib.request
import websocket
import time

targets = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read())
ws_url = [t['webSocketDebuggerUrl'] for t in targets if '5180' in t.get('url', '')][0]
ws = websocket.create_connection(ws_url, suppress_origin=True)

ws.send(json.dumps({
    'id': 1,
    'method': 'Page.reload',
    'params': {}
}))

print('Reloaded page')
ws.close()

