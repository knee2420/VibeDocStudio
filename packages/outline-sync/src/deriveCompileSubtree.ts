/**
 * 컴파일 분리 사양 (Non-Destructive Subtree Compile + Default Structure Tags).
 *
 * 원칙:
 * 1) 사용자가 불릿(들)을 선택해 `.vdoc` 로 승격할 때 원본 불릿을 `<<doc:...>>` 로 덮어쓰지(replace) 않는다.
 *    원본 리서치/생각 트리는 무훼손으로 보존하고, 선택한 불릿의 **하위 불릿으로 새 `<<doc:...>>` 컴파일 가지**를 생성한다.
 * 2) 같은 원본 가지 아래에 `<<doc:a4>>` · `<<doc:blog>>` 등 N개의 컴파일 가지를 얼마든지 파생(1:N)할 수 있다.
 * 3) 원본 불릿에 명시적 `<<view:...>>` 태그가 없는 경우에도, 파생된 컴파일 가지 내부에는 계층(Depth)에 따른
 *    기본(`default`) 구조 태그(`<<view:section>>` · `<<view:title:h1/h2>>`)를 자동 부여해 바로 읽히는 `.vdoc` 초안을 만든다.
 *    프로필과 무관하게 1단계 가지마다 섹션을 세운다 (섹션 = 구조 단위 — A4 도 h2 제목 블록으로 섹션을 흉내 내지 않는다).
 * 4) 순수 인용/근거 전용 리프 불릿(`nodeEvidence` + `.vclip` 등 파일 참조)은 본문 텍스트에 원시 `[[...vclip]]` 로
 *    노출하지 않고 상위 주장 노드의 `nodeEvidence` 로 깔끔하게 승계한다.
 */
import type { OutlineNode } from "@vibe/outliner/core";
import type { OutlineFilePayload } from "@vibe/vault-formats";
import {
  parseOutlineDirective,
  type EvidenceLocator,
  type OutlineSyntaxNode,
} from "@vibe/vdoc-schema";

export type CompileDocProfile = "a4" | "blog";

export interface DeriveCompileSubtreeOptions {
  readonly profile: CompileDocProfile;
  /** 선택된 불릿 ID 목록 (비어 있으면 문서 루트 비-컴파일 노드를 대상으로 비파괴 파생) */
  readonly targetIds?: readonly string[];
  /** 명시적 문서 제목 (생략 시 선택된 단일 불릿 제목 또는 문서 제목 사용) */
  readonly title?: string;
  /** ID 생성 시드 (테스트 결정성 확보용) */
  readonly idPrefix?: string;
}

export interface DeriveCompileSubtreeResult {
  readonly payload: OutlineFilePayload;
  readonly docNodeId: string;
  readonly docTitle: string;
  /** 새로 생성된 컴파일 가지가 부착된 부모 노드 ID (루트 추가 시 null) */
  readonly parentNodeId: string | null;
  /** 실제 파생 원본으로 사용된 최상위 선택 노드 ID 목록 */
  readonly sourceTargetIds: readonly string[];
}

const RAW_VCLIP_WIKILINK_RE = /\s*\[\[[^\]]*\.vclip(?:#[^\]]*)?\]\]\s*/gi;
const EDITABLE_EVIDENCE_TAG_RE = /^\s*<<\s*(?:resource|cite)\b/i;

function isDocDirectiveNode(node: OutlineNode): boolean {
  const parsed = parseOutlineDirective(node.text ?? "");
  return parsed?.kind === "doc";
}

function isEditableEvidenceBullet(node: OutlineNode): boolean {
  return EDITABLE_EVIDENCE_TAG_RE.test(node.text ?? "");
}

function normalizeVclipTargetPath(raw: string): string {
  const clean = raw.replace(/^vault:\/\//i, "").replace(/^vault:/i, "").replace(/\\/g, "/").trim();
  const m = /^(.*?[^/]+\.vclip)(?:\/.*)?$/i.exec(clean);
  return m ? m[1] : clean;
}

function formatLocatorAsResourceBulletText(loc: EvidenceLocator): string | null {
  const rawTarget = (loc.url || loc.sourcePath || loc.resourceId || loc.refId || "").trim();
  if (!rawTarget) return null;
  const isUrl = /^https?:\/\//i.test(rawTarget);
  const target = isUrl ? rawTarget : normalizeVclipTargetPath(rawTarget);
  const anchors: string[] = [];
  if (loc.page && Number.isFinite(loc.page)) anchors.push(`#p${loc.page}`);
  if (loc.lines && loc.lines.length >= 2) anchors.push(`#L${loc.lines[0]}-L${loc.lines[1]}`);
  const addr = [target, ...anchors].filter(Boolean).join(" ");
  const quote = (loc.excerpt ?? loc.rationale ?? "").replace(/\r?\n+/g, " ").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  return quote ? `<<resource: ${addr} | ${quote}>>` : `<<resource: ${addr}>>`;
}

function stripDirectivePrefix(raw: string): string {
  const parsed = parseOutlineDirective(raw);
  if (parsed?.label) return parsed.label.trim();
  return raw.replace(/^\s*<<[^>]+>>\s*/, "").trim();
}

function cleanDisplayTitle(raw: string, fallback: string): string {
  const stripped = stripDirectivePrefix(raw).replace(RAW_VCLIP_WIKILINK_RE, " ").trim();
  return stripped || fallback;
}

function hasExplicitViewTag(text: string): boolean {
  const parsed = parseOutlineDirective(text);
  return parsed?.kind === "view" || parsed?.kind === "asset";
}

/**
 * 순수 인용/근거 전용 리프 불릿인지 판별한다:
 * - 자식이 없고, `nodeEvidence` 가 연결돼 있으며, `.vclip` 등 첨부 파일 참조 또는 따옴표 인용 + `[[...vclip]]` 패턴인 경우.
 */
function isPureEvidenceLeaf(
  node: OutlineNode,
  nodeEvidence: Readonly<Record<string, readonly EvidenceLocator[]>>
): boolean {
  if ((node.children?.length ?? 0) > 0) return false;
  const ev = nodeEvidence[node.id];
  if (!ev || ev.length === 0) return false;
  const target = String((node as OutlineSyntaxNode).file?.target ?? "");
  if (target.toLowerCase().includes(".vclip")) return true;
  if (RAW_VCLIP_WIKILINK_RE.test(node.text)) {
    RAW_VCLIP_WIKILINK_RE.lastIndex = 0;
    return true;
  }
  return false;
}

function stripRedundantVclipLink(text: string, hasEvidence: boolean): string {
  if (!hasEvidence) return text;
  const cleaned = text.replace(RAW_VCLIP_WIKILINK_RE, " ").replace(/\s{2,}/g, " ").trim();
  return cleaned || text;
}

/** 트리에서 지정된 ID 들의 경로(조상 포함)를 수집하고, 조상이 이미 포함된 중복 자손 ID 를 제거한다. */
function normalizeTopLevelTargets(
  roots: readonly OutlineNode[],
  rawIds: readonly string[]
): OutlineNode[] {
  const wanted = new Set(rawIds.filter(Boolean));
  if (wanted.size === 0) return [];

  const picked: OutlineNode[] = [];
  const walk = (nodes: readonly OutlineNode[], ancestorSelected: boolean) => {
    for (const node of nodes) {
      if (isDocDirectiveNode(node)) continue;
      const isHit = wanted.has(node.id);
      if (isHit && !ancestorSelected) {
        picked.push(node);
        // 이 노드의 하위 자손은 이미 서브트리에 포함되므로 중복 선택 제외
        continue;
      }
      if (node.children.length > 0) {
        walk(node.children, ancestorSelected || isHit);
      }
    }
  };
  walk(roots, false);
  return picked;
}

function prependChildToNode(
  nodes: readonly OutlineNode[],
  parentId: string,
  childToPrepend: OutlineNode
): { readonly next: OutlineNode[]; readonly inserted: boolean } {
  let inserted = false;
  const next = nodes.map((node) => {
    if (node.id === parentId) {
      inserted = true;
      return {
        ...node,
        isFolded: false,
        children: [childToPrepend, ...node.children],
      };
    }
    if (node.children.length > 0) {
      const sub = prependChildToNode(node.children, parentId, childToPrepend);
      if (sub.inserted) {
        inserted = true;
        return { ...node, children: sub.next };
      }
    }
    return node;
  });
  return { next, inserted };
}

/**
 * 선택된 불릿(들)의 원본을 훼손하지 않고, 하위 불릿으로 기본(`default`) 구조 태그가 입혀진
 * 새 `<<doc:a4>>` / `<<doc:blog>>` 컴파일 가지를 생성한다.
 */
export function deriveCompileSubtreeInOutline(
  payload: OutlineFilePayload,
  options: DeriveCompileSubtreeOptions
): DeriveCompileSubtreeResult {
  const profile = options.profile;
  const prefix = options.idPrefix ?? `cmp_${Date.now().toString(36)}`;
  let seq = 0;
  const nextId = () => `${prefix}_${++seq}`;

  const srcEvidence: Record<string, readonly EvidenceLocator[]> = payload.nodeEvidence ?? {};
  const nextEvidence: Record<string, EvidenceLocator[]> = {};
  for (const [nid, locs] of Object.entries(srcEvidence)) {
    nextEvidence[nid] = [...locs];
  }

  /**
   * 원본 노드를 새 ID 로 재귀 복제한다.
   * - 이미 편집 가능한 `<<resource:...>>` / `<<cite:...>>` 하위 불릿은 그대로 보존한다.
   * - 레거시 순수 근거 리프(`isPureEvidenceLeaf`: `nodeEvidence` + `.vclip` 첨부/위키링크)는
   *   숨겨진 사이드카로 감추지 않고 편집 가능한 `<<resource: 경로 #L.. | 발췌>>` 하위 불릿으로 승격해 유지한다.
   */
  const cloneContentNode = (src: OutlineNode): OutlineNode | null => {
    if (isDocDirectiveNode(src)) return null;
    const newId = nextId();
    const clonedChildren: OutlineNode[] = [];
    const seenResourceTexts = new Set<string>();
    const appendResourceBullet = (text: string | null) => {
      if (!text) return;
      const key = text.trim();
      if (!key || seenResourceTexts.has(key)) return;
      seenResourceTexts.add(key);
      clonedChildren.push({
        id: nextId(),
        text: key,
        children: [],
        isFolded: false,
      });
    };

    const ownLegacyEvidence = srcEvidence[src.id] ?? [];
    for (const loc of ownLegacyEvidence) {
      appendResourceBullet(formatLocatorAsResourceBulletText(loc));
    }

    for (const child of src.children ?? []) {
      if (isDocDirectiveNode(child)) continue;
      if (isEditableEvidenceBullet(child)) {
        appendResourceBullet(child.text);
        continue;
      }
      if (isPureEvidenceLeaf(child, srcEvidence)) {
        const leafLocs = srcEvidence[child.id] ?? [];
        if (leafLocs.length > 0) {
          for (const loc of leafLocs) {
            appendResourceBullet(formatLocatorAsResourceBulletText(loc));
          }
        } else {
          const target = String((child as OutlineSyntaxNode).file?.target ?? "").trim();
          const cleanedQuote = child.text.replace(RAW_VCLIP_WIKILINK_RE, " ").replace(/^["“]|["”]$/g, "").trim();
          if (target) {
            appendResourceBullet(
              cleanedQuote
                ? `<<resource: ${normalizeVclipTargetPath(target)} | ${cleanedQuote}>>`
                : `<<resource: ${normalizeVclipTargetPath(target)}>>`
            );
          }
        }
        continue;
      }
      const cloned = cloneContentNode(child);
      if (cloned) clonedChildren.push(cloned);
    }

    const cleanedText = stripRedundantVclipLink(src.text, seenResourceTexts.size > 0);
    return {
      id: newId,
      text: cleanedText,
      ...(src.file && !/\.vclip$/i.test(src.file.target ?? "") ? { file: { ...src.file } } : {}),
      children: clonedChildren,
      isFolded: false,
    };
  };

  // 1) 파생 대상 최상위 소스 노드 결정 (기존 <<doc:...>> 컴파일 가지는 원본에서 제외)
  const selectedTopNodes = normalizeTopLevelTargets(payload.rootNodes, options.targetIds ?? []);
  const plainRoots = payload.rootNodes.filter(
    (n) => !isDocDirectiveNode(n) && (n.text.trim().length > 0 || n.children.length > 0)
  );

  const fallbackTitle = (payload.title || "새 문서").trim() || "새 문서";
  let docTitle: string;
  let parentNodeId: string | null = null;
  let sourceNodesForBody: OutlineNode[];
  let sourceTargetIds: string[];

  if (selectedTopNodes.length === 1) {
    const primary = selectedTopNodes[0];
    parentNodeId = primary.id;
    sourceTargetIds = [primary.id];
    docTitle = (options.title?.trim() || cleanDisplayTitle(primary.text, fallbackTitle));
    // 단일 가지 선택 시: 그 가지의 비-컴파일 자식들이 문서 본문 1단계 섹션/항목이 된다.
    const nonDocChildren = (primary.children ?? []).filter(
      (c) => !isDocDirectiveNode(c) && (c.text.trim().length > 0 || c.children.length > 0)
    );
    sourceNodesForBody = nonDocChildren.length > 0 ? nonDocChildren : [primary];
  } else if (selectedTopNodes.length > 1) {
    // 복수 불릿 선택 시: 선택한 블록 중 최상단 불릿의 바로 하위(맨 앞)에 새 컴파일 가지를 고정 생성
    parentNodeId = selectedTopNodes[0].id;
    sourceTargetIds = selectedTopNodes.map((n) => n.id);
    docTitle = (options.title?.trim() || cleanDisplayTitle(selectedTopNodes[0].text, fallbackTitle));
    sourceNodesForBody = selectedTopNodes;
  } else {
    // 선택 없음: 전체 일반 루트를 비파괴 복제해 문서 끝 루트로 새 컴파일 가지 추가
    parentNodeId = null;
    sourceTargetIds = plainRoots.map((n) => n.id);
    docTitle = (options.title?.trim() || fallbackTitle);
    sourceNodesForBody = plainRoots;
  }

  // 2) 기본(default) 구조 태그 매핑 (profile별 최적 기본 뼈대)
  const docNodeId = `doc_${prefix}`;
  const docChildren: OutlineNode[] = [];

  // 섹션 중심 기본 뼈대 (A4 · 블로그 공통 — 섹션 = 구조 단위, A4 의 쪽은 출력 결과라 섹션이 쪽을 넘어 흐른다):
  // - 상단 도입 섹션(제목 h1) + 자식이 있는 1단계 가지마다 독립 <<view:section>> + <<view:title:h2>>
  // - 자식이 없는 단순 평면 항목들은 도입 섹션 안에 묶어 과도한 섹션 파편화 방지
  {
    const hasStructuredGroups = sourceNodesForBody.some(
      (n) =>
        !hasExplicitViewTag(n.text) &&
        (n.children ?? []).some(
          (c) => !isDocDirectiveNode(c) && !isEditableEvidenceBullet(c) && !isPureEvidenceLeaf(c, srcEvidence)
        )
    );

    if (hasStructuredGroups) {
      const introSecId = nextId();
      const introTitleId = nextId();
      const introTitleEvidenceChildren: OutlineNode[] =
        selectedTopNodes.length === 1
          ? (srcEvidence[selectedTopNodes[0].id] ?? [])
              .map((loc) => formatLocatorAsResourceBulletText(loc))
              .filter((t): t is string => Boolean(t))
              .map((text) => ({ id: nextId(), text, children: [], isFolded: false }))
          : [];
      const introChildren: OutlineNode[] = [
        {
          id: introTitleId,
          text: `<<view:title:h1>> ${docTitle}`,
          children: introTitleEvidenceChildren,
          isFolded: false,
        },
      ];
      docChildren.push({
        id: introSecId,
        text: `<<view:section:opening>> ${docTitle}`,
        children: introChildren,
        isFolded: false,
      });

      for (const item of sourceNodesForBody) {
        if (hasExplicitViewTag(item.text)) {
          const cloned = cloneContentNode(item);
          if (!cloned) continue;
          // 이미 섹션이면 문서 바로 아래, 그 밖의 요소(표 · 목록 · 다단 …)는 섹션 안에만 담긴다.
          const dir = parseOutlineDirective(item.text);
          if (dir?.kind === "view" && dir.target === "section") docChildren.push(cloned);
          else introChildren.push(cloned);
          continue;
        }
        const cloned = cloneContentNode(item);
        if (!cloned) continue;
        const hasStructuralChildren = cloned.children.some((c) => !isEditableEvidenceBullet(c));
        if (hasStructuralChildren) {
          const secId = nextId();
          const h2Id = nextId();
          docChildren.push({
            id: secId,
            text: `<<view:section>> ${cloned.text}`,
            children: [
              { id: h2Id, text: `<<view:title:h2>> ${cloned.text}`, children: [], isFolded: false },
              ...cloned.children,
            ],
            isFolded: false,
          });
        } else {
          introChildren.push(cloned);
        }
      }
    } else {
      const secId = nextId();
      const h1Id = nextId();
      const bodyChildren: OutlineNode[] = [
        { id: h1Id, text: `<<view:title:h1>> ${docTitle}`, children: [], isFolded: false },
      ];
      for (const item of sourceNodesForBody) {
        const cloned = cloneContentNode(item);
        if (cloned) bodyChildren.push(cloned);
      }
      docChildren.push({
        id: secId,
        text: `<<view:section>> ${docTitle}`,
        children: bodyChildren,
        isFolded: false,
      });
    }
  }

  const compileDocNode: OutlineNode = {
    id: docNodeId,
    text: `<<doc:${profile}>> ${docTitle}`,
    children:
      docChildren.length > 0
        ? docChildren
        : [{ id: nextId(), text: "", children: [], isFolded: false }],
    isFolded: false,
  };

  let nextRoots: OutlineNode[];
  if (parentNodeId) {
    const res = prependChildToNode(payload.rootNodes, parentNodeId, compileDocNode);
    nextRoots = res.inserted ? res.next : [...payload.rootNodes, compileDocNode];
  } else {
    nextRoots = [...payload.rootNodes, compileDocNode];
  }

  return {
    payload: {
      ...payload,
      rootNodes: nextRoots,
      nodeEvidence: nextEvidence,
      updatedAt: new Date().toISOString(),
    },
    docNodeId,
    docTitle,
    parentNodeId,
    sourceTargetIds,
  };
}
