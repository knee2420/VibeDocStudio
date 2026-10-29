from pathlib import Path

p = Path(r"c:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\pdf-vdoc-engine\pdf_vdoc_engine\measure\vector_grid_extractor.py")
text = p.read_text(encoding="utf-8")

# Look for image check loop and ensure it only runs for t_idx == 0 and r_idx == 0 and c_idx == 0
old_loop = """                # 셀 내부 이미지 수집 (로고 등): 이미지 중심점이 셀 바운딩 박스 안에 있을 때만 추출
                if not joined_text and page:"""

new_loop = """                # 셀 내부 이미지 수집 (로고 등): 오직 첫 번째 표의 좌상단(0,0) 셀에서만 추출
                if not joined_text and page and t_idx == 0 and r_idx == 0 and c_idx == 0:"""

if old_loop in text:
    text = text.replace(old_loop, new_loop)
    p.write_text(text, encoding="utf-8")
    print("Successfully patched logo check to only (0,0)")
else:
    print("Warning: old_loop not found")

