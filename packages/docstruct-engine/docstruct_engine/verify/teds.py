"""Self-contained Zhang-Shasha tree edit distance and PubTabNet-style TEDS / TEDS-S."""
from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Optional


def normalize_text(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text or "").split())


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        curr = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            curr.append(min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost))
        prev = curr
    return prev[-1]


@dataclass
class _TreeNode:
    tag: str
    colspan: int = 1
    rowspan: int = 1
    content: str = ""
    children: list["_TreeNode"] = field(default_factory=list)


class _DomTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root: Optional[_TreeNode] = None
        self.stack: list[_TreeNode] = []
        self.in_cell = False
        self.cell_depth = 0
        self.cell_buf: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        t = tag.lower()
        if t in ("table", "thead", "tbody", "tfoot", "tr", "td", "th"):
            amap = {k.lower(): (v or "") for k, v in attrs}
            if t == "table" and self.root is not None:
                # Ignore nested table markup inside top-level table evaluation or keep as subnode
                node = _TreeNode(tag=t)
                self.stack[-1].children.append(node)
                self.stack.append(node)
                return
            cs = _safe_int(amap.get("colspan"), 1)
            rs = _safe_int(amap.get("rowspan"), 1)
            node = _TreeNode(tag=t, colspan=cs, rowspan=rs)
            if self.root is None and t == "table":
                self.root = node
                self.stack.append(node)
            elif self.stack:
                self.stack[-1].children.append(node)
                self.stack.append(node)
            if t in ("td", "th"):
                self.in_cell = True
                self.cell_depth = len(self.stack)
                self.cell_buf = []
        elif self.in_cell and t in ("br", "p"):
            self.cell_buf.append(" ")

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        if not self.stack:
            return
        if t in ("td", "th") and self.in_cell and len(self.stack) == self.cell_depth:
            self.stack[-1].content = normalize_text("".join(self.cell_buf))
            self.in_cell = False
            self.cell_buf = []
        if self.stack[-1].tag == t:
            self.stack.pop()

    def handle_data(self, data: str) -> None:
        if self.in_cell:
            self.cell_buf.append(data)


def _safe_int(v: Optional[str], default: int) -> int:
    try:
        return max(1, int(v or default))
    except ValueError:
        return default


def _normalize_sections(root: _TreeNode) -> _TreeNode:
    """Group bare <tr> nodes under synthetic <thead>/<tbody> to match canonical DOM structure."""
    if any(ch.tag in ("thead", "tbody", "tfoot") for ch in root.children):
        # Flatten empty section wrappers
        cleaned = [ch for ch in root.children if ch.children or ch.tag not in ("thead", "tbody", "tfoot")]
        return _TreeNode(tag=root.tag, children=cleaned)

    tr_children = [ch for ch in root.children if ch.tag == "tr"]
    if not tr_children:
        return root

    head_trs: list[_TreeNode] = []
    body_trs: list[_TreeNode] = []
    in_head = True
    for tr in tr_children:
        if in_head and tr.children and all(c.tag == "th" for c in tr.children):
            head_trs.append(tr)
        else:
            in_head = False
            body_trs.append(tr)

    sections: list[_TreeNode] = []
    if head_trs:
        sections.append(_TreeNode(tag="thead", children=head_trs))
    if body_trs:
        sections.append(_TreeNode(tag="tbody", children=body_trs))
    return _TreeNode(tag=root.tag, children=sections)


def parse_table_tree(html: str) -> Optional[_TreeNode]:
    parser = _DomTableParser()
    parser.feed(html or "")
    parser.close()
    if parser.root is None:
        return None
    return _normalize_sections(parser.root)


def _index_postorder(root: _TreeNode) -> tuple[list[_TreeNode], list[int], list[int]]:
    nodes: list[_TreeNode] = []
    leftmost: list[int] = []

    def dfs(node: _TreeNode) -> int:
        if not node.children:
            idx = len(nodes)
            nodes.append(node)
            leftmost.append(idx)
            return idx
        first_leaf: Optional[int] = None
        for ch in node.children:
            leaf = dfs(ch)
            if first_leaf is None:
                first_leaf = leaf
        idx = len(nodes)
        nodes.append(node)
        leftmost.append(first_leaf if first_leaf is not None else idx)
        return leftmost[idx]

    dfs(root)
    by_leftmost: dict[int, int] = {}
    for idx, lm in enumerate(leftmost):
        by_leftmost[lm] = idx
    keyroots = sorted(by_leftmost.values())
    return nodes, leftmost, keyroots


def _relabel_cost(a: _TreeNode, b: _TreeNode, *, structure_only: bool) -> float:
    if a.tag != b.tag or a.colspan != b.colspan or a.rowspan != b.rowspan:
        return 1.0
    if structure_only or a.tag not in ("td", "th"):
        return 0.0
    if a.content == b.content:
        return 0.0
    denom = max(len(a.content), len(b.content))
    return (levenshtein(a.content, b.content) / denom) if denom > 0 else 0.0


def tree_edit_distance(root_a: _TreeNode, root_b: _TreeNode, *, structure_only: bool = False) -> tuple[float, int, int]:
    nodes_a, lm_a, kr_a = _index_postorder(root_a)
    nodes_b, lm_b, kr_b = _index_postorder(root_b)
    n, m = len(nodes_a), len(nodes_b)
    td = [[0.0] * m for _ in range(n)]

    for i in kr_a:
        for j in kr_b:
            rows = i - lm_a[i] + 1
            cols = j - lm_b[j] + 1
            fd = [[0.0] * (cols + 1) for _ in range(rows + 1)]
            for x in range(1, rows + 1):
                fd[x][0] = fd[x - 1][0] + 1.0
            for y in range(1, cols + 1):
                fd[0][y] = fd[0][y - 1] + 1.0
            for x in range(1, rows + 1):
                p = lm_a[i] + x - 1
                for y in range(1, cols + 1):
                    q = lm_b[j] + y - 1
                    if lm_a[p] == lm_a[i] and lm_b[q] == lm_b[j]:
                        cost = _relabel_cost(nodes_a[p], nodes_b[q], structure_only=structure_only)
                        val = min(
                            fd[x - 1][y] + 1.0,
                            fd[x][y - 1] + 1.0,
                            fd[x - 1][y - 1] + cost,
                        )
                        fd[x][y] = val
                        td[p][q] = val
                    else:
                        px = lm_a[p] - lm_a[i]
                        qy = lm_b[q] - lm_b[j]
                        fd[x][y] = min(
                            fd[x - 1][y] + 1.0,
                            fd[x][y - 1] + 1.0,
                            fd[px][qy] + td[p][q],
                        )
    return td[n - 1][m - 1], n, m


def compute_teds(pred_html: str, gold_html: str, *, structure_only: bool = False) -> float:
    """Compute PubTabNet TEDS (or TEDS-S when structure_only=True) in [0.0, 1.0]."""
    tree_a = parse_table_tree(pred_html)
    tree_b = parse_table_tree(gold_html)
    if tree_a is None and tree_b is None:
        return 1.0
    if tree_a is None or tree_b is None:
        return 0.0
    dist, n, m = tree_edit_distance(tree_a, tree_b, structure_only=structure_only)
    denom = float(max(n, m, 1))
    return max(0.0, min(1.0, 1.0 - (dist / denom)))


def page_table_teds(
    pred_tables_html: list[str],
    gold_tables_html: list[str],
) -> tuple[float, float]:
    """Return average (TEDS, TEDS-S) over ordered table pairs on a page."""
    if not pred_tables_html and not gold_tables_html:
        return 1.0, 1.0
    count = max(len(pred_tables_html), len(gold_tables_html))
    teds_sum = 0.0
    teds_s_sum = 0.0
    for idx in range(count):
        ph = pred_tables_html[idx] if idx < len(pred_tables_html) else ""
        gh = gold_tables_html[idx] if idx < len(gold_tables_html) else ""
        teds_sum += compute_teds(ph, gh, structure_only=False)
        teds_s_sum += compute_teds(ph, gh, structure_only=True)
    return teds_sum / count, teds_s_sum / count

