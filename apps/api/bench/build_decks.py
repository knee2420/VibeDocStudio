"""벤치마크용 덱 빌드 — 말뭉치마다 structural(LLM 없음) · enriched(agy 보강) 두 깊이.

    python bench/build_decks.py [corpus ...] [--depth structural|enriched|both] [--concurrency 4]

색인 비용(시간 · LLM 호출 · 토큰)은 `state/bench/decks/<corpus>-<depth>/deck.json` 의 usage 와
`bench/results/build.json` 에 남는다 — 질의당 절감과 비교해 "몇 번 물으면 본전인가"를 계산한다.
"""
from __future__ import annotations

import argparse
import json
import time

from common import AGY, CACHE, CORPORA, MODEL, RESULTS, SANDBOX, deck_dir, deck_id, dump

from app.resource.index.adapters import AgyCardEnricher, FileEnrichmentCache
from app.resource.index.pipeline import IndexSpec, ScopeProfile, run_index


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("corpora", nargs="*", default=list(CORPORA))
    ap.add_argument("--depth", default="both", choices=["structural", "enriched", "both"])
    ap.add_argument("--concurrency", type=int, default=4)
    args = ap.parse_args()
    depths = ["structural", "enriched"] if args.depth == "both" else [args.depth]
    summary_path = RESULTS / "build.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8")) if summary_path.exists() else {}
    cache = FileEnrichmentCache(CACHE / "enrich")
    for corpus in args.corpora:
        conf = CORPORA[corpus]
        for depth in depths:
            enricher = AgyCardEnricher(executable=AGY, model=MODEL, sandbox_dir=SANDBOX, timeout_seconds=600) if depth == "enriched" else None
            spec = IndexSpec(
                deck_id=deck_id(corpus, depth), title=conf["title"], source_paths=[str(conf["path"])], depth=depth,
                profile=ScopeProfile.from_dict(conf["profile"]), llm_concurrency=args.concurrency,
            )
            t0 = time.monotonic()

            def progress(stage, pct, detail, _c=corpus, _d=depth):
                if stage == "enrich":
                    print(f"[{_c}/{_d}] {stage} {pct:.0%} {detail}", flush=True)

            out = run_index(spec, deck_dir(corpus, depth), enricher=enricher, cache=cache, progress=progress)
            wall = round(time.monotonic() - t0, 1)
            summary[f"{corpus}-{depth}"] = {"wallSeconds": wall, "stats": out.manifest["stats"], "usage": out.usage,
                                            "quality": {k: g for k, g in out.quality["gates"].items()}}
            dump(summary_path, summary)
            print(f"[{corpus}/{depth}] done in {wall}s stats={out.manifest['stats']} usage={out.usage}", flush=True)


if __name__ == "__main__":
    main()
