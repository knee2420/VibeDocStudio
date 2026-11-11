"""표준 라이브러리 `html.parser` 기반 내결함성 HTML5 DOM 트리 빌더."""
from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Callable, Iterator, Optional

VOID_TAGS = frozenset({
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
})
SKIP_TEXT_TAGS = frozenset({"script", "style", "noscript", "svg", "template", "iframe"})
BLOCK_CLOSERS = frozenset({
    "address", "article", "aside", "blockquote", "div", "dl", "dt", "dd",
    "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3",
    "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "p", "pre",
    "section", "table", "ul",
})


@dataclass
class DomNode:
    """경량 DOM 노드. `#text` 노드와 일반 태그 노드를 동일 트리로 표현한다."""

    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    text: str = ""
    children: list["DomNode"] = field(default_factory=list)
    parent: Optional["DomNode"] = field(default=None, repr=False)

    @property
    def is_text(self) -> bool:
        return self.tag == "#text"

    @property
    def elem_id(self) -> str:
        return (self.attrs.get("id") or "").strip()

    @property
    def classes(self) -> tuple[str, ...]:
        raw = (self.attrs.get("class") or "").strip()
        return tuple(raw.split()) if raw else ()

    def has_class(self, name: str) -> bool:
        return name in self.classes

    def iter_elements(self) -> Iterator["DomNode"]:
        for ch in self.children:
            if not ch.is_text:
                yield ch
                yield from ch.iter_elements()

    def find_all(
        self,
        tags: Optional[set[str] | frozenset[str] | tuple[str, ...]] = None,
        *,
        class_name: Optional[str] = None,
        id_name: Optional[str] = None,
        predicate: Optional[Callable[["DomNode"], bool]] = None,
    ) -> list["DomNode"]:
        out: list[DomNode] = []
        for el in self.iter_elements():
            if tags is not None and el.tag not in tags:
                continue
            if class_name is not None and not el.has_class(class_name):
                continue
            if id_name is not None and el.elem_id != id_name:
                continue
            if predicate is not None and not predicate(el):
                continue
            out.append(el)
        return out

    def select_first(
        self,
        tags: Optional[set[str] | frozenset[str] | tuple[str, ...]] = None,
        *,
        class_name: Optional[str] = None,
        id_name: Optional[str] = None,
        predicate: Optional[Callable[["DomNode"], bool]] = None,
    ) -> Optional["DomNode"]:
        for el in self.iter_elements():
            if tags is not None and el.tag not in tags:
                continue
            if class_name is not None and not el.has_class(class_name):
                continue
            if id_name is not None and el.elem_id != id_name:
                continue
            if predicate is not None and not predicate(el):
                continue
            return el
        return None

    def inner_text(self, *, skip_tags: frozenset[str] = SKIP_TEXT_TAGS) -> str:
        parts: list[str] = []

        def walk(node: DomNode) -> None:
            if node.is_text:
                parts.append(node.text)
                return
            if node.tag in skip_tags:
                return
            if node.tag == "br":
                parts.append("\n")
                return
            is_block = node.tag in BLOCK_CLOSERS or node.tag in ("li", "tr", "td", "th")
            if is_block and parts and not parts[-1].endswith((" ", "\n")):
                parts.append(" ")
            for ch in node.children:
                walk(ch)
            if is_block and parts and not parts[-1].endswith((" ", "\n")):
                parts.append(" ")

        walk(self)
        return "".join(parts)

    def compact_text(self, *, skip_tags: frozenset[str] = SKIP_TEXT_TAGS) -> str:
        raw = self.inner_text(skip_tags=skip_tags).replace("\u200b", "").replace("\ufeff", "").replace("\xa0", " ")
        return " ".join(raw.split())


class _DomBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = DomNode(tag="#document")
        self._stack: list[DomNode] = [self.root]
        self._raw_tag: Optional[str] = None

    def _current(self) -> DomNode:
        return self._stack[-1]

    def _pop_if_open(self, target_tags: frozenset[str] | tuple[str, ...]) -> None:
        # HTML5 관용 규칙: 닫힘 태그가 빠진 <p>, <li>, <td> 등을 형제/부모 블록 시작 시 안전하게 닫는다.
        for idx in range(len(self._stack) - 1, 0, -1):
            t = self._stack[idx].tag
            if t in ("div", "section", "article", "main", "body", "html", "table", "ul", "ol", "blockquote"):
                break
            if t in target_tags:
                del self._stack[idx:]
                break

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        tag = tag.lower()
        if self._raw_tag is not None:
            return
        attr_map = {k.lower(): (v if v is not None else "") for k, v in attrs if k}

        if tag in BLOCK_CLOSERS and tag != "p":
            self._pop_if_open(frozenset({"p"}))
        if tag == "p":
            self._pop_if_open(frozenset({"p"}))
        elif tag == "li":
            self._pop_if_open(frozenset({"li"}))
        elif tag in ("td", "th"):
            self._pop_if_open(frozenset({"td", "th"}))
        elif tag == "tr":
            self._pop_if_open(frozenset({"td", "th", "tr"}))

        node = DomNode(tag=tag, attrs=attr_map, parent=self._current())
        self._current().children.append(node)
        if tag in VOID_TAGS:
            return
        self._stack.append(node)
        if tag in ("script", "style"):
            self._raw_tag = tag

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        tag = tag.lower()
        if self._raw_tag is not None:
            return
        attr_map = {k.lower(): (v if v is not None else "") for k, v in attrs if k}
        node = DomNode(tag=tag, attrs=attr_map, parent=self._current())
        self._current().children.append(node)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self._raw_tag is not None:
            if tag == self._raw_tag:
                self._raw_tag = None
            else:
                return
        if tag in VOID_TAGS:
            return
        for idx in range(len(self._stack) - 1, 0, -1):
            if self._stack[idx].tag == tag:
                del self._stack[idx:]
                return

    def handle_data(self, data: str) -> None:
        if not data:
            return
        self._current().children.append(DomNode(tag="#text", text=data, parent=self._current()))


def parse_html_dom(html_text: str) -> DomNode:
    """HTML 문자열을 `DomNode` 트리로 파싱한다."""
    builder = _DomBuilder()
    builder.feed(html_text or "")
    builder.close()
    return builder.root

