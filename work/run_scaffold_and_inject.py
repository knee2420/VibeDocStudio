import sys
import json
from pathlib import Path

# Add paths
api_venv = Path(r"C:\AI_Projects\WebNovelAssistant\VibePatchNote\apps\api\venv\Lib\site-packages")
engine_pkg = Path(r"C:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\pdf-vdoc-engine")
sys.path.insert(0, str(api_venv))
sys.path.insert(0, str(engine_pkg))

from pdf_vdoc_engine.pipeline import extract_vdoc_from_pdf

pdf_path = Path(r"C:\망고독 관련 자료\프로젝트_매니지먼트\What-s-in-my-head\3.📦(Resource) 자료\📑 문서_서식_수집_파이프라인\2.sketch\예스폼_downloads\PDF\예스폼_무료설계심사회의록샘플과예문다운로드.pdf")

print("Reading PDF...")
pdf_bytes = pdf_path.read_bytes()

doc_id = "vdoc-meeting-review-051"
title = "설계 심사회의록"

print("Extracting VDoc from PDF...")
vdoc, score = extract_vdoc_from_pdf(pdf_bytes=pdf_bytes, doc_id=doc_id, title=title)
print("Extraction done! Score:", score)

out_path = Path(r"C:\AI_Projects\WebNovelAssistant\VibeDocStudio\work\fidelity\meeting_review_051\scaffold_result.json")
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(json.dumps(vdoc, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Saved scaffold to: {out_path}")

# Now inject into browser via CDP
import urllib.request
import websocket

targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read())
ws_url = [t["webSocketDebuggerUrl"] for t in targets if "5180" in t.get("url", "")][0]
ws = websocket.create_connection(ws_url, suppress_origin=True)

inject_script = f"""
(() => {{
  const store = window.__studioDocStore;
  if (!store) return {{ error: 'No __studioDocStore found' }};
  const doc = {json.dumps(vdoc)};
  store.getState().upsertDocument(doc);
  store.getState().setActiveDocId("{doc_id}");
  return {{
    success: true,
    activeDocId: store.getState().activeDocId,
    pages: document.querySelectorAll('section[id^="vdoc-page-"]').length
  }};
}})()
"""

ws.send(json.dumps({
    "id": 1,
    "method": "Runtime.evaluate",
    "params": {
        "expression": inject_script,
        "returnByValue": True
    }
}))

res = json.loads(ws.recv())
print("Browser injection result:", json.dumps(res, indent=2, ensure_ascii=True))
ws.close()
