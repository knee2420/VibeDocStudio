# docstruct-engine

Host-independent document structure reconstruction engine (`DocIR` / `PageIR`) for PDF (vector, scan, hybrid) and HWPX sources.

## Architecture
- `ir/` — Canonical `PageIR` / `DocIR` Pydantic models, JSON schema, and 6 structural invariant validators.
- `acquire/` — Vector text/ruling extraction (reusing `pdf_fidelity_engine`), figure image export, rendering, and local OCR port (`Windows.Media.Ocr`).
- `tables/` — Vector ruling candidate proposals, grid snap, word assignment, style propagation, cross-page continuation, HTML <-> IR conversion, and geometric reconciliation.
- `blocks/` — Span-aware line reflow, list marker & hanging indent detection, field classification, and reading order sorting.
- `verify/` — Ruling F1, self-contained Zhang-Shasha TEDS/TEDS-S, reading-order NED, field F1, and diagnostic reporting.
- `reread/` — Targeted reread planning (low OCR confidence / invariant & line gaps) and merge application.
- `eval/` — Local evaluation harness manifest & runner (`paths.local.json` is gitignored).

