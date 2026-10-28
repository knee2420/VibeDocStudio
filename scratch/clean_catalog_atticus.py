import json

doc_path = r"C:\AI_Projects\WebNovelAssistant\VibeDocStudio\catalog\atticus-invoice-000081709\document.json"
with open(doc_path, "r", encoding="utf-8") as f:
    doc = json.load(f)

# 1. Clean pages
page = doc["pages"][0]
for key in ["engine", "typstSvg", "pageRect"]:
    if key in page:
        del page[key]

# 2. Clean slots (remove rect and isEdited)
for slot_id, slot in doc["slots"].items():
    if "rect" in slot:
        del slot["rect"]
    if "isEdited" in slot:
        del slot["isEdited"]

# 3. Fine-tune slot typography & content
slots = doc["slots"]

slots["att_slot_company_info"]["constraints"] = {
    "locked": True,
    "align": "right",
    "fontSize": "12.5px",
    "lineHeight": "1.35",
}
slots["att_slot_company_info"]["content"] = (
    '<p class="text-xs text-[#383838] mb-2 leading-none">August 25th 2026</p>'
    '<p class="text-[13px] font-semibold text-[#336699] leading-snug">Company info</p>'
    '<p class="text-[13px] font-bold text-[#383838] leading-tight mt-1">Atticus LLC</p>'
    '<p class="text-[13px] text-[#383838] leading-tight">1309 Coffeen Ave. Ste. 2513</p>'
    '<p class="text-[13px] text-[#383838] leading-tight">Sheridan</p>'
    '<p class="text-[13px] text-[#383838] leading-tight">Wyoming, 82801</p>'
    '<p class="text-[13px] text-[#383838] leading-tight">United States</p>'
    '<p class="text-[9.5px] text-[#666666] leading-tight mt-1.5">Sales tax ID: VAT - EU372031974 UK - GB383499055</p>'
    '<p class="text-[13px] font-bold text-[#383838] leading-tight mt-3">Invoice 000081709</p>'
)

slots["att_slot_billing_info"]["constraints"] = {
    "align": "left",
    "fontSize": "12.5px",
    "lineHeight": "1.35",
}
slots["att_slot_billing_info"]["content"] = (
    '<p class="text-[13px] font-semibold text-[#336699] leading-snug mb-1">Billing info</p>'
    '<p class="text-[13px] text-[#383838] leading-tight">qround (주식회사 큐라운드)</p>'
    '<p class="text-[13px] text-[#383838] leading-tight">HONG GIL DONG (홍길동 대표)</p>'
    '<p class="text-[13px] text-[#383838] leading-tight">Seoul, Gangnam-daero 40-6</p>'
    '<p class="text-[13px] text-[#383838] leading-tight">Republic of Korea</p>'
)

slots["att_slot_total_summary"]["constraints"] = {
    "tone": "invoice-hero",
    "align": "right",
    "fontSize": "13px",
    "lineHeight": "1.3",
}
slots["att_slot_total_summary"]["content"] = (
    '<p class="text-[13px] font-semibold text-[#336699] leading-snug mb-0.5">Total (USD)</p>'
    '<p class="hero-amount text-[26px] text-[#383838] font-bold leading-tight my-0.5">$147.00</p>'
    '<p class="text-xs text-[#666666] leading-none mt-1">Paid via credit card</p>'
)

slots["att_slot_td_item1"]["content"] = (
    '<p class="text-[13px] font-semibold text-[#383838] leading-tight">Atticus</p>'
    '<p class="text-[11px] text-[#666666] leading-tight mt-1">One-time payment ($147.00)</p>'
)

slots["att_slot_footer_meta"]["constraints"] = {
    "locked": True,
    "align": "center",
    "fontSize": "11px",
    "color": "#94a3b8",
}
slots["att_slot_footer_meta"]["content"] = (
    '<p class="text-[11px] text-[#94a3b8]">Atticus LLC · Sheridan, Wyoming, USA · support@atticus.io · Thank you for your business!</p>'
)

# 4. Table border styles in block
for block in page["blocks"]:
    if block.get("blockId") == "att_blk_items_table":
        block["borderRules"] = {
            "outer": "none",
            "headerTop": "2px solid #336699",
            "headerBottom": "none",
            "rowBottom": "1px solid #e2e8f0",
            "vertical": "none",
        }
        block["headerStyle"] = {
            "textColor": "#336699",
            "fontWeight": "600",
            "padding": "10px 8px",
        }
        block["footerSummary"] = {
            "align": "right",
            "width": "260px",
            "items": [
                {
                    "itemId": "subtotal",
                    "labelSlotId": "att_slot_td_label_sub",
                    "valueSlotId": "att_slot_td_val_sub",
                },
                {
                    "itemId": "total",
                    "labelSlotId": "att_slot_td_label_tot",
                    "valueSlotId": "att_slot_td_val_tot",
                    "isTotal": True,
                    "borderTop": "2px solid #336699",
                },
            ],
        }

with open(doc_path, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)

print("Cleaned and updated catalog/atticus-invoice-000081709/document.json successfully!")

