/**
 * @vibe/vdoc-schema — Multi-Document Project Manifest (`.vproj`), 4-Level Zoom Hierarchy,
 * Read-Only Reference Projects Deck, Provenance Lineage, and 3-Phase AI Staging Contracts.
 */

export type ZoomLevel = "project" | "document" | "page" | "slot";

export type WorkbenchPhase = "storylining" | "templating" | "drafting";

export type OutlinerAiStatus = "idle" | "working" | "staged" | "applied";

export interface OutlinerNode {
  nodeId: string;
  parentId: string | null;
  depth: number;
  zoomLevel: ZoomLevel;
  title: string;
  summary: string;
  targetDocId?: string | null;
  targetPageId?: string | null;
  targetBlockId?: string | null;
  targetSlotId?: string | null;
  recommendedTemplateId?: string | null;
  provenanceSourceProjectId?: string | null;
  provenanceSourceNodeId?: string | null;
  aiStatus?: OutlinerAiStatus;
  collapsed?: boolean;
}

export interface ProvenanceRecord {
  recordId: string;
  targetProjectId: string;
  targetNodeId: string;
  sourceProjectId: string;
  sourceProjectTitle: string;
  sourceNodeId: string;
  sourceNodeTitle: string;
  clonedAt: string;
}

export interface StagedAiChange {
  diffId: string;
  phase: WorkbenchPhase;
  targetKind: "outline-node" | "template-block" | "slot-html";
  targetId: string;
  title: string;
  beforeSummary: string;
  afterSummary: string;
  payload: Record<string, unknown>;
  sourceReferenceIds: string[];
}

export interface VProjectManifest {
  projectId: string;
  title: string;
  description: string;
  isReferenceOnly: boolean;
  activePhase: WorkbenchPhase;
  docIds: string[];
  referenceProjectIds: string[];
  storylineNodes: OutlinerNode[];
  provenanceLineage: ProvenanceRecord[];
  updatedAt: string;
}

export interface OutlineBreadcrumbItem {
  nodeId: string;
  title: string;
  zoomLevel: ZoomLevel;
}

export const INITIAL_VPROJECTS: VProjectManifest[] = [
  {
    projectId: "vproj-enterprise-architecture-suite",
    title: "2026 엔터프라이즈 문서 거버넌스 & 제안 패키지",
    description:
      "다중 문서(.vdoc) 아키텍처 회의록·투자 제안서·정산 명세서 통합 작업 프로젝트",
    isReferenceOnly: false,
    activePhase: "drafting",
    docIds: [
      "vdoc-arch-minutes-01",
      "vdoc-pandadoc-vc-proposal-01",
      "vdoc-yesform-bansanghoe-07",
      "vdoc-atticus-invoice-000081709",
    ],
    referenceProjectIds: [
      "vproj-ref-cloud-migration-rfp",
      "vproj-ref-iso27001-audit",
      "vproj-ref-series-b-ir-deck",
    ],
    storylineNodes: [
      {
        nodeId: "node-proj-root",
        parentId: null,
        depth: 0,
        zoomLevel: "project",
        title: "2026 엔터프라이즈 문서 거버넌스 & 제안 패키지 (통합 스토리라인)",
        summary: "4종 핵심 비즈니스 문서 패키지 아웃라인 루트",
        aiStatus: "idle",
      },
      {
        nodeId: "node-doc-minutes",
        parentId: "node-proj-root",
        depth: 1,
        zoomLevel: "document",
        title: "01. 아키텍처 위원회 의사결정 회의록",
        summary: "표준 서식 카탈로그 및 하이브리드 슬롯 엔진 채택 결의",
        targetDocId: "vdoc-arch-minutes-01",
        recommendedTemplateId: "composite-form-frame",
        aiStatus: "idle",
      },
      {
        nodeId: "node-page-minutes-p1",
        parentId: "node-doc-minutes",
        depth: 2,
        zoomLevel: "page",
        title: "Page 1 · 회의 개요 및 핵심 의결사항 매트릭스",
        summary: "참석자 명단, 상정 안건 3건, 액션 아이템 테이블",
        targetDocId: "vdoc-arch-minutes-01",
        targetPageId: "page-arch-1",
        recommendedTemplateId: "structured-table",
        aiStatus: "idle",
      },
      {
        nodeId: "node-slot-minutes-agenda",
        parentId: "node-page-minutes-p1",
        depth: 3,
        zoomLevel: "slot",
        title: "핵심 협의 및 결의사항 본문 슬롯",
        summary: "WYSIWYM × WYSIWYG 하이브리드 조판 엔진 아키텍처 확정",
        targetDocId: "vdoc-arch-minutes-01",
        targetPageId: "page-arch-1",
        targetSlotId: "arch_agenda_body",
        recommendedTemplateId: "section-block",
        aiStatus: "idle",
      },
      {
        nodeId: "node-doc-proposal",
        parentId: "node-proj-root",
        depth: 1,
        zoomLevel: "document",
        title: "02. 엔터프라이즈 도입 및 투자 제안서 (PandaDoc VC)",
        summary: "도입 배경, ROI 산정 테이블, 마일스톤 로드맵",
        targetDocId: "vdoc-pandadoc-vc-proposal-01",
        recommendedTemplateId: "cover-banner",
        aiStatus: "idle",
      },
      {
        nodeId: "node-page-proposal-p1",
        parentId: "node-doc-proposal",
        depth: 2,
        zoomLevel: "page",
        title: "Page 1 · 표지 배너 및 총괄 요약 (Executive Summary)",
        summary: "제안사/수신사 메타데이터 및 핵심 가치 제안",
        targetDocId: "vdoc-pandadoc-vc-proposal-01",
        targetPageId: "page-vc-1",
        recommendedTemplateId: "cover-banner",
        aiStatus: "idle",
      },
      {
        nodeId: "node-doc-bansanghoe",
        parentId: "node-proj-root",
        depth: 1,
        zoomLevel: "document",
        title: "03. 공공/행정 복합 테두리 표준 양식 (예스폼 07호)",
        summary: "한국형 복합 표 테두리 및 직인 스탬프 슬롯 검증 문서",
        targetDocId: "vdoc-yesform-bansanghoe-07",
        recommendedTemplateId: "composite-form-frame",
        aiStatus: "idle",
      },
      {
        nodeId: "node-doc-invoice",
        parentId: "node-proj-root",
        depth: 1,
        zoomLevel: "document",
        title: "04. 라이선스 및 기술지원 정산 인보이스 (Atticus)",
        summary: "품목별 단가, 수량, 공급가액 및 세액 정산 표",
        targetDocId: "vdoc-atticus-invoice-000081709",
        recommendedTemplateId: "structured-table",
        aiStatus: "idle",
      },
    ],
    provenanceLineage: [],
    updatedAt: "2026-11-03T11:00:00Z",
  },
  {
    projectId: "vproj-ref-cloud-migration-rfp",
    title: "[참조 1] 금융권 클라우드 전환 표준 제안서(RFP) 레퍼런스",
    description:
      "읽기 전용(Read-Only) 우수 제안서 구조 및 SLA 매트릭스 레퍼런스 프로젝트",
    isReferenceOnly: true,
    activePhase: "storylining",
    docIds: ["vdoc-pandadoc-vc-proposal-01"],
    referenceProjectIds: [],
    storylineNodes: [
      {
        nodeId: "ref1-root",
        parentId: null,
        depth: 0,
        zoomLevel: "project",
        title: "[참조 1] 금융권 클라우드 전환 표준 제안서(RFP)",
        summary: "무중단 마이그레이션 및 비용 거버넌스 검증 템플릿",
      },
      {
        nodeId: "ref1-sec-sla",
        parentId: "ref1-root",
        depth: 1,
        zoomLevel: "page",
        title: "가용성 99.99% SLA 보장 및 복구 목표(RTO/RPO) 명세",
        summary: "1등급 핵심 원장 시스템 15분 이내 자동 페일오버 보증 조항",
        targetDocId: "vdoc-pandadoc-vc-proposal-01",
        recommendedTemplateId: "structured-table",
      },
      {
        nodeId: "ref1-sec-cutover",
        parentId: "ref1-root",
        depth: 1,
        zoomLevel: "page",
        title: "3단계 무중단 컷오버(Cut-over) 및 병행 운영 시나리오",
        summary:
          "Canary 트래픽 5% -> 25% -> 100% 단계적 전환 및 즉시 롤백 게이트",
        targetDocId: "vdoc-pandadoc-vc-proposal-01",
        recommendedTemplateId: "columns-grid",
      },
      {
        nodeId: "ref1-sec-tco",
        parentId: "ref1-root",
        depth: 1,
        zoomLevel: "page",
        title: "3개년 총소유비용(TCO) 절감 시뮬레이션 및 FinOps 거버넌스",
        summary:
          "예약 인스턴스(RI) 결합 시 온프레미스 대비 연 34.2% 인프라 비용 절감 근거",
        targetDocId: "vdoc-pandadoc-vc-proposal-01",
        recommendedTemplateId: "summary-list",
      },
    ],
    provenanceLineage: [],
    updatedAt: "2026-11-03T11:00:00Z",
  },
  {
    projectId: "vproj-ref-iso27001-audit",
    title: "[참조 2] ISO/IEC 27001 정보보호 관리체계 심사 보고서",
    description:
      "읽기 전용(Read-Only) 보안 통제 항목·감사 증적·결재란 표준 양식 레퍼런스",
    isReferenceOnly: true,
    activePhase: "storylining",
    docIds: ["vdoc-arch-minutes-01"],
    referenceProjectIds: [],
    storylineNodes: [
      {
        nodeId: "ref2-root",
        parentId: null,
        depth: 0,
        zoomLevel: "project",
        title: "[참조 2] ISO/IEC 27001 정보보호 관리체계 심사 보고서",
        summary: "정보자산 분류, 접근통제 정책, 침해사고 대응 감사 표준",
      },
      {
        nodeId: "ref2-sec-access",
        parentId: "ref2-root",
        depth: 1,
        zoomLevel: "page",
        title: "A.9 접근통제 및 최소권한(Zero-Trust) 검증 매트릭스",
        summary: "특권 계정 MFA 강제화 및 분기별 권한 재검토 감사 로그",
        targetDocId: "vdoc-arch-minutes-01",
        recommendedTemplateId: "composite-form-frame",
      },
      {
        nodeId: "ref2-sec-incident",
        parentId: "ref2-root",
        depth: 1,
        zoomLevel: "page",
        title: "A.16 정보보호 이벤트 탐지 및 골든타임 대응 프로토콜",
        summary:
          "이상 징후 탐지 후 30분 내 격리 및 24시간 내 원인 분석 보고서 제출 체계",
        targetDocId: "vdoc-arch-minutes-01",
        recommendedTemplateId: "section-block",
      },
    ],
    provenanceLineage: [],
    updatedAt: "2026-11-03T11:00:00Z",
  },
  {
    projectId: "vproj-ref-series-b-ir-deck",
    title: "[참조 3] B2B SaaS 엔터프라이즈 정산·재무 공시 패키지",
    description:
      "읽기 전용(Read-Only) 연간 반복매출(ARR)·정산 명세·계약 조건 표준 레퍼런스",
    isReferenceOnly: true,
    activePhase: "storylining",
    docIds: ["vdoc-atticus-invoice-000081709"],
    referenceProjectIds: [],
    storylineNodes: [
      {
        nodeId: "ref3-root",
        parentId: null,
        depth: 0,
        zoomLevel: "project",
        title: "[참조 3] B2B SaaS 엔터프라이즈 정산·재무 공시 패키지",
        summary: "엔터프라이즈 과금 체계 및 분기별 정산 검증 명세",
      },
      {
        nodeId: "ref3-sec-unit-econ",
        parentId: "ref3-root",
        depth: 1,
        zoomLevel: "page",
        title: "엔터프라이즈 코호트 순매출유지율(NRR 138%) 및 LTV/CAC 분석",
        summary:
          "좌석당 기본 구독료 + API 호출량 종량제 하이브리드 과금 테이블",
        targetDocId: "vdoc-atticus-invoice-000081709",
        recommendedTemplateId: "structured-table",
      },
    ],
    provenanceLineage: [],
    updatedAt: "2026-11-03T11:00:00Z",
  },
];

