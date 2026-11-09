/**
 * Resource Manager(RM) 도메인 스키마.
 * - 파일/웹/외부 소스의 덤핑, 계층 트리, Choice(체크박스) 선별, 섹터(BBox/발췌) 발라내기 규격.
 */

export type ResourceType = "file" | "web" | "capture" | "table" | "text";

/** 수백 페이지 문서나 소스에서 '발라낸' 세부 섹터(BBox 좌표 또는 문단 스니펫). */
export interface ResourceSector {
  sectorId: string;
  resourceId: string;
  title?: string;
  page?: number;
  /** [ymin, xmin, ymax, xmax] (PDF 1000분율 정규화 좌표) */
  bbox?: [number, number, number, number];
  textSnippet: string;
  label?: string;
  isUsedInEditor?: boolean;
  createdAt: number;
}

/** 디렉토리 트리 노드 또는 개별 리소스 아이템. */
export interface ResourceItem {
  id: string;
  type: ResourceType;
  title: string;
  pathOrUrl?: string;
  extension?: string;
  sizeBytes?: number;
  updatedAt?: number;
  /** Choice(true) vs Not Choice(false): AI 컨텍스트 참여 및 에디터 활성 참조 여부 */
  isChecked: boolean;
  /** 해당 소스에서 발라낸 세부 섹터/카드 목록 */
  sectors: ResourceSector[];
  /** 하위 폴더/파일 (디렉토리인 경우) */
  children?: ResourceItem[];
}

/** 프로젝트별 리소스 세션 영속화 상태 */
export interface ResourceSessionState {
  projectId: string;
  items: ResourceItem[];
  activeResourceId?: string | null;
  selectedSectorId?: string | null;
  updatedAt: number;
}

/** 트리 구조에서 모든 평탄화된 아이템 목록을 추출합니다. */
export function flattenResourceItems(items: ResourceItem[]): ResourceItem[] {
  const result: ResourceItem[] = [];
  function recurse(list: ResourceItem[]) {
    for (const item of list) {
      result.push(item);
      if (item.children && item.children.length > 0) {
        recurse(item.children);
      }
    }
  }
  recurse(items);
  return result;
}

/** Choice(체크)된 유효 소스들만 필터링합니다 (폴더 제외 실제 리소스). */
export function getCheckedResourceItems(items: ResourceItem[]): ResourceItem[] {
  return flattenResourceItems(items).filter(
    (item) => item.isChecked && (!item.children || item.children.length === 0)
  );
}

/** 모든 소스에서 발라낸 섹터 카드들을 평탄화하여 수집합니다. */
export function collectAllSectors(items: ResourceItem[]): ResourceSector[] {
  const checked = getCheckedResourceItems(items);
  return checked.flatMap((item) => item.sectors);
}

