import json

minutes_path = r"C:\AI_Projects\WebNovelAssistant\VibeDocStudio\catalog\vibe-architecture-minutes\document.json"
with open(minutes_path, "r", encoding="utf-8") as f:
    doc = json.load(f)

for p in doc["pages"]:
    for k in ["engine", "typstSvg", "pageRect"]:
        if k in p:
            del p[k]

for s in doc["slots"].values():
    if "rect" in s:
        del s["rect"]
    if "isEdited" in s:
        del s["isEdited"]

with open(minutes_path, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)

print("Cleaned vibe-architecture-minutes/document.json successfully!")

