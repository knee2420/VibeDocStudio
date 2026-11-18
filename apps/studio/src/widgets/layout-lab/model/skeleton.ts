/**
 * O7 — 뼈대 편집 실험용 데이터.
 * 섹션(Phase 1: 이름 + 의도) 안에 블록(Phase 2: 서식 부품 + 칸 스키마), 칸은 Phase 3 에서 채운다.
 * 편집은 스키마의 명령 어휘(insert_node · update_node · delete_node · move_node · indent_node · assign_template)로 남긴다.
 */
import type { FilledBy, SlotType } from "./schema";

export type PartKind = "title" | "text" | "meta" | "repeat" | "list" | "sign" | "approval" | "image" | "notice";

export interface SkSlot {
  key: string;
  label: string;
  type: SlotType;
  filledBy: FilledBy;
  aiFillable: boolean;
  sensitive?: boolean;
  value?: string;
}

export interface SkNode {
  id: string;
  kind: "section" | "block";
  name: string;
  /** Phase 1 — 여기서 말할 것 */
  intent: string;
  /** Phase 2 — 블록의 서식 부품 */
  part?: PartKind;
  /** 반복 표 · 목록의 행 수 */
  rows?: number;
  slots?: SkSlot[];
  /** AI 제안 (흐리게) */
  ghost?: boolean;
  children: SkNode[];
}

export interface SkDoc {
  id: string;
  title: string;
  purpose: string;
  /** 어디서 왔나 */
  origin: "new" | "import";
  nodes: SkNode[];
}

export const PART_LIBRARY: { kind: PartKind; label: string; desc: string }[] = [
  { kind: "title", label: "제목", desc: "문서 · 섹션 제목 (고정 글)" },
  { kind: "text", label: "글 문단", desc: "긴 글 한 칸" },
  { kind: "meta", label: "정보 표", desc: "항목 — 값 짝 (신청인 · 회의 정보)" },
  { kind: "repeat", label: "반복 표", desc: "열 정의 + 행 (교과목 · 품목)" },
  { kind: "list", label: "목록", desc: "번호 · 글머리 항목" },
  { kind: "sign", label: "날짜 · 서명", desc: "신청일 + (서명 또는 인)" },
  { kind: "approval", label: "결재란", desc: "담당 · 팀장 · 대표 칸 (기관 작성)" },
  { kind: "image", label: "이미지", desc: "사진 · 그림 칸" },
  { kind: "notice", label: "안내문", desc: "※ 유의 사항 (고정 글 → AI 규칙)" },
];

export const partLabel = (k?: PartKind) => PART_LIBRARY.find((p) => p.kind === k)?.label ?? "서식 없음";

let seq = 0;
export const newId = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

/** 데이터 키 접두어 — 섹션 이름에서 공백 · 기호를 뺀다 */
export const keyPrefix = (name: string) => name.replace(/[\s·.,()[\]/]+/g, "") || "섹션";

/** 부품을 꽂을 때 만들어지는 기본 칸 */
export function partSlots(part: PartKind, section: string): { slots: SkSlot[]; rows?: number } {
  const p = keyPrefix(section);
  const s = (label: string, type: SlotType, extra: Partial<SkSlot> = {}): SkSlot => ({
    key: `${p}.${keyPrefix(label)}`,
    label,
    type,
    filledBy: "author",
    aiFillable: true,
    ...extra,
  });
  switch (part) {
    case "title":
      return { slots: [s("제목", "text")] };
    case "text":
      return { slots: [s("본문", "longtext")] };
    case "meta":
      return { slots: [s("항목1", "text"), s("항목2", "text"), s("항목3", "text")] };
    case "repeat":
      return {
        rows: 5,
        slots: ["열1", "열2", "열3"].map((c) => ({ ...s(c, "text"), key: `${p}[].${c}` })),
      };
    case "list":
      return { rows: 3, slots: [{ ...s("항목", "text"), key: `${p}[].항목` }] };
    case "sign":
      return { slots: [s("일자", "date"), s("서명", "sign", { aiFillable: false })] };
    case "approval":
      return {
        slots: ["담당", "팀장", "대표"].map((c) => s(c, "sign", { filledBy: "agency", aiFillable: false })),
      };
    case "image":
      return { slots: [s("이미지", "image", { aiFillable: false }), s("설명", "text")] };
    case "notice":
      return { slots: [] };
  }
}

export const makeBlock = (part: PartKind, section: string, name?: string): SkNode => ({
  id: newId("b"),
  kind: "block",
  name: name ?? partLabel(part),
  intent: "",
  part,
  ...partSlots(part, section),
  children: [],
});

export const makeSection = (name = "", intent = ""): SkNode => ({ id: newId("s"), kind: "section", name, intent, children: [] });

/** 가져온 서식 — 시험 불참원 (PDF 가져오기 결과를 섹션 · 블록으로) */
function importedAbsence(): SkDoc {
  const A = "applicant" as const;
  const blk = (name: string, part: PartKind, slots: SkSlot[], rows?: number): SkNode => ({
    id: newId("b"),
    kind: "block",
    name,
    intent: "",
    part,
    slots,
    rows,
    children: [],
  });
  const sl = (key: string, label: string, type: SlotType, by: FilledBy = A, ai = true, extra: Partial<SkSlot> = {}): SkSlot => ({
    key,
    label,
    type,
    filledBy: by,
    aiFillable: ai,
    ...extra,
  });
  const sec = (name: string, intent: string, children: SkNode[]): SkNode => ({ id: newId("s"), kind: "section", name, intent, children });
  return {
    id: "doc-absence",
    title: "시험 불참원",
    purpose: "정기시험에 못 나오는 사유와 과목을 알리고 공결 확인을 받는다",
    origin: "import",
    nodes: [
      sec("머리", "문서 종류", [blk("서식 제목", "title", [sl("문서.제목", "제목", "text", "author", false, { value: "시험 불참원" })])]),
      sec("신청인", "누가 내는지", [
        blk("신청인 정보", "meta", [
          sl("신청인.학과", "학과(부)", "text"),
          sl("신청인.전공", "전공", "text"),
          sl("신청인.학번", "학번", "idno", A, false, { sensitive: true }),
          sl("신청인.학년", "학년", "choice"),
          sl("신청인.성명", "성명", "text", A, false, { sensitive: true }),
          sl("신청인.연락처", "연락처", "phone", A, false, { sensitive: true }),
        ]),
      ]),
      sec("불참 내용", "언제 · 왜 · 어느 과목", [
        blk("불참 기간 · 사유", "meta", [sl("불참.기간", "시험불참 기간", "period"), sl("불참.사유", "시험불참 사유", "longtext")]),
        blk(
          "시험 교과목",
          "repeat",
          [
            sl("교과목[].교과목명", "교과목", "text"),
            sl("교과목[].담당교수", "담당교수", "text"),
            sl("교과목[].시험일", "시험일", "date"),
            sl("교과목[].교시", "교시", "number"),
            sl("교과목[].장소확인", "시험장소 확인", "check", "approver", false),
          ],
          8,
        ),
      ]),
      sec("유의 사항", "제출 기한 · 공결 인정 사유", [blk("유의 사항", "notice", [])]),
      sec("신청 · 서명", "날짜와 서명", [blk("신청 · 서명", "sign", [sl("신청.일자", "신청일", "date"), sl("신청인.서명", "신청인 (인)", "sign", A, false)])]),
      sec("확인 · 결재", "전공주임교수 확인과 학과 결재", [
        blk("전공주임교수 확인", "sign", [sl("확인.전공주임교수", "확인 (인)", "sign", "approver", false)]),
        blk("결재란", "approval", ["담당", "주임", "과장", "처장"].map((c) => sl(`결재.${c}`, c, "sign", "agency", false))),
      ]),
    ],
  };
}

export const initialDocs = (): Record<string, SkDoc> => ({
  "doc-new": { id: "doc-new", title: "새 문서", purpose: "", origin: "new", nodes: [] },
  "doc-absence": importedAbsence(),
});

/* ───────── 트리 도우미 ───────── */

export function locate(nodes: SkNode[], id: string): { list: SkNode[]; index: number; parent: SkNode | null } | null {
  const walk = (list: SkNode[], parent: SkNode | null): ReturnType<typeof locate> => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { list, index: i, parent };
      const hit = walk(list[i].children, list[i]);
      if (hit) return hit;
    }
    return null;
  };
  return walk(nodes, null);
}

export const findSk = (nodes: SkNode[], id: string) => {
  const at = locate(nodes, id);
  return at ? at.list[at.index] : null;
};

/** a 가 b 의 조상인가 (자기 안으로 옮기기 막기) */
export function isAncestor(nodes: SkNode[], a: string, b: string): boolean {
  const n = findSk(nodes, a);
  if (!n) return false;
  const walk = (list: SkNode[]): boolean => list.some((c) => c.id === b || walk(c.children));
  return walk(n.children);
}

export interface SkRow {
  node: SkNode;
  depth: number;
  num: string;
  hasChildren: boolean;
}

/** 단계에 맞춰 펼친 줄 — Phase 1 은 섹션만 (블록은 개수로) */
export function flattenSk(nodes: SkNode[], collapsed: Record<string, boolean>, phase: 1 | 2 | 3): SkRow[] {
  const out: SkRow[] = [];
  const walk = (list: SkNode[], depth: number, prefix: string) => {
    let k = 0;
    for (const n of list) {
      if (phase === 1 && n.kind === "block") continue;
      const num = n.kind === "section" && !n.ghost ? (prefix ? `${prefix}.${++k}` : `${++k}`) : "";
      const kids = phase === 1 ? n.children.filter((c) => c.kind === "section") : n.children;
      out.push({ node: n, depth, num, hasChildren: kids.length > 0 });
      if (kids.length && !collapsed[n.id]) walk(n.children, depth + 1, num);
    }
  };
  walk(nodes, 0, "");
  return out;
}

/** 블록 채움 정도 (사람 · AI 가 쓰는 칸 중 값이 든 비율) */
export function fillOf(n: SkNode): number {
  const slots = n.kind === "block" ? (n.slots ?? []) : n.children.flatMap((c) => (c.kind === "block" ? (c.slots ?? []) : []));
  const target = slots.filter((s) => s.filledBy === "author" || s.filledBy === "applicant");
  if (!target.length) return n.part === "notice" || n.part === "title" ? 1 : 0;
  return target.filter((s) => s.value).length / target.length;
}

/** 이름으로 서식 부품 추천 (AI 서식 추천 더미) */
export function suggestPart(name: string, intent: string): PartKind {
  const t = `${name} ${intent}`;
  if (/결재/.test(t)) return "approval";
  if (/서명|신청일|날짜/.test(t)) return "sign";
  if (/사진|이미지|그림/.test(t)) return "image";
  if (/일정|목록|과제|할 일|단계|첨부|서류/.test(t)) return "list";
  if (/표|내역|품목|비교|교과목|예산/.test(t)) return "repeat";
  if (/개요|정보|신청인|담당|연락/.test(t)) return "meta";
  if (/유의|안내|주의/.test(t)) return "notice";
  return "text";
}

/** 목차 제안 (AI 더미) — 목적 키워드 또는 열어 둔 레퍼런스 뼈대로 */
export function suggestSections(purpose: string, refSkeleton?: { label: string }[]): { name: string; intent: string }[] {
  if (refSkeleton?.length) return refSkeleton.map((p) => ({ name: p.label.split(" — ")[0], intent: p.label.split(" — ")[1] ?? "레퍼런스 흐름을 따른다" }));
  if (/보도|출시|홍보/.test(purpose))
    return [
      { name: "헤드라인", intent: "한 줄로 무엇이 새로운지" },
      { name: "리드 문단", intent: "누가 · 언제 · 무엇을 · 왜" },
      { name: "주요 특징", intent: "핵심 기능 3가지" },
      { name: "인용", intent: "대표 · 담당자 한마디" },
      { name: "출시 정보", intent: "일정 · 가격 · 구매처" },
      { name: "회사 소개", intent: "보일러플레이트" },
    ];
  if (/계약/.test(purpose))
    return [
      { name: "당사자", intent: "갑 · 을 정보" },
      { name: "계약 내용", intent: "목적 · 범위 · 금액" },
      { name: "기간 · 납기", intent: "언제까지" },
      { name: "특약", intent: "필요한 조항" },
      { name: "서명", intent: "양측 서명 · 날인" },
    ];
  return [
    { name: "개요", intent: "무엇을 왜 하는지 한 문단" },
    { name: "현황", intent: "지금 상태와 숫자" },
    { name: "문제점", intent: "해결할 것" },
    { name: "해결 방안", intent: "할 일과 방법" },
    { name: "일정", intent: "단계별 기한" },
    { name: "기대 효과", intent: "바뀌는 것" },
  ];
}
