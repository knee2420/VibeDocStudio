"""IR → .vdoc 블록 변환, Tiptap HTML 정제, 높이/섹션 페이지 분할, 썸네일 렌더 및 문서 조립."""
from .block_mapper import MappedBlock, map_nodes_to_blocks
from .paginator import PaginatedPage, paginate_mapped_blocks
from .slot_sanitizer import make_slot, sanitize_slot_html
from .thumbnail_renderer import render_page_thumbnail_data_url
from .vdoc_assembler import assemble_webpage_vdoc

__all__ = [
    "MappedBlock",
    "PaginatedPage",
    "assemble_webpage_vdoc",
    "make_slot",
    "map_nodes_to_blocks",
    "paginate_mapped_blocks",
    "render_page_thumbnail_data_url",
    "sanitize_slot_html",
]

