"""애플리케이션의 유일한 객체 조립 및 저장 등급 루트 주입 장소 (`app.bootstrap.container`).

도메인 서비스와 어댑터는 여기서만 구체 구현체를 선택하고,
`StorageRoots` 경로 주입도 오직 이 파일에서만 수행한다.
"""
from __future__ import annotations

from pathlib import Path

from dependency_injector import containers, providers

from app.backdata.adapters import LocalBackdataRepository
from app.backdata.service import BackdataService
from app.backdata.use_cases import (
    ImportRawBackdataUseCase,
    ListBackdataChunksUseCase,
)
from app.catalog.adapters import FilesystemCatalogRepository, PdfVDocEngineAdapter
from app.catalog.agents import FormScaffoldAgent
from app.catalog.service import CatalogService
from app.catalog.use_cases import (
    GetCatalogBundleUseCase,
    IngestPdfToCatalogUseCase,
    ListCatalogFormsUseCase,
    ScaffoldPdfToDocumentUseCase,
)
from app.composer.adapters import (
    GroundedSlotComposerAdapter,
    LocalCompositionArchiveAdapter,
)
from app.composer.agents import (
    SlotComposerAgent,
    StorylineScaffoldAgent,
    TemplateTuningAgent,
)
from app.composer.service import ComposerService
from app.composer.use_cases import (
    CancelCompositionRunUseCase,
    ComposeSlotDraftUseCase,
    ComposeStorylinePhase1UseCase,
    RecommendTemplatesPhase2UseCase,
)
from app.core.config import settings
from app.core.llm.execution_policy import (
    CLI_PROVIDER,
    GOOGLE_PROVIDER,
    RuntimeExecutionPolicy,
)
from app.core.observation import CancellationRegistry
from app.documents.adapters import (
    FileOutlineCacheAdapter,
    LocalVDocDocumentRepository,
)
from app.documents.service import DocumentService
from app.documents.use_cases import (
    DeleteDocumentUseCase,
    GetDocumentPageChunkUseCase,
    GetDocumentUseCase,
    ListDocumentsUseCase,
    PatchDocumentStructureUseCase,
    SaveDocumentUseCase,
    UpdateSlotContentUseCase,
)
from app.projects.adapters import LocalVProjectRepository
from app.projects.service import ProjectService
from app.projects.use_cases import (
    BindReferenceProjectsUseCase,
    CloneNodeWithProvenanceUseCase,
    GetProjectOutlineTreeUseCase,
    GetProjectUseCase,
    ListProjectsUseCase,
    SaveProjectUseCase,
)

_storage = settings.storage

#: 저장소 루트 — 스킬(`.agents/skills`)과 판정 도구(`.agents/tools`)가 여기 산다.
_REPO_ROOT = Path(__file__).resolve().parents[4]


class Container(containers.DeclarativeContainer):
    """VibeDocStudio API DI 컨테이너."""

    # --- 0. 런타임 실행 정책 & 취소 토큰 레지스트리 (단일 싱글톤 상태) ---
    runtime_policy = providers.Singleton(
        RuntimeExecutionPolicy,
        primary_provider=CLI_PROVIDER,
        fallback_provider=GOOGLE_PROVIDER,
        google_api_model=settings.composer_model,
        google_api_timeout_seconds=180,
        agent_cli_model=settings.composer_model,
        agent_cli_timeout_seconds=180,
        agent_cli_bin="agy",
    )
    cancellation_registry = providers.Singleton(CancellationRegistry)

    # --- 1. catalog 도메인 조립 ---
    catalog_repository = providers.Singleton(
        FilesystemCatalogRepository,
        catalog_root=providers.Object(_storage.catalog),
    )
    pdf_vdoc_extractor = providers.Singleton(PdfVDocEngineAdapter)
    form_scaffold_agent = providers.Singleton(
        FormScaffoldAgent,
        policy=runtime_policy,
        agent_runs_dir=providers.Object(_storage.state / "agent_runs"),
        fidelity_tools_dir=providers.Object(_REPO_ROOT / ".agents" / "tools" / "visual_fidelity"),
        fidelity_skill_dir=providers.Object(_REPO_ROOT / ".agents" / "skills" / "external_pm_08_visual_fidelity_replicator"),
    )

    list_catalog_forms = providers.Factory(
        ListCatalogFormsUseCase,
        repository=catalog_repository,
    )
    get_catalog_bundle = providers.Factory(
        GetCatalogBundleUseCase,
        repository=catalog_repository,
    )
    ingest_pdf_to_catalog = providers.Factory(
        IngestPdfToCatalogUseCase,
        repository=catalog_repository,
        extractor=pdf_vdoc_extractor,
    )
    scaffold_pdf_to_document = providers.Factory(
        ScaffoldPdfToDocumentUseCase,
        agent=form_scaffold_agent,
    )
    catalog_service = providers.Factory(
        CatalogService,
        list_forms=list_catalog_forms,
        get_bundle=get_catalog_bundle,
        ingest_pdf=ingest_pdf_to_catalog,
        scaffold_pdf=scaffold_pdf_to_document,
    )

    # --- 2. documents 도메인 조립 (`data/knowledge/documents` + `cache/outlines`) ---
    document_repository = providers.Singleton(
        LocalVDocDocumentRepository,
        root_dir=providers.Object(_storage.knowledge_of("documents")),
    )
    outline_cache = providers.Singleton(
        FileOutlineCacheAdapter,
        cache_root=providers.Object(_storage.cache_of("outlines")),
    )
    list_documents = providers.Factory(
        ListDocumentsUseCase,
        repository=document_repository,
    )
    get_document = providers.Factory(
        GetDocumentUseCase,
        repository=document_repository,
    )
    get_document_page_chunk = providers.Factory(
        GetDocumentPageChunkUseCase,
        repository=document_repository,
    )
    save_document = providers.Factory(
        SaveDocumentUseCase,
        repository=document_repository,
    )
    update_slot_content = providers.Factory(
        UpdateSlotContentUseCase,
        repository=document_repository,
    )
    patch_document_structure = providers.Factory(
        PatchDocumentStructureUseCase,
        repository=document_repository,
        outline_cache=outline_cache,
    )
    delete_document = providers.Factory(
        DeleteDocumentUseCase,
        repository=document_repository,
    )
    document_service = providers.Factory(
        DocumentService,
        list_docs=list_documents,
        get_doc=get_document,
        save_doc=save_document,
        update_slot=update_slot_content,
        delete_doc=delete_document,
        get_page_chunk=get_document_page_chunk,
        patch_structure=patch_document_structure,
    )

    # --- 3. backdata 도메인 조립 (`data/knowledge/backdata`) ---
    backdata_repository = providers.Singleton(
        LocalBackdataRepository,
        root_dir=providers.Object(_storage.knowledge_of("backdata")),
    )
    import_raw_backdata = providers.Factory(
        ImportRawBackdataUseCase,
        repository=backdata_repository,
    )
    list_backdata_chunks = providers.Factory(
        ListBackdataChunksUseCase,
        repository=backdata_repository,
    )
    backdata_service = providers.Factory(
        BackdataService,
        import_raw=import_raw_backdata,
        list_chunks=list_backdata_chunks,
    )

    # --- 4. composer 도메인 조립 (`data/knowledge/composer`) ---
    slot_composer_harness = providers.Singleton(
        GroundedSlotComposerAdapter,
        model_name=providers.Object(settings.composer_model),
    )
    composition_archive = providers.Singleton(
        LocalCompositionArchiveAdapter,
        root_dir=providers.Object(_storage.knowledge_of("composer")),
    )
    slot_composer_agent = providers.Factory(
        SlotComposerAgent,
        harness=slot_composer_harness,
    )
    storyline_scaffold_agent = providers.Singleton(
        StorylineScaffoldAgent,
        model_name=providers.Object(settings.composer_model),
    )
    template_tuning_agent = providers.Singleton(
        TemplateTuningAgent,
        model_name=providers.Object(settings.composer_model),
    )
    compose_slot_draft = providers.Factory(
        ComposeSlotDraftUseCase,
        agent=slot_composer_agent,
        archive=composition_archive,
    )
    compose_storyline_phase1 = providers.Factory(
        ComposeStorylinePhase1UseCase,
        agent=storyline_scaffold_agent,
    )
    recommend_templates_phase2 = providers.Factory(
        RecommendTemplatesPhase2UseCase,
        agent=template_tuning_agent,
    )
    cancel_composition_run = providers.Factory(
        CancelCompositionRunUseCase,
        registry=cancellation_registry,
    )
    composer_service = providers.Factory(
        ComposerService,
        compose_draft=compose_slot_draft,
        compose_storyline=compose_storyline_phase1,
        recommend_templates=recommend_templates_phase2,
        cancel_run=cancel_composition_run,
    )

    # --- 5. projects 도메인 조립 (`data/knowledge/projects`) ---
    project_repository = providers.Singleton(
        LocalVProjectRepository,
        root_dir=providers.Object(_storage.knowledge_of("projects")),
    )
    list_projects = providers.Factory(
        ListProjectsUseCase,
        repository=project_repository,
    )
    get_project = providers.Factory(
        GetProjectUseCase,
        repository=project_repository,
    )
    save_project = providers.Factory(
        SaveProjectUseCase,
        repository=project_repository,
    )
    get_project_outline_tree = providers.Factory(
        GetProjectOutlineTreeUseCase,
        repository=project_repository,
    )
    bind_reference_projects = providers.Factory(
        BindReferenceProjectsUseCase,
        repository=project_repository,
    )
    clone_node_with_provenance = providers.Factory(
        CloneNodeWithProvenanceUseCase,
        repository=project_repository,
    )
    project_service = providers.Factory(
        ProjectService,
        list_projects=list_projects,
        get_project=get_project,
        save_project=save_project,
        get_outline_tree=get_project_outline_tree,
        bind_references=bind_reference_projects,
        clone_node=clone_node_with_provenance,
    )
