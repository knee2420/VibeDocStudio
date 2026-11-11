"""구조 추출 → 층위 측정.

측정 자(어떤 지표를 어떻게 재나 · 어느 층위에 속하나)는 이 도메인이 갖지 않고 조립부에서 꽂는다.
같은 자로 레퍼런스와 내 글을 재야 비교가 되기 때문이다.
"""
from __future__ import annotations

from typing import Any, Callable, Iterable

MeasureFn = Callable[[Iterable[str], Iterable[str]], dict[str, Any]]
ByLayerFn = Callable[[dict[str, Any], str], list[tuple[dict[str, Any], dict[str, Any]]]]


LayoutFn = Callable[[list[dict[str, Any]]], dict[str, Any]]


class MeasuredLayerAnalyzer:
    def __init__(self, measure: MeasureFn, by_layer: ByLayerFn, layout: LayoutFn | None = None) -> None:
        self._measure = measure
        self._by_layer = by_layer
        #: 배치 자 — 사진 · 묶음 · 링크 카드 덩어리가 있는 추출(브라우저 실측)에만 쓴다
        self._layout = layout

    def analyze(self, extraction: dict[str, Any], layer_set: str) -> dict[str, Any]:
        blocks = [b for b in extraction.get("blocks") or [] if isinstance(b, dict)]
        kinds = sorted({str(b.get("kind")) for b in blocks if b.get("kind")})
        metrics = self._measure([str(b.get("html") or "") for b in blocks], kinds)
        if self._layout is not None and extraction.get("layout"):
            metrics.update(self._layout(blocks))
        layers = [
            {
                "id": layer["id"],
                "name": layer.get("name", ""),
                "question": layer.get("question", ""),
                "values": values,
                "qualitative": not layer.get("metrics"),
            }
            for layer, values in self._by_layer(metrics, layer_set)
        ]
        return {"version": 1, "set": layer_set, "metrics": metrics, "layers": layers}
