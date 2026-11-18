import type { SbChapter, SbDoc, SbSection, SbSlot } from "./sidebarDummy";

/**
 * 목차 구조 고치기 — 순수 함수. 문서 배열을 받아 새 배열을 돌려준다 (실패하면 null).
 * 층은 둘: 장(chapter) · 구역(section). 칸(slot)은 목차가 아니라 구역 속 내용이라 여기서 옮기지 않는다.
 */

let seq = 0;
export const newId = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

type Loc = { d: SbDoc; ci: number; si?: number };

function locate(docs: SbDoc[], id: string): Loc | null {
  for (const d of docs)
    for (let ci = 0; ci < d.chapters.length; ci++) {
      const ch = d.chapters[ci];
      if (ch.id === id) return { d, ci };
      const si = ch.sections.findIndex((s) => s.id === id);
      if (si >= 0) return { d, ci, si };
    }
  return null;
}

/** 고칠 문서만 복사 (나머지는 그대로 공유) */
function edit(docs: SbDoc[], id: string, fn: (d: SbDoc, loc: Loc) => boolean | void): SbDoc[] | null {
  const loc = locate(docs, id);
  if (!loc) return null;
  const d = structuredClone(loc.d);
  const ok = fn(d, { ...loc, d });
  if (ok === false) return null;
  return docs.map((x) => (x.id === d.id ? d : x));
}

export const blankChapter = (part?: string): SbChapter => ({ id: newId("ch"), name: "", syn: "", template: "새 장", part, pages: 1, sections: [] });
export const blankSection = (): SbSection => ({ id: newId("sec"), name: "", intent: "", form: "text", formLabel: "본문", slots: [] });

export function rename(docs: SbDoc[], id: string, name: string) {
  return edit(docs, id, (d, { ci, si }) => {
    if (si === undefined) d.chapters[ci].name = name;
    else d.chapters[ci].sections[si].name = name;
  });
}

/** 같은 층 바로 뒤에 빈 줄. 문서 id 를 주면 맨 끝에 장. */
export function addAfter(docs: SbDoc[], id: string): { docs: SbDoc[]; id: string } | null {
  const doc = docs.find((d) => d.id === id);
  if (doc) {
    const ch = blankChapter(doc.chapters.at(-1)?.part);
    return { docs: docs.map((d) => (d.id === id ? { ...d, chapters: [...d.chapters, ch] } : d)), id: ch.id };
  }
  let made = "";
  const next = edit(docs, id, (d, { ci, si }) => {
    if (si === undefined) {
      const ch = blankChapter(d.chapters[ci].part);
      d.chapters.splice(ci + 1, 0, ch);
      made = ch.id;
    } else {
      const s = blankSection();
      d.chapters[ci].sections.splice(si + 1, 0, s);
      made = s.id;
    }
  });
  return next ? { docs: next, id: made } : null;
}

/** 장 안 맨 끝에 구역 */
export function addChild(docs: SbDoc[], chapterId: string): { docs: SbDoc[]; id: string } | null {
  let made = "";
  const next = edit(docs, chapterId, (d, { ci, si }) => {
    if (si !== undefined) return false;
    const s = blankSection();
    d.chapters[ci].sections.push(s);
    made = s.id;
  });
  return next ? { docs: next, id: made } : null;
}

export function remove(docs: SbDoc[], id: string) {
  return edit(docs, id, (d, { ci, si }) => {
    if (si === undefined) d.chapters.splice(ci, 1);
    else d.chapters[ci].sections.splice(si, 1);
  });
}

/** Tab: 장 → 바로 위 장의 마지막 구역이 된다 (자기 구역들도 뒤따라 들어간다). 구역은 더 들일 곳이 없다. */
export function indent(docs: SbDoc[], id: string) {
  return edit(docs, id, (d, { ci, si }) => {
    if (si !== undefined || ci === 0) return false;
    const ch = d.chapters[ci];
    const prev = d.chapters[ci - 1];
    const asSection: SbSection = { id: ch.id, name: ch.name, intent: ch.syn, form: "text", formLabel: "본문", slots: [] };
    prev.sections.push(asSection, ...ch.sections);
    prev.pages += ch.pages;
    d.chapters.splice(ci, 1);
  });
}

/** Shift+Tab: 구역 → 부모 장 바로 뒤의 장이 된다. 뒤따르던 형제 구역들은 새 장 밑으로 따라간다 (아웃라이너 방식). */
export function outdent(docs: SbDoc[], id: string) {
  return edit(docs, id, (d, { ci, si }) => {
    if (si === undefined) return false;
    const parent = d.chapters[ci];
    const [sec, ...rest] = parent.sections.splice(si);
    const ch: SbChapter = {
      id: sec.id,
      part: parent.part,
      name: sec.name,
      syn: sec.intent,
      template: parent.template,
      pages: 1,
      // 구역 자신의 칸은 "본문" 구역으로 남긴다
      sections: [...(sec.slots.length ? [{ ...sec, id: newId("sec"), name: "본문" }] : []), ...rest],
    };
    d.chapters.splice(ci + 1, 0, ch);
  });
}

/** Alt+↑↓: 같은 층 안에서 한 칸 */
export function move(docs: SbDoc[], id: string, dir: -1 | 1) {
  return edit(docs, id, (d, { ci, si }) => {
    const list: (SbChapter | SbSection)[] = si === undefined ? d.chapters : d.chapters[ci].sections;
    const i = si === undefined ? ci : si;
    const j = i + dir;
    if (j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j], list[i]];
    // 장을 부 경계 너머로 옮기면 자리를 바꾼 장의 부를 따른다
    if (si === undefined) d.chapters[j].part = d.chapters[i].part;
  });
}

/** 끌어 놓기: 장 ↔ 장 (앞 · 뒤), 구역 → 구역 (앞 · 뒤, 다른 장으로도), 구역 → 장 (안 맨 끝) */
export function moveTo(docs: SbDoc[], dragId: string, targetId: string, pos: "before" | "after" | "inside") {
  if (dragId === targetId) return null;
  const from = locate(docs, dragId);
  const to = locate(docs, targetId);
  if (!from || !to || from.d.id !== to.d.id) return null;
  const d = structuredClone(from.d);
  if (from.si === undefined) {
    if (to.si !== undefined || pos === "inside") return null;
    const [ch] = d.chapters.splice(from.ci, 1);
    const ti = d.chapters.findIndex((c) => c.id === targetId);
    ch.part = d.chapters[ti].part;
    d.chapters.splice(pos === "before" ? ti : ti + 1, 0, ch);
  } else {
    const [sec] = d.chapters[from.ci].sections.splice(from.si, 1);
    const t = locate([d], targetId);
    if (!t) return null;
    if (t.si === undefined) d.chapters[t.ci].sections.push(sec);
    else d.chapters[t.ci].sections.splice(pos === "before" ? t.si : t.si + 1, 0, sec);
  }
  return docs.map((x) => (x.id === d.id ? d : x));
}

/**
 * 다른 프로젝트의 장을 내 목차로 가져오기 — 새 id, 칸은 "레퍼런스 그대로"(어디서 왔는지 남김).
 * 그대로 두지 않고 고쳐 쓰는 것이 목적이라, 줄 이름 옆에 출처를 요약으로 단다.
 */
export function importChapter(
  docs: SbDoc[],
  src: SbChapter,
  fromLabel: string,
  targetId: string,
  pos: "before" | "after",
): { docs: SbDoc[]; id: string } | null {
  const copy: SbChapter = {
    ...structuredClone(src),
    id: newId("ch"),
    syn: `← ${fromLabel}에서 가져옴 · ${src.syn}`,
    template: `레퍼런스 · ${fromLabel}`,
    sections: src.sections.map((s) => ({
      ...structuredClone(s),
      id: newId("sec"),
      slots: s.slots.map(
        (x): SbSlot => ({ id: newId("slot"), name: x.name, state: "copied", value: x.value ?? x.sample ?? "", from: fromLabel }),
      ),
    })),
  };
  const doc = docs.find((d) => d.id === targetId);
  if (doc) {
    copy.part = doc.chapters.at(-1)?.part;
    return { docs: docs.map((d) => (d.id === targetId ? { ...d, chapters: [...d.chapters, copy] } : d)), id: copy.id };
  }
  const next = edit(docs, targetId, (d, { ci, si }) => {
    copy.part = d.chapters[ci].part;
    d.chapters.splice(si === undefined && pos === "before" ? ci : ci + 1, 0, copy);
  });
  return next ? { docs: next, id: copy.id } : null;
}

/** AI 대화에서 제안한 구역들을 장 끝에 넣기 */
export function addSections(docs: SbDoc[], chapterId: string, items: { name: string; intent: string; sample: string; cites?: string[] }[]) {
  return edit(docs, chapterId, (d, { ci, si }) => {
    if (si !== undefined) return false;
    for (const it of items)
      d.chapters[ci].sections.push({
        ...blankSection(),
        name: it.name,
        intent: it.intent,
        slots: [{ id: newId("slot"), name: "요지", state: "empty", sample: it.sample, sampleCites: it.cites }],
      });
  });
}
