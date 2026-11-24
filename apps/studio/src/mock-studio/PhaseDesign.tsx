import React from "react";
import { Plus } from "lucide-react";

import { A4Page } from "./A4Page";
import { BLOCK_SHELF, BRANDS, FORMATS, REFS, UNIT_NAME } from "./data";
import { Panel } from "./Panel";
import { livePages, useMock } from "./store";

/**
 * ② 서식 — 편집실. 뼈대(쪽)는 그대로, 쪽마다 블록 자리를 잡고 브랜드 · 판형을 정한다.
 *  왼쪽: 쪽 (작은 A4) · 가운데: 고른 쪽의 자리 (와이어프레임 ↔ 미리보기) · 오른쪽: 서식 서랍
 */
export const PhaseDesign: React.FC = () => {
  const pageOn = useMock((s) => s.pageOn);
  const pageId = useMock((s) => s.page);
  const goPage = useMock((s) => s.goPage);
  const [preview, setPreview] = React.useState(false);
  const pages = livePages(pageOn);
  const page = pages.find((p) => p.id === pageId) ?? pages[0];

  return (
    <div className="absolute inset-0 p-3 grid grid-cols-[232px_1fr_320px] gap-3" data-testid="mock-design">
      <Panel title="쪽" right={<span className="text-[11.5px] text-[#8b857c]">A4 · {pages.length}쪽</span>}>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
          {pages.map((p) => (
            <button key={p.id} type="button" onClick={() => goPage(p.id)} className={`rounded-[12px] p-2 flex gap-2.5 items-start text-left ${p.id === page.id ? "bg-[#1c1b1a] text-white" : "hover:bg-[#f1ede6]"}`} data-testid="mock-design-page">
              <A4Page page={p} total={pages.length} mode="wire" scale={0.09} />
              <span className="min-w-0 pt-0.5">
                <span className={`block text-[11px] tabular-nums ${p.id === page.id ? "text-white/60" : "text-[#a39c91]"}`}>{p.no}쪽</span>
                <span className="block text-[13px] font-bold leading-[18px]">{p.title}</span>
                <span className={`block text-[11px] ${p.id === page.id ? "text-white/60" : "text-[#a39c91]"}`}>블록 {p.blocks.length}</span>
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <div className="min-h-0 rounded-[16px] bg-[#e8e4dd] border border-[#ddd8cf] flex flex-col">
        <div className="h-12 shrink-0 px-4 flex items-center justify-between">
          <span className="text-[13px] font-bold">
            {page.no}쪽 · {page.title} <span className="font-normal text-[#8b857c]">— {page.intent}</span>
          </span>
          <div className="flex p-0.5 rounded-[10px] bg-[#d9d4cb]" role="group">
            {[
              ["자리", false],
              ["미리보기", true],
            ].map(([label, v]) => (
              <button key={String(label)} type="button" onClick={() => setPreview(v as boolean)} className={`h-7 px-3 rounded-[8px] text-[12px] ${preview === v ? "bg-white font-bold shadow-sm" : "text-[#6f695f]"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto flex justify-center pb-24 pt-2">
          <A4Page page={page} total={pages.length} mode={preview ? "print" : "wire"} scale={0.72} onPick={(id) => goPage(page.id, id)} />
        </div>
      </div>

      <Drawer unit={page.unit} />
    </div>
  );
};

const Drawer: React.FC<{ unit: keyof typeof UNIT_NAME }> = ({ unit }) => {
  const brand = useMock((s) => s.brand);
  const format = useMock((s) => s.format);
  const setBrand = useMock((s) => s.setBrand);
  const setFormat = useMock((s) => s.setFormat);
  const say = useMock((s) => s.say);
  return (
    <Panel title="서식 서랍" testId="mock-drawer">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-5">
        <section>
          <h3 className="text-[12px] font-bold text-[#6f695f] mb-2">브랜드 색 — 강조 하나 + 옅은 색 하나</h3>
          <div className="grid grid-cols-3 gap-2">
            {BRANDS.map((b) => (
              <button key={b.id} type="button" onClick={() => setBrand(b.id)} className={`rounded-[12px] border p-2 text-left ${brand === b.id ? "border-[#1c1b1a] ring-2 ring-[#1c1b1a]/10" : "border-[#e6e2db]"}`} data-testid={`mock-brand-${b.id}`}>
                <span className="flex gap-1">
                  <span className="w-6 h-6 rounded-full" style={{ background: b.main }} />
                  <span className="w-6 h-6 rounded-full border border-[#eee]" style={{ background: b.soft }} />
                </span>
                <span className="block text-[11.5px] font-semibold mt-1.5">{b.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-[12px] font-bold text-[#6f695f] mb-2">판형</h3>
          <div className="flex flex-col gap-2">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFormat(f.id)} className={`rounded-[12px] border px-3 py-2.5 text-left ${format === f.id ? "border-[#1c1b1a] bg-white" : "border-[#e6e2db]"}`}>
                <span className="block text-[13px] font-bold">{f.name}</span>
                <span className="block text-[11.5px] text-[#8b857c]">{f.note}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-[12px] font-bold text-[#6f695f] mb-2">블록 서랍 — 눌러서 이 쪽에 넣기</h3>
          <div className="grid grid-cols-2 gap-2">
            {BLOCK_SHELF.map((b) => (
              <button key={b.kind} type="button" onClick={() => say(`'${b.name}'을 고른 자리 뒤에 넣었어요 (목업)`)} className="rounded-[12px] border border-[#e6e2db] bg-white px-3 py-2.5 text-left hover:border-[#1c1b1a]">
                <span className="flex items-center gap-1 text-[12.5px] font-bold">
                  <Plus className="w-3 h-3" />
                  {b.name}
                </span>
                <span className="block text-[11px] text-[#8b857c] mt-0.5">{b.hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-[12px] font-bold text-[#6f695f] mb-2">다른 카드사는 이 쪽({UNIT_NAME[unit]})을</h3>
          <div className="rounded-[12px] border border-[#e6e2db] bg-white divide-y divide-[#f0ece5]">
            {REFS.map((r) => (
              <div key={r.id} className="px-3 py-2 flex gap-2">
                <span className="w-1 rounded-full shrink-0" style={{ background: r.tone }} />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold">{r.product}</span>
                  <span className={`block text-[11.5px] ${r.units[unit] ? "text-[#6f695f]" : "text-[#c9c2b7]"}`}>{r.units[unit] ?? "없음"}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Panel>
  );
};
