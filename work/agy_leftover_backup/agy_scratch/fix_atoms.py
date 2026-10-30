from pathlib import Path

p = Path(r"c:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\pdf-vdoc-engine\pdf_vdoc_engine\measure\vector_grid_extractor.py")
text = p.read_text(encoding="utf-8")

old = """                # 셀 내부 텍스트 수집
                cell_texts: list[str] = []
                for a_idx, atom in enumerate(all_atoms):
                    cx = (atom.x0 + atom.x1) / 2.0
                    cy = (atom.y0 + atom.y1) / 2.0
                    if x_left - 2.0 <= cx <= x_right + 2.0 and y_top - 2.0 <= cy <= cell_y_bottom + 2.0:
                        consumed_atom_indices.add(a_idx)
                        cell_texts.append(atom.text)

                joined_text = "\\n".join(cell_texts).strip()"""

new = """                # 셀 내부 텍스트 수집
                cell_atoms = []
                cell_texts: list[str] = []
                for a_idx, atom in enumerate(all_atoms):
                    cx = (atom.x0 + atom.x1) / 2.0
                    cy = (atom.y0 + atom.y1) / 2.0
                    if x_left - 2.0 <= cx <= x_right + 2.0 and y_top - 2.0 <= cy <= cell_y_bottom + 2.0:
                        consumed_atom_indices.add(a_idx)
                        cell_texts.append(atom.text)
                        cell_atoms.append(atom)

                joined_text = "\\n".join(cell_texts).strip()"""

assert old in text, "old not found in extractor"
text = text.replace(old, new)

# matched_atoms -> cell_atoms
text = text.replace("if matched_atoms:", "if cell_atoms:")
text = text.replace("for a in matched_atoms", "for a in cell_atoms")

p.write_text(text, encoding="utf-8")
print("Successfully fixed cell_atoms in vector_grid_extractor.py")
