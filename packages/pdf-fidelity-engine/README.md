# pdf-fidelity-engine

Host-independent PDF form truth extractor, GDI/HWP char-level text normalizer,
dashed-rule table grid builder, clean slot HTML emitter, selective VLM slot text
refiner port (`SlotTextRefinerPort`), and visual parity verifier.

## Package Structure

- `pdf_fidelity_engine.fonts`: Font decoding (CP949/GDI hash subset inference, `/ToUnicode` detection) & TTF metrics / token letter-spacing solver.
- `pdf_fidelity_engine.extract`: `rawdict` `CharAtom` normalizer (4x Faux-Bold dedup + `bold=True` promotion, strict `(baseline, x0)` sort to fix `-Td` backtracking, gap space restoration) & `truth.json` extractor.
- `pdf_fidelity_engine.layout`: Dashed-rule stitcher (`0.6px+` segments -> table dividers), heading underline matcher, cell fill shading mapper, zone planner, and clean slot HTML renderer.
- `pdf_fidelity_engine.refine`: `detect_suspect_slots` (missing `/ToUnicode`, PUA/CJK anomalies, unspaced runs) & `apply_slot_patches` (boundary-invariant HTML text replacement).
- `pdf_fidelity_engine.verify`: Image parity (`ink_f1_1px`, MuPDF vs PDFium noise floor), CDP browser measurer, and `L-xx` diagnostic prescriber.
- `pdf_fidelity_engine.pipeline`: `run_fidelity_extraction(...)` end-to-end single-page facade.
- `pdf_fidelity_engine.cli`: Standalone `pdf-fidelity extract|render|measure|verify` CLI.
