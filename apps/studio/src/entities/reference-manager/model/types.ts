/**
 * Reference Manager - Reference Snippet & Document Item Data Model
 * 
 * '참조(Reference)'의 본질: 작업 내내 곁에 펼쳐두고 눈을 돌려 바로 확인하는 실시간 참조 데스크 & 핀(Pin) 보드.
 * 향후 텍스트 형광펜, 포스트잇 메모, 북마크 등으로 확장이 가능한 Discriminated Union 구조.
 */

export interface BaseReferenceSnippet {
  id: string;               // 고유 식별자 (예: "ref_pin_173087234")
  docId: string;            // 소속 참조 문서 ID
  label: string;            // 목록에 표시될 핀 이름 (예: "1p: 제3조 [구성]")
  createdAt: string;        // 생성 일시 (ISO String)
  color?: string;           // 개별 하이라이트 색상 (선택사항)
}

/** 1. 사각 영역 핀 (BBox Region Pin - 현재 핵심 구현체) */
export interface RegionPinSnippet extends BaseReferenceSnippet {
  kind: "region";
  page: number;             // PDF 페이지 번호 (1-based)
  bbox: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 1000분율 좌표
  excerpt?: string;         // 영역 내부 발췌 텍스트
}

/** 2. 텍스트 형광펜 (차후 확장 대비) */
export interface TextHighlightSnippet extends BaseReferenceSnippet {
  kind: "text";
  page?: number;
  text: string;
  charRange?: [number, number];
}

/** 3. 포스트잇 메모 (차후 확장 대비) */
export interface MemoNoteSnippet extends BaseReferenceSnippet {
  kind: "memo";
  page?: number;
  comment: string;
}

/** ⭐️ 향후 확장이 열려 있는 참조 스니펫 유니온 타입 */
export type ReferenceSnippet =
  | RegionPinSnippet
  | TextHighlightSnippet
  | MemoNoteSnippet;

/** 상단 목록에 나열되는 참조 문서 단위 */
export interface ReferenceDocumentItem {
  id: string;                // 참조 문서 식별자 (docId)
  projectId?: string;        // 소속 원본 프로젝트 ID
  title: string;             // 문서명 (예: "예스폼_상벌위원회규정")
  sourceType: "pdf" | "doc" | "web";
  pageCount?: number;
  snippets: ReferenceSnippet[];
}

