# webpage-fidelity-engine

Host-independent web page (tech blog, article, news, mobile blog) extractor, CSS/DOM normalizer, height/section paginator, and `.vdoc` document assembler.

## Package Structure

- `webpage_fidelity_engine.fetch`: Public `http(s)` fetcher with SSRF guards, charset decoding, lazy-image/hotlink asset resolver, and optional CDP browser DOM fallback.
- `webpage_fidelity_engine.extract`: Fault-tolerant HTML5 DOM tree builder, CSS style normalizer, Readability-style article isolator, and pluggable site profiles (Naver SmartEditor ONE + generic articles/news).
- `webpage_fidelity_engine.layout`: `.vdoc` block mapper (`heading`, `text`, `callout-box`, `columns-grid`, `structured-table`, `image`), Tiptap-safe HTML sanitizer, block-boundary height/heading paginator, Pillow thumbnail renderer, and `.vdoc` assembler.
- `webpage_fidelity_engine.verify`: `.vdoc` structural invariant validator and extraction quality metrics.
- `webpage_fidelity_engine.pipeline`: `run_webpage_extraction(...)` end-to-end entry facade.
- `webpage_fidelity_engine.cli`: Standalone `webpage-fidelity extract ...` CLI.

