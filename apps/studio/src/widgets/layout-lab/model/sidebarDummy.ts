/**
 * 사이드바 시안(A · B · C) 더미 모델 — 문서 → 장 → 구역 → 칸.
 *
 * 사이드바를 한 종류의 문서에 맞춰 짜지 않으려고 예시 문서를 셋 둔다 (sidebarScenarios.ts):
 *  - 회의록 서식 (6쪽) — 칸 위주, 결재란
 *  - 카드 상품안내장 (10쪽) — 레퍼런스를 따라 쓰고 리소스를 근거로 채움, 표 · 법정 고지
 *  - 집단 청원서 (약 280쪽) — 긴 글, 부 · 장이 수십 개, 근거 자료 수백 건, 서명부
 *
 * "채운다"는 표의 빈칸에 값 넣기만이 아니다. 레퍼런스를 따라 형식을 고치고, 물린 리소스를 근거로
 * 글을 쓰고(AI 초안), 사람이 확인하는 것까지다. 그래서 칸 상태가 여섯이다.
 */

export type SlotState =
  /** 아직 아무것도 없음 */
  | "empty"
  /** AI 가 리소스를 근거로 쓴 초안 — 사람이 확인해야 함 */
  | "draft"
  /** 초안인데 근거(리소스)가 없음 — 경고 */
  | "nocite"
  /** 레퍼런스에서 그대로 가져옴 (법정 고지 · 공통 문구) */
  | "copied"
  /** 사람이 확인함 */
  | "checked"
  /** 남이 채울 칸 (서명 · 준법 심의 등) */
  | "wait";

export type SectionForm = "info" | "text" | "table" | "list" | "sign" | "notice";

export interface SbSlot {
  id: string;
  /** 줄 이름 — 본문에 보이는 말 */
  name: string;
  /** 연결된 변수 · 칸 열쇠 (Phase 2) */
  key?: string;
  state: SlotState;
  value?: string;
  /** 근거로 쓴 리소스 id */
  cites?: string[];
  /** copied: 레퍼런스의 어디서 */
  from?: string;
  /** empty: 시제품에서 "AI 로 쓰기"를 누르면 들어갈 값과 근거 */
  sample?: string;
  sampleCites?: string[];
  /** wait: 누가 채우나 */
  waitFor?: string;
}

export interface SbSection {
  id: string;
  name: string;
  /** Phase 1 의도 한 줄 */
  intent: string;
  form: SectionForm;
  /** Phase 2 틀 이름 (꼬리 정보) */
  formLabel: string;
  slots: SbSlot[];
}

export interface SbChapter {
  id: string;
  name: string;
  /** Phase 1 카드의 요약 한 줄 */
  syn: string;
  /** Phase 2 에서 꽂은 서식 · 따라 쓴 레퍼런스 */
  template: string;
  /** 부(部) 묶음 — 긴 문서에서 장 위의 층 */
  part?: string;
  /** 이 장이 차지하는 쪽 수 */
  pages: number;
  sections: SbSection[];
}

export interface SbDoc {
  id: string;
  name: string;
  chapters: SbChapter[];
}

export interface SbSource {
  id: string;
  label: string;
  /** resource = 근거(내용), reference = 따라 쓸 대상(뼈대 · 형식 · 말투) */
  kind: "resource" | "reference";
}

export type ScenarioId = "minutes" | "card" | "petition" | "nudge";

/** 같은 작업 공간에 묶인 다른 프로젝트 (안티그래비티 · 커서의 여러 폴더 작업 공간처럼). 여기서는 읽기만 하고, 끌어서 대화 · 목차로 가져온다. */
export interface SbProject {
  id: string;
  name: string;
  /** "2008 초판" · "기획 중" 같은 한 마디 */
  note: string;
  docs: SbDoc[];
}

export interface SbScenario {
  id: ScenarioId;
  name: string;
  desc: string;
  /** 지금 쓰는 프로젝트 */
  project: string;
  /** 작업 공간 이름 — 프로젝트가 여럿일 때 */
  workspaceName?: string;
  docs: SbDoc[];
  sources: SbSource[];
  /** 같은 작업 공간의 다른 프로젝트 */
  workspace?: SbProject[];
}

/* ── 만들기 도우미 ── */

export const S = {
  ok: (id: string, name: string, value: string, cites?: string[]): SbSlot => ({ id, name, state: "checked", value, cites }),
  draft: (id: string, name: string, value: string, cites: string[]): SbSlot => ({ id, name, state: "draft", value, cites }),
  nocite: (id: string, name: string, value: string): SbSlot => ({ id, name, state: "nocite", value }),
  copy: (id: string, name: string, value: string, from: string): SbSlot => ({ id, name, state: "copied", value, from }),
  empty: (id: string, name: string, sample: string, sampleCites?: string[]): SbSlot => ({ id, name, state: "empty", sample, sampleCites }),
  wait: (id: string, name: string, waitFor: string): SbSlot => ({ id, name, state: "wait", waitFor }),
};

/* ── 찾기 (예시 문서마다 한 번 색인) ── */

export interface SbEntry {
  kind: "doc" | "chapter" | "section" | "slot";
  /** 조상 id (문서 · 장 · 구역 순) */
  anc: string[];
  doc: SbDoc;
  chapter?: SbChapter;
  section?: SbSection;
  slot?: SbSlot;
}

const cache = new WeakMap<SbScenario, Map<string, SbEntry>>();

export function indexOf(sc: SbScenario): Map<string, SbEntry> {
  const hit = cache.get(sc);
  if (hit) return hit;
  const m = new Map<string, SbEntry>();
  for (const doc of sc.docs) {
    m.set(doc.id, { kind: "doc", anc: [], doc });
    for (const chapter of doc.chapters) {
      m.set(chapter.id, { kind: "chapter", anc: [doc.id], doc, chapter });
      for (const section of chapter.sections) {
        m.set(section.id, { kind: "section", anc: [doc.id, chapter.id], doc, chapter, section });
        for (const slot of section.slots) m.set(slot.id, { kind: "slot", anc: [doc.id, chapter.id, section.id], doc, chapter, section, slot });
      }
    }
  }
  cache.set(sc, m);
  return m;
}

export interface SlotRef {
  doc: SbDoc;
  chapter: SbChapter;
  section: SbSection;
  slot: SbSlot;
}

export function allSlots(doc: SbDoc): SlotRef[] {
  return doc.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.slots.map((slot) => ({ doc, chapter, section, slot }))));
}

/** "23–31쪽" */
export function pageRange(doc: SbDoc, ch: SbChapter): string {
  let start = 1;
  for (const c of doc.chapters) {
    if (c.id === ch.id) break;
    start += c.pages;
  }
  const end = start + ch.pages - 1;
  return end > start ? `${start}–${end}쪽` : `${start}쪽`;
}

export const docPages = (doc: SbDoc) => doc.chapters.reduce((n, c) => n + c.pages, 0);
