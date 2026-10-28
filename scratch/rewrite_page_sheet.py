import re

with open(r"C:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\slot-canvas\src\VDocPageSheet.tsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Fix imports
code = re.sub(
    r'import React, \{ useState \} from "react";\s*import \{[^}]+Edit2[^}]+\} from "lucide-react";',
    '''import React from "react";
import {
  GripVertical,
  Sparkles,
  Paperclip,
  Lock,
  Trash2,
  ArrowUp,
  ArrowDown,
  PenLine,
} from "lucide-react";''',
    code,
    flags=re.DOTALL
)

# 2. Remove `const [editingSlotId, setEditingSlotId] = useState<string | null>(null);`
code = code.replace("  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);\n", "")

# 3. Cut out the {page.typstSvg ? ( ... ) : (
pattern = r'\{\/\* Physical Page Sheet \*\/\}\s*\{page\.typstSvg \? \(.*?\) : \(\s*<div className="bg-white rounded-sm shadow-md border border-slate-200\/90 min-h-\[880px\] flex flex-col justify-between">'
replacement = '''{/* Physical Page Sheet (A4 Pure DOM Container: 794px x 1123px @ 96 DPI) */}
      <div className="bg-white rounded-xs shadow-lg border border-slate-200/90 w-full max-w-[794px] min-h-[1123px] mx-auto flex flex-col justify-between">'''

new_code, count = re.subn(pattern, replacement, code, flags=re.DOTALL)
if count != 1:
    print(f"Error matching typstSvg branch, count={count}")
else:
    print("Successfully replaced typstSvg branch!")
    code = new_code

# 4. Remove closing `)}` right before Layer 4
pattern_end = r'(<\/div>\s*)\)\s*;\s*\}\s*(\s*\{\/\* Layer 4: Estimated automatic page break on PDF \*\/})'
# Let's inspect how the file ends
pattern_end2 = r'(\s*\{\/\* Layer 3: Document\'s footer toggle area \*\/.*?<\/div>\s*<\/div>\s*)\)\s*;\s*\}\s*'
# Or just replace `        </div>\n      )}\n\n      {/* Layer 4:`
if "        </div>\n      )}\n\n      {/* Layer 4:" in code:
    code = code.replace("        </div>\n      )}\n\n      {/* Layer 4:", "        </div>\n      </div>\n\n      {/* Layer 4:")
    print("Successfully replaced closing tag!")
else:
    print("Checking closing tag manually...")
    idx = code.find("Layer 4: Estimated automatic page break")
    print(code[idx-50:idx+50])

# 5. Ensure cell styles are passed to renderSlotBox in tables
# In structured-table:
old_tbl_render = '''                                      {renderSlotBox(
                                        cell.slotId,
                                        hAlignClass,
                                        false,
                                        Boolean(cell.compact)
                                      )}'''
new_tbl_render = '''                                      {renderSlotBox(
                                        cell.slotId,
                                        hAlignClass,
                                        false,
                                        Boolean(cell.compact),
                                        {
                                          fontSize: cell.fontSize,
                                          lineHeight: cell.lineHeight,
                                          color: cell.color,
                                          fontWeight: cell.fontWeight,
                                          textAlign: cell.hAlign,
                                        }
                                      )}'''
if old_tbl_render in code:
    code = code.replace(old_tbl_render, new_tbl_render)
    print("Successfully updated table renderSlotBox!")
else:
    print("Warning: old_tbl_render not found exactly")

# In composite-form-frame:
old_frame_render = '''                                      {renderSlotBox(
                                        cell.slotId,
                                        "",
                                        false,
                                        Boolean(cell.compact || cell.padding)
                                      )}'''
new_frame_render = '''                                      {renderSlotBox(
                                        cell.slotId,
                                        "",
                                        false,
                                        Boolean(cell.compact || cell.padding),
                                        {
                                          fontSize: cell.fontSize,
                                          lineHeight: cell.lineHeight,
                                          color: cell.color,
                                          fontWeight: cell.fontWeight,
                                          textAlign: cell.hAlign,
                                        }
                                      )}'''
if old_frame_render in code:
    code = code.replace(old_frame_render, new_frame_render)
    print("Successfully updated composite-form-frame renderSlotBox!")
else:
    print("Warning: old_frame_render not found exactly")

with open(r"C:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\slot-canvas\src\VDocPageSheet.tsx", "w", encoding="utf-8") as f:
    f.write(code)
print("Done writing VDocPageSheet.tsx")

