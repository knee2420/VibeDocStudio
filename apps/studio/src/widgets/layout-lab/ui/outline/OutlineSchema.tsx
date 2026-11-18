import React from "react";
import {
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Landmark,
  Lock,
  PenLine,
  Repeat,
  ScrollText,
  Sparkles,
  Stamp,
  User,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { aiView, schemaOf, SCHEMAS, type FilledBy, type GroupKind, type SchemaGroup, type SchemaSlot, type SlotType } from "../../model/schema";
import { useLabStore } from "../../model/useLabStore";
import { focusCanvas } from "./OutlineParts";

/** 데이터 키 글꼴 — 영문은 고정폭, 한글은 Pretendard 로 (시스템 고정폭 한글은 어색하다) */
const KEY_FONT: React.CSSProperties = { fontFamily: 'ui-monospace, "SF Mono", Consolas, "Pretendard", "Malgun Gothic", monospace' };

const GROUP_ICON: Record<GroupKind, LucideIcon> = {
  fields: FileText,
  repeat: Repeat,
  fixed: ScrollText,
  sign: PenLine,
  approval: Stamp,
  image: ImageIcon,
};
const GROUP_LABEL: Record<GroupKind, string> = { fields: "입력 칸", repeat: "반복 행", fixed: "고정 글 → AI 규칙", sign: "서명", approval: "확인 · 결재", image: "이미지" };

const TYPE_LABEL: Record<SlotType, string> = {
  text: "글",
  longtext: "긴 글",
  date: "날짜",
  period: "기간",
  number: "숫자",
  phone: "전화",
  idno: "번호",
  choice: "선택",
  check: "확인",
  sign: "서명",
  image: "이미지",
};

const BY: Record<FilledBy, { label: string; icon: LucideIcon; cls: string }> = {
  applicant: { label: "신청인", icon: User, cls: "bg-[#eef6ff] text-[#1f6fd1]" },
  author: { label: "작성자", icon: User, cls: "bg-[#eef6ff] text-[#1f6fd1]" },
  agency: { label: "기관", icon: Building2, cls: "bg-[#eef0f4] text-[#4b5563]" },
  approver: { label: "결재자", icon: UserCheck, cls: "bg-[#f3eefe] text-[#7a3bd6]" },
};

/** 칸 한 줄 — 데이터 키 · 타입 · 누가 · AI 권한 · 값/빈칸 (미리보기 땐 AI 가 넣을 값 + 근거) */
const SlotRow: React.FC<{ slot: SchemaSlot; group: SchemaGroup; preview: boolean; selected: boolean; onSelect: () => void }> = ({ slot, group, preview, selected, onSelect }) => {
  const by = BY[slot.filledBy];
  const willFill = preview && slot.aiFillable && !slot.value && slot.aiSample;
  return (
    <div
      data-testid="o6-slot"
      data-key={slot.key}
      onClick={onSelect}
      className={`mx-1.5 pl-6 pr-1.5 py-1 rounded-md cursor-default ${selected ? "bg-[var(--fig-selected)]" : "hover:bg-[var(--fig-hover)]"} ${preview && !slot.aiFillable ? "opacity-55" : ""}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <code style={KEY_FONT} className=" text-[11px] text-[var(--fig-text)] truncate" title={slot.label}>{slot.key}</code>
        {slot.required && <span className="text-[#e5484d] text-[11px]" title="필수">*</span>}
        <span className="ml-auto flex items-center gap-1 shrink-0">
          <span className="px-1 rounded text-[9.5px] leading-4 bg-black/[0.05] text-[var(--fig-text-secondary)]">{TYPE_LABEL[slot.type]}</span>
          <span className={`px-1 rounded text-[9.5px] leading-4 inline-flex items-center gap-0.5 ${by.cls}`}>
            <by.icon className="w-2.5 h-2.5" />
            {by.label}
          </span>
          {slot.aiFillable ? (
            <Sparkles className="w-3 h-3 text-[#9747ff]" aria-label="AI 가능" />
          ) : (
            <Lock className={`w-3 h-3 ${slot.sensitive ? "text-[#b26b00]" : "text-[var(--fig-text-tertiary)]"}`} aria-label={slot.sensitive ? "민감정보 — AI 금지" : "AI 금지"} />
          )}
        </span>
      </div>
      <div className="text-[11px] leading-4 truncate mt-0.5">
        {willFill ? (
          <span className="text-[#7a3bd6]">
            {slot.aiSample}
            {slot.evidence?.length ? <span className="text-[#0f9d58]"> · 근거 {slot.evidence.join(", ")}</span> : null}
          </span>
        ) : slot.value ? (
          <span className="text-[var(--fig-text-secondary)]">
            {slot.value}
            {slot.evidence?.length ? <span className="text-[#0f9d58]"> · 근거 {slot.evidence.length}</span> : null}
          </span>
        ) : (
          <span className="text-[var(--fig-text-tertiary)]">
            {slot.label} — {slot.sensitive ? "사람이 직접" : slot.filledBy === "agency" ? "기관이 씀" : slot.filledBy === "approver" ? "결재자가 씀" : slot.guide ? `빈칸 (${slot.guide})` : "빈칸"}
          </span>
        )}
      </div>
    </div>
  );
};

/** 내보내기 매핑 — 같은 키가 HWPX · DOCX · PDF 필드 이름이 된다 (보고서 매핑표) */
const MappingView: React.FC<{ slot: SchemaSlot | null; group: SchemaGroup | null }> = ({ slot, group }) => {
  if (!slot || !group) return <p className="p-3 text-[11.5px] text-[var(--fig-text-tertiary)]">칸을 고르면 그 데이터 키가 각 파일 형식에서 어떤 필드가 되는지 보입니다.</p>;
  const hwpType = slot.type === "check" ? "양식 개체 CHECKBUTTON" : slot.type === "choice" ? "양식 개체 COMBOBOX" : slot.type === "sign" || slot.type === "image" ? "그림 칸 (서명 앵커)" : group.repeat ? "표 셀 Name (반복 행)" : "누름틀 Clickhere";
  const docxType = slot.type === "date" ? "date" : slot.type === "check" ? "checkbox" : slot.type === "choice" ? "dropDownList" : slot.type === "sign" || slot.type === "image" ? "picture" : slot.type === "longtext" ? "richText" : "text";
  const pdfType = slot.type === "check" ? "Btn" : slot.type === "choice" ? "Ch" : slot.type === "sign" ? "Sig" : "Tx";
  const rows: [string, string, string][] = [
    ["HWPX", group.repeat ? `셀 Name = ${slot.key.replace("[]", "[1]")}` : `누름틀 name = ${slot.key}`, `${hwpType}${slot.guide ? ` · 안내문 "${slot.guide}"` : ""}`],
    ["DOCX", `w:tag = ${slot.key}`, `w:alias = ${slot.label} · ${docxType}${group.repeat ? " · repeatingSection" : ""}`],
    ["PDF", `/T = ${slot.key.replace("[]", ".0")}`, `/TU = ${slot.label} · /FT ${pdfType}${slot.required ? " · /Ff 필수" : ""}${!slot.aiFillable && slot.filledBy !== "applicant" ? " · 읽기 전용" : ""}`],
  ];
  return (
    <div className="p-3 space-y-2" data-testid="o6-mapping">
      <div className="flex items-center gap-1.5">
        <code style={KEY_FONT} className=" text-[12px] font-semibold">{slot.key}</code>
        <span className="text-[11px] text-[var(--fig-text-secondary)]">({slot.label})</span>
      </div>
      <table className="w-full text-[11px] border-collapse">
        <tbody>
          {rows.map(([f, name, more]) => (
            <tr key={f} className="border-t border-[var(--fig-border)] align-top">
              <td className="py-1 pr-2 font-semibold w-12">{f}</td>
              <td className="py-1">
                <code style={KEY_FONT} className=" text-[10.5px] block">{name}</code>
                <span className="text-[10.5px] text-[var(--fig-text-tertiary)]">{more}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-[10.5px] text-[var(--fig-text-secondary)] leading-4">
        권한 · <b>{BY[slot.filledBy].label}</b> 이 씀 · AI {slot.aiFillable ? "채움 가능" : slot.sensitive ? "금지 (민감정보)" : "금지"}
        {slot.evidence?.length ? <> · 근거 {slot.evidence.join(", ")}</> : null}
      </div>
    </div>
  );
};

/** O6 — 예스폼식 서식 데이터 스키마: 서식 카드 + 데이터 키 칸 + AI 가 보는 JSON + 내보내기 매핑 */
export const OutlineO6: React.FC = () => {
  const activePage = useLabStore((s) => s.activePage);
  const setPage = useLabStore((s) => s.setPage);
  const say = useLabStore((s) => s.say);
  const schema = schemaOf(activePage) ?? SCHEMAS[1];
  const [preview, setPreview] = React.useState(false);
  const [cardOpen, setCardOpen] = React.useState(true);
  const [tab, setTab] = React.useState<"json" | "map">("json");
  const [sel, setSel] = React.useState<{ g: string; k: string } | null>(null);
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const { meta } = schema;

  const slots = schema.groups.flatMap((g) => g.slots);
  const ai = slots.filter((s) => s.aiFillable).length;
  const human = slots.filter((s) => !s.aiFillable && (s.filledBy === "applicant" || s.filledBy === "author")).length;
  const office = slots.filter((s) => s.filledBy === "agency" || s.filledBy === "approver").length;
  const rules = schema.groups.flatMap((g) => g.rules ?? []).length;
  const selGroup = sel ? schema.groups.find((g) => g.id === sel.g) ?? null : null;
  const selSlot = selGroup?.slots.find((s) => s.key === sel?.k) ?? null;

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="outline-o6">
      {/* 서식 고르기 (스키마가 있는 쪽) */}
      <div className="px-2 pt-2 pb-1.5 flex gap-1 overflow-x-auto shrink-0">
        {SCHEMAS.map((s, i) => (
          <button
            key={s.pageId}
            type="button"
            data-testid={`o6-page-${s.pageId}`}
            onClick={() => {
              setPage(s.pageId);
              setSel(null);
              document.getElementById(`lab-page-${s.pageId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={`shrink-0 h-6 px-2 rounded-md text-[11px] border ${schema.pageId === s.pageId ? "bg-[var(--fig-selected)] border-[var(--fig-brand)]/40" : "border-[var(--fig-border)] text-[var(--fig-text-secondary)] hover:bg-[var(--fig-hover)]"}`}
          >
            {["1", "6", "7"][i]}쪽 · {s.meta.title.length > 10 ? `${s.meta.title.slice(0, 10)}…` : s.meta.title}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* 서식 카드 — 상품 메타 + 법정 메타 */}
        <div className="mx-2 mb-2 rounded-lg border border-[var(--fig-border)] bg-white" data-testid="o6-card">
          <button type="button" onClick={() => setCardOpen((o) => !o)} className="w-full px-2.5 pt-2 pb-1.5 text-left">
            <div className="flex items-center gap-1 text-[10.5px] text-[var(--fig-text-tertiary)]">
              {cardOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {meta.categoryPath.map((c) => (
                <span key={c.code} className="after:content-['›'] after:mx-1 last:after:content-['']" title={c.code}>{c.name}</span>
              ))}
            </div>
            <div className="font-semibold text-[13px] mt-0.5">{meta.title}</div>
            <code style={KEY_FONT} className=" text-[10px] text-[var(--fig-text-tertiary)]">{meta.id} · {meta.categoryPath[meta.categoryPath.length - 1].code}</code>
          </button>
          {cardOpen && (
            <div className="px-2.5 pb-2.5 space-y-2 text-[11px]">
              <div className="flex flex-wrap gap-1">
                {meta.facets.map((f) => (
                  <code key={f} className="font-mono text-[10px] px-1 rounded bg-[#f3eefe] text-[#7a3bd6]">{f}</code>
                ))}
                {meta.tags.map((t) => (
                  <span key={t} className="text-[10px] px-1 rounded bg-black/[0.05] text-[var(--fig-text-secondary)]">#{t}</span>
                ))}
              </div>
              <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-0.5">
                <dt className="text-[var(--fig-text-tertiary)]">목적·용도</dt>
                <dd>{meta.purpose}</dd>
                <dt className="text-[var(--fig-text-tertiary)]">분량·등급</dt>
                <dd>{meta.extent} · {meta.tier === "free" ? "무료" : meta.tier}</dd>
                <dt className="text-[var(--fig-text-tertiary)]">형식</dt>
                <dd>{meta.formats.join(" · ")}</dd>
                <dt className="text-[var(--fig-text-tertiary)]">출처</dt>
                <dd>{meta.origin}</dd>
              </dl>
              {meta.legal && (
                <div className="rounded-md border border-[#c9d7f2] bg-[#f5f8ff] p-2" data-testid="o6-legal">
                  <div className="flex items-center gap-1 font-semibold text-[#2f4a8a]">
                    <Landmark className="w-3.5 h-3.5" />법정 서식 · {meta.legal.formNo}
                  </div>
                  <dl className="grid grid-cols-[56px_1fr] gap-x-2 gap-y-0.5 mt-1 text-[10.5px]">
                    <dt className="text-[var(--fig-text-tertiary)]">근거 법령</dt>
                    <dd>{meta.legal.law}</dd>
                    <dt className="text-[var(--fig-text-tertiary)]">소관</dt>
                    <dd>{meta.legal.ministry}</dd>
                    <dt className="text-[var(--fig-text-tertiary)]">개정</dt>
                    <dd>{meta.legal.revision}</dd>
                  </dl>
                  <div className="mt-1 text-[10.5px] text-[#0f9d58] flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />서식 전체의 기본 근거 · {meta.legal.detailUrl}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 칸 요약 + AI 채우기 미리보기 */}
        <div className="px-3 pb-1.5 flex items-center gap-2 flex-wrap text-[11px]" data-testid="o6-stats">
          <span>칸 {slots.length}</span>
          <span className="text-[#7a3bd6]">AI 가능 {ai}</span>
          <span className="text-[#b26b00]">사람만 {human}</span>
          <span className="text-[var(--fig-text-secondary)]">기관·결재 {office}</span>
          <span className="text-[var(--fig-text-tertiary)]">규칙 {rules}</span>
          <button
            type="button"
            data-testid="o6-preview"
            aria-pressed={preview}
            onClick={() => setPreview((p) => !p)}
            className={`ml-auto h-6 px-2 rounded-md text-[11px] inline-flex items-center gap-1 border ${preview ? "bg-[#9747ff] text-white border-[#9747ff]" : "border-[#9747ff]/40 text-[#7a3bd6] hover:bg-[#9747ff]/10"}`}
          >
            <Sparkles className="w-3 h-3" />AI 채우기 미리보기
          </button>
        </div>

        {/* 묶음 → 칸 */}
        <div className="border-t border-[var(--fig-border)] py-1">
          {schema.groups.map((g) => {
            const Icon = GROUP_ICON[g.kind];
            const collapsed = open[g.id] === false;
            return (
              <div key={g.id} data-testid="o6-group" data-group={g.id}>
                <div
                  className="fig-row !h-7 gap-1.5"
                  onClick={() => {
                    setOpen((o) => ({ ...o, [g.id]: collapsed }));
                    focusCanvas(g.anchor);
                  }}
                >
                  {g.slots.length || g.rules?.length ? (
                    collapsed ? <ChevronRight className="w-3 h-3 ml-1 text-[var(--fig-text-tertiary)]" /> : <ChevronDown className="w-3 h-3 ml-1 text-[var(--fig-text-tertiary)]" />
                  ) : (
                    <span className="w-3 ml-1" />
                  )}
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${g.kind === "fixed" ? "text-[var(--fig-text-tertiary)]" : "text-[var(--fig-text-secondary)]"}`} />
                  <span className={`fig-row-label ${g.kind === "fixed" ? "text-[var(--fig-text-secondary)]" : "font-semibold"}`}>{g.name}</span>
                  {g.repeat && <code style={KEY_FONT} className=" text-[10px] px-1 rounded bg-black/[0.05] shrink-0">{g.repeat.key} × {g.repeat.rows}</code>}
                  <span className="text-[10px] text-[var(--fig-text-tertiary)] shrink-0">{GROUP_LABEL[g.kind]}</span>
                </div>
                {!collapsed && (
                  <>
                    {g.rules?.map((r) => (
                      <div key={r} className="mx-1.5 pl-6 pr-2 py-0.5 text-[10.5px] leading-4 text-[var(--fig-text-secondary)] flex gap-1">
                        <ScrollText className="w-3 h-3 mt-0.5 shrink-0 text-[var(--fig-text-tertiary)]" />
                        <span>{r}</span>
                      </div>
                    ))}
                    {g.slots.map((s) => (
                      <SlotRow
                        key={s.key}
                        slot={s}
                        group={g}
                        preview={preview}
                        selected={sel?.g === g.id && sel.k === s.key}
                        onSelect={() => {
                          setSel({ g: g.id, k: s.key });
                          setTab("map");
                          focusCanvas(g.anchor);
                        }}
                      />
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
        {preview && (
          <div className="mx-2 my-2 p-2 rounded-md bg-[#9747ff]/[0.06] text-[11px] leading-4 text-[#5b2bb0]">
            AI 는 보라색 칸만 채웁니다 (근거 자료 표시). 자물쇠 칸 — 민감정보 · 서명 · 기관/결재 — 은 건드리지 않습니다.
            <button type="button" className="fig-btn !h-5 ml-2" onClick={() => say(`AI 가 ${slots.filter((s) => s.aiFillable && !s.value && s.aiSample).length}칸을 변경안으로 올렸다고 가정합니다 (더미)`)}>
              변경안으로 올리기
            </button>
          </div>
        )}
      </div>

      {/* 아래: AI 가 보는 스키마 · 내보내기 매핑 */}
      <div className="h-[34%] min-h-[180px] shrink-0 border-t border-[var(--fig-border)] flex flex-col bg-[#fcfcfd]">
        <div className="h-8 px-2 flex items-center gap-1 border-b border-[var(--fig-border)] bg-white">
          <button type="button" className="fig-tab !h-8" aria-selected={tab === "json"} onClick={() => setTab("json")} data-testid="o6-tab-json">
            AI 가 보는 스키마
          </button>
          <button type="button" className="fig-tab !h-8" aria-selected={tab === "map"} onClick={() => setTab("map")} data-testid="o6-tab-map">
            내보내기 매핑
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {tab === "json" ? (
            <pre style={KEY_FONT} className="p-2 text-[10px] leading-[15px] whitespace-pre text-[var(--fig-text)]" data-testid="o6-json">
              {JSON.stringify(aiView(schema), null, 1)}
            </pre>
          ) : (
            <MappingView slot={selSlot} group={selGroup} />
          )}
        </div>
      </div>
    </div>
  );
};
