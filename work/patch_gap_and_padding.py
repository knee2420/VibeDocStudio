from pathlib import Path

# 1. Patch zone_partitioner.py
zp_path = Path(r"c:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\pdf-vdoc-engine\pdf_vdoc_engine\judge\zone_partitioner.py")
zp_text = zp_path.read_text(encoding="utf-8")

old_zp_code = """    # 2. 표 구획 판정: 연속되거나 병합 셀이 포함된 행정 양식 틀은 `composite-form-frame`,
    #    단일 일반 표는 `structured-table`로 분류한다.
    if len(geometry.tables) > 1 or (
        len(geometry.tables) == 1 and _has_merged_cells(geometry.tables[0])
    ):
        zones.append(
            PartitionedZone(
                zone_id=f"p{pnum}_zone_composite",
                kind="composite-form-frame",
                title="복합 양식 테이블 프레임",
                tables=geometry.tables,
            )
        )
    elif len(geometry.tables) == 1:
        zones.append(
            PartitionedZone(
                zone_id=f"p{pnum}_zone_table_1",
                kind="structured-table",
                title="정밀 격자 표",
                tables=geometry.tables,
            )
        )"""

new_zp_code = """    # 2. 표 구획 판정:
    # 각 테이블 간의 세로 간격(vertical gap)이 유의미(8pt 이상)하면 별도 독립 블록으로 분리한다.
    if len(geometry.tables) > 1:
        table_groups: list[list[MeasuredGridTable]] = [[geometry.tables[0]]]
        for prev_tbl, next_tbl in zip(geometry.tables[:-1], geometry.tables[1:]):
            gap_pt = next_tbl.y0 - prev_tbl.y1
            if gap_pt >= 8.0:
                table_groups.append([next_tbl])
            else:
                table_groups[-1].append(next_tbl)

        for g_idx, grp in enumerate(table_groups):
            z_kind = "composite-form-frame" if (len(grp) > 1 or _has_merged_cells(grp[0])) else "structured-table"
            zones.append(
                PartitionedZone(
                    zone_id=f"p{pnum}_zone_tbl_grp_{g_idx + 1}",
                    kind=z_kind,
                    title=f"양식 표 구획 {g_idx + 1}" if len(grp) > 1 else grp[0].table_id,
                    tables=tuple(grp),
                )
            )
    elif len(geometry.tables) == 1:
        z_kind = "composite-form-frame" if _has_merged_cells(geometry.tables[0]) else "structured-table"
        zones.append(
            PartitionedZone(
                zone_id=f"p{pnum}_zone_table_1",
                kind=z_kind,
                title="정밀 격자 표",
                tables=geometry.tables,
            )
        )"""

if old_zp_code in zp_text:
    zp_text = zp_text.replace(old_zp_code, new_zp_code)
    zp_path.write_text(zp_text, encoding="utf-8")
    print("Successfully patched zone_partitioner.py")
else:
    print("Warning: old_zp_code not found in zone_partitioner.py")

# 2. Patch vdoc_assembler.py blockGap and padding
va_path = Path(r"c:\AI_Projects\WebNovelAssistant\VibeDocStudio\packages\pdf-vdoc-engine\pdf_vdoc_engine\assemble\vdoc_assembler.py")
va_text = va_path.read_text(encoding="utf-8")

# Update blockGap to 29.5
if '"blockGap": 8.0,' in va_text:
    va_text = va_text.replace('"blockGap": 8.0,', '"blockGap": 29.5,')
    print("Updated blockGap to 29.5")

# Update padding to 3px 6px for comfortable cell spacing
if '"padding": "1.5px 4px",' in va_text:
    va_text = va_text.replace('"padding": "1.5px 4px",', '"padding": "3px 6px",')
    print("Updated padding to 3px 6px")

va_path.write_text(va_text, encoding="utf-8")
print("Done patching.")

