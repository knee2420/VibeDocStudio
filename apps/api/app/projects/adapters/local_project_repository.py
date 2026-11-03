"""`data/knowledge/projects/` 아래 `.vproj` 다중 문서 프로젝트 및 참조 덱 저장소 어댑터."""
from __future__ import annotations

import shutil
from datetime import datetime, timezone
from pathlib import Path

from app.core.storage import read_json, safe_segment, write_json

from ..errors import VProjectNotFoundError
from ..models import StorylineNodeRecord, VProjectManifestRecord


def _default_seed_projects() -> list[VProjectManifestRecord]:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return [
        VProjectManifestRecord(
            project_id="vproj-enterprise-architecture-suite",
            title="2026 엔터프라이즈 문서 거버넌스 & 제안 패키지",
            description="다중 문서(.vdoc) 아키텍처 회의록·투자 제안서·정산 명세서 통합 작업 프로젝트",
            is_reference_only=False,
            active_phase="drafting",
            doc_ids=(
                "vdoc-arch-minutes-01",
                "vdoc-pandadoc-vc-proposal-01",
                "vdoc-yesform-bansanghoe-07",
                "vdoc-atticus-invoice-000081709",
            ),
            reference_project_ids=(
                "vproj-ref-cloud-migration-rfp",
                "vproj-ref-iso27001-audit",
                "vproj-ref-series-b-ir-deck",
            ),
            storyline_nodes=(
                StorylineNodeRecord(
                    node_id="node-proj-root",
                    parent_id=None,
                    depth=0,
                    zoom_level="project",
                    title="2026 엔터프라이즈 문서 거버넌스 & 제안 패키지 (통합 스토리라인)",
                    summary="4종 핵심 비즈니스 문서 패키지 아웃라인 루트",
                ),
                StorylineNodeRecord(
                    node_id="node-doc-minutes",
                    parent_id="node-proj-root",
                    depth=1,
                    zoom_level="document",
                    title="01. 아키텍처 위원회 의사결정 회의록",
                    summary="표준 서식 카탈로그 및 하이브리드 슬롯 엔진 채택 결의",
                    target_doc_id="vdoc-arch-minutes-01",
                    recommended_template_id="composite-form-frame",
                ),
                StorylineNodeRecord(
                    node_id="node-page-minutes-p1",
                    parent_id="node-doc-minutes",
                    depth=2,
                    zoom_level="page",
                    title="Page 1 · 회의 개요 및 핵심 의결사항 매트릭스",
                    summary="참석자 명단, 상정 안건 3건, 액션 아이템 테이블",
                    target_doc_id="vdoc-arch-minutes-01",
                    target_page_id="page-arch-1",
                    recommended_template_id="structured-table",
                ),
                StorylineNodeRecord(
                    node_id="node-slot-minutes-agenda",
                    parent_id="node-page-minutes-p1",
                    depth=3,
                    zoom_level="slot",
                    title="핵심 협의 및 결의사항 본문 슬롯",
                    summary="WYSIWYM × WYSIWYG 하이브리드 조판 엔진 아키텍처 확정",
                    target_doc_id="vdoc-arch-minutes-01",
                    target_page_id="page-arch-1",
                    target_slot_id="arch_agenda_body",
                    recommended_template_id="section-block",
                ),
                StorylineNodeRecord(
                    node_id="node-doc-proposal",
                    parent_id="node-proj-root",
                    depth=1,
                    zoom_level="document",
                    title="02. 엔터프라이즈 도입 및 투자 제안서 (PandaDoc VC)",
                    summary="도입 배경, ROI 산정 테이블, 마일스톤 로드맵",
                    target_doc_id="vdoc-pandadoc-vc-proposal-01",
                    recommended_template_id="cover-banner",
                ),
                StorylineNodeRecord(
                    node_id="node-page-proposal-p1",
                    parent_id="node-doc-proposal",
                    depth=2,
                    zoom_level="page",
                    title="Page 1 · 표지 배너 및 총괄 요약 (Executive Summary)",
                    summary="제안사/수신사 메타데이터 및 핵심 가치 제안",
                    target_doc_id="vdoc-pandadoc-vc-proposal-01",
                    target_page_id="page-vc-1",
                    recommended_template_id="cover-banner",
                ),
                StorylineNodeRecord(
                    node_id="node-doc-invoice",
                    parent_id="node-proj-root",
                    depth=1,
                    zoom_level="document",
                    title="03. 라이선스 및 기술지원 정산 인보이스 (Atticus)",
                    summary="품목별 단가, 수량, 공급가액 및 세액 정산 표",
                    target_doc_id="vdoc-atticus-invoice-000081709",
                    recommended_template_id="structured-table",
                ),
            ),
            provenance_lineage=(),
            updated_at=now,
        ),
        VProjectManifestRecord(
            project_id="vproj-ref-cloud-migration-rfp",
            title="[참조 1] 금융권 클라우드 전환 표준 제안서(RFP) 레퍼런스",
            description="읽기 전용(Read-Only) 우수 제안서 구조 및 SLA 매트릭스 레퍼런스 프로젝트",
            is_reference_only=True,
            active_phase="storylining",
            doc_ids=("vdoc-pandadoc-vc-proposal-01",),
            reference_project_ids=(),
            storyline_nodes=(
                StorylineNodeRecord(
                    node_id="ref1-root",
                    parent_id=None,
                    depth=0,
                    zoom_level="project",
                    title="[참조 1] 금융권 클라우드 전환 표준 제안서(RFP)",
                    summary="무중단 마이그레이션 및 비용 거버넌스 검증 템플릿",
                ),
                StorylineNodeRecord(
                    node_id="ref1-sec-sla",
                    parent_id="ref1-root",
                    depth=1,
                    zoom_level="page",
                    title="가용성 99.99% SLA 보장 및 복구 목표(RTO/RPO) 명세",
                    summary="1등급 핵심 원장 시스템 15분 이내 자동 페일오버 보증 조항",
                    target_doc_id="vdoc-pandadoc-vc-proposal-01",
                    recommended_template_id="structured-table",
                ),
                StorylineNodeRecord(
                    node_id="ref1-sec-cutover",
                    parent_id="ref1-root",
                    depth=1,
                    zoom_level="page",
                    title="3단계 무중단 컷오버(Cut-over) 및 병행 운영 시나리오",
                    summary="Canary 트래픽 5% -> 25% -> 100% 단계적 전환 및 즉시 롤백 게이트",
                    target_doc_id="vdoc-pandadoc-vc-proposal-01",
                    recommended_template_id="columns-grid",
                ),
                StorylineNodeRecord(
                    node_id="ref1-sec-tco",
                    parent_id="ref1-root",
                    depth=1,
                    zoom_level="page",
                    title="3개년 총소유비용(TCO) 절감 시뮬레이션 및 FinOps 거버넌스",
                    summary="예약 인스턴스(RI) 결합 시 온프레미스 대비 연 34.2% 인프라 비용 절감 근거",
                    target_doc_id="vdoc-pandadoc-vc-proposal-01",
                    recommended_template_id="summary-list",
                ),
            ),
            provenance_lineage=(),
            updated_at=now,
        ),
        VProjectManifestRecord(
            project_id="vproj-ref-iso27001-audit",
            title="[참조 2] ISO/IEC 27001 정보보호 관리체계 심사 보고서",
            description="읽기 전용(Read-Only) 보안 통제 항목·감사 증적·결재란 표준 양식 레퍼런스",
            is_reference_only=True,
            active_phase="storylining",
            doc_ids=("vdoc-arch-minutes-01",),
            reference_project_ids=(),
            storyline_nodes=(
                StorylineNodeRecord(
                    node_id="ref2-root",
                    parent_id=None,
                    depth=0,
                    zoom_level="project",
                    title="[참조 2] ISO/IEC 27001 정보보호 관리체계 심사 보고서",
                    summary="정보자산 분류, 접근통제 정책, 침해사고 대응 감사 표준",
                ),
                StorylineNodeRecord(
                    node_id="ref2-sec-access",
                    parent_id="ref2-root",
                    depth=1,
                    zoom_level="page",
                    title="A.9 접근통제 및 최소권한(Zero-Trust) 검증 매트릭스",
                    summary="특권 계정 MFA 강제화 및 분기별 권한 재검토 감사 로그",
                    target_doc_id="vdoc-arch-minutes-01",
                    recommended_template_id="composite-form-frame",
                ),
                StorylineNodeRecord(
                    node_id="ref2-sec-incident",
                    parent_id="ref2-root",
                    depth=1,
                    zoom_level="page",
                    title="A.16 정보보호 이벤트 탐지 및 골든타임 대응 프로토콜",
                    summary="이상 징후 탐지 후 30분 내 격리 및 24시간 내 원인 분석 보고서 제출 체계",
                    target_doc_id="vdoc-arch-minutes-01",
                    recommended_template_id="section-block",
                ),
            ),
            provenance_lineage=(),
            updated_at=now,
        ),
        VProjectManifestRecord(
            project_id="vproj-ref-series-b-ir-deck",
            title="[참조 3] B2B SaaS 엔터프라이즈 정산·재무 공시 패키지",
            description="읽기 전용(Read-Only) 연간 반복매출(ARR)·정산 명세·계약 조건 표준 레퍼런스",
            is_reference_only=True,
            active_phase="storylining",
            doc_ids=("vdoc-atticus-invoice-000081709",),
            reference_project_ids=(),
            storyline_nodes=(
                StorylineNodeRecord(
                    node_id="ref3-root",
                    parent_id=None,
                    depth=0,
                    zoom_level="project",
                    title="[참조 3] B2B SaaS 엔터프라이즈 정산·재무 공시 패키지",
                    summary="엔터프라이즈 과금 체계 및 분기별 정산 검증 명세",
                ),
                StorylineNodeRecord(
                    node_id="ref3-sec-unit-econ",
                    parent_id="ref3-root",
                    depth=1,
                    zoom_level="page",
                    title="엔터프라이즈 코호트 순매출유지율(NRR 138%) 및 LTV/CAC 분석",
                    summary="좌석당 기본 구독료 + API 호출량 종량제 하이브리드 과금 테이블",
                    target_doc_id="vdoc-atticus-invoice-000081709",
                    recommended_template_id="structured-table",
                ),
            ),
            provenance_lineage=(),
            updated_at=now,
        ),
    ]


class LocalVProjectRepository:
    def __init__(self, root_dir: Path) -> None:
        self._root = root_dir
        self._ensure_seeded()

    def _project_file(self, project_id: str) -> Path:
        safe_id = safe_segment(project_id)
        return self._root / safe_id / "project.vproj.json"

    def _provenance_file(self, project_id: str) -> Path:
        safe_id = safe_segment(project_id)
        return self._root / safe_id / "provenance.json"

    def _ensure_seeded(self) -> None:
        self._root.mkdir(parents=True, exist_ok=True)
        existing = [d for d in self._root.iterdir() if d.is_dir()]
        if existing:
            return
        for seed in _default_seed_projects():
            self.save(seed)

    def list_projects(self) -> list[VProjectManifestRecord]:
        self._ensure_seeded()
        records: list[VProjectManifestRecord] = []
        for entry in sorted(self._root.iterdir()):
            if not entry.is_dir():
                continue
            payload = read_json(entry / "project.vproj.json")
            if not isinstance(payload, dict):
                continue
            records.append(VProjectManifestRecord.from_dict(payload))
        return records

    def get(self, project_id: str) -> VProjectManifestRecord:
        self._ensure_seeded()
        path = self._project_file(project_id)
        payload = read_json(path)
        if not isinstance(payload, dict):
            raise VProjectNotFoundError(f"Project not found: {project_id}")
        return VProjectManifestRecord.from_dict(payload)

    def save(self, record: VProjectManifestRecord) -> VProjectManifestRecord:
        path = self._project_file(record.project_id)
        write_json(path, record.to_dict())
        write_json(
            self._provenance_file(record.project_id),
            {
                "projectId": record.project_id,
                "referenceProjectIds": list(record.reference_project_ids),
                "lineage": [p.to_dict() for p in record.provenance_lineage],
                "updatedAt": record.updated_at,
            },
        )
        return record

    def delete(self, project_id: str) -> None:
        safe_id = safe_segment(project_id)
        proj_dir = self._root / safe_id
        if not proj_dir.exists():
            raise VProjectNotFoundError(f"Project not found: {safe_id}")
        shutil.rmtree(proj_dir)

