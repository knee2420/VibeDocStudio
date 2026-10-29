import json
import re
from pathlib import Path

# Paths
catalog_doc_path = Path(r"C:\AI_Projects\WebNovelAssistant\VibeDocStudio\catalog\vibe-architecture-minutes\document.json")
scaffold_path = Path(r"C:\AI_Projects\WebNovelAssistant\VibeDocStudio\work\fidelity\meeting_review_051\scaffold_result.json")

print("Loading documents...")
catalog_doc = json.loads(catalog_doc_path.read_text(encoding="utf-8"))
scaffold_doc = json.loads(scaffold_path.read_text(encoding="utf-8"))

scaffold_page = scaffold_doc["pages"][0]
scaffold_slots = scaffold_doc["slots"]

# 1. Remap all IDs from p1_ to p5_
def remap_id(s: str) -> str:
    return re.sub(r"\bp1_", "p5_", s)

new_slots = {}
for slot_id, slot in scaffold_slots.items():
    new_id = remap_id(slot_id)
    slot_copy = dict(slot)
    slot_copy["slotId"] = new_id
    # 전부 편집 가능하게 변경
    slot_copy["role"] = "editable-slot"
    constraints = dict(slot_copy.get("constraints", {}))
    constraints["locked"] = False
    slot_copy["constraints"] = constraints
    new_slots[new_id] = slot_copy

# 2. Build Page 5 blocks
new_blocks = []
for b in scaffold_page["blocks"]:
    b_copy = json.loads(json.dumps(b))
    b_copy["blockId"] = remap_id(b_copy["blockId"])
    
    if "sections" in b_copy:
        for sec in b_copy["sections"]:
            sec["sectionId"] = remap_id(sec["sectionId"])
            for row in sec.get("rows", []):
                row["rowId"] = remap_id(row["rowId"])
                for cell in row.get("cells", []):
                    cell["cellId"] = remap_id(cell["cellId"])
                    cell["slotId"] = remap_id(cell["slotId"])
                    # 헤더 속성을 풀거나 편집 가능하도록
                    cell["isHeader"] = False
    elif "rows" in b_copy:
        for row in b_copy.get("rows", []):
            row["rowId"] = remap_id(row["rowId"])
            for cell in row.get("cells", []):
                cell["cellId"] = remap_id(cell["cellId"])
                cell["slotId"] = remap_id(cell["slotId"])
                cell["isHeader"] = False
    elif b_copy.get("headingSlotId"):
        b_copy["headingSlotId"] = remap_id(b_copy["headingSlotId"])
        b_copy["bodySlotId"] = remap_id(b_copy["bodySlotId"])

    new_blocks.append(b_copy)

# 3. Create Page 5
page_5 = {
    "pageId": "mm_page_5",
    "pageNumber": 5,
    "pageLabel": "설계 심사회의록 (예스폼 51번 정밀 서식)",
    "hideHeaderFooter": True,
    "layout": scaffold_page.get("layout", {
        "margin": {
            "top": 111.4,
            "right": 96.4,
            "bottom": 83.0,
            "left": 96.3,
        },
        "blockGap": 29.5,
        "fontFamily": "GulimChe, 굴림체, monospace",
        "fontSize": "13.44px",
        "lineHeight": "1.2",
        "exactText": True,
    }),
    "blocks": new_blocks,
}

# 4. Filter out any existing mm_page_5
catalog_doc["pages"] = [p for p in catalog_doc["pages"] if p.get("pageId") != "mm_page_5"]
catalog_doc["pages"].append(page_5)

# 5. Merge slots
catalog_doc["slots"].update(new_slots)

# 6. Save updated catalog document.json
catalog_doc_path.write_text(json.dumps(catalog_doc, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Updated {catalog_doc_path}: pages={len(catalog_doc['pages'])}, slots={len(catalog_doc['slots'])}")

# 7. Inject into running Chrome via CDP
import urllib.request
import websocket
import time

targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read())
ws_url = [t["webSocketDebuggerUrl"] for t in targets if "5180" in t.get("url", "")][0]
ws = websocket.create_connection(ws_url, suppress_origin=True)

inject_script = f"""
(() => {{
  const store = window.__studioDocStore;
  if (!store) return {{ error: 'No __studioDocStore found' }};
  const updatedDoc = {json.dumps(catalog_doc)};
  store.getState().upsertDocument(updatedDoc);
  store.getState().setActiveDocId("vdoc_meeting_minutes_1028");
  store.getState().setActivePageId("mm_page_5");
  return {{
    success: true,
    activeDocId: store.getState().activeDocId,
    activePageId: store.getState().activePageId,
    pagesCount: updatedDoc.pages.length,
    renderedPagesCount: document.querySelectorAll('section[id^="vdoc-page-"]').length
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

