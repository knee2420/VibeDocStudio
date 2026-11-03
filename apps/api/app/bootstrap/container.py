"""애플리케이션의 유일한 객체 조립 및 저장 등급 루트 주입 장소 (`app.bootstrap.container`).

도메인 유스케이스와 어댑터는 여기서만 구체 구현체를 선택하고,
`StorageRoots` 경로 주입도 오직 이 파일에서만 수행한다.

라우터는 이 모듈을 import 하지 않는다. `Provide["<provider 이름>"]` 문자열로만 의존하고
`app.main.create_app()` 이 wiring 으로 연결한다. 그래서 라우터 하나를 import 해도
다른 도메인의 조립 코드가 끌려오지 않는다.
"""
from __future__ import annotations

from pathlib import Path

from dependency_injector import containers, providers

from app.backdata.adapters import LocalBackdataRepository
from app.backdata.use_cases import (
    ImportRawBackdataUseCase,
    ListBackdataChunksUseCase,
)
from app.catalog.adapters import FilesystemCatalogRepository, PdfVDocEngineAdapter
from app.catalog.agents import FormScaffoldAgent
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
    KeywordTemplateRecommender,
    ReferenceStorylineScaffolder,
    SlotComposerAgent,
)
from app.composer.use_cases import (
    CancelCompositionRunUseCase,
    ComposeSlotDraftUseCase,
    ComposeStorylinePhase1UseCase,
    RecommendTemplatesPhase2UseCase,
    StagedPhaseRunner,
)
from app.core.config import Settings
from app.core.llm.credentials import OsCredentialStore
from app.core.llm.execution_policy import (
    CLI_PROVIDER,
    GOOGLE_PROVIDER,
    RuntimeExecutionPolicy,
)
from app.core.observation import CancellationRegistry
from app.documents.adapters import LocalVDocDocumentRepository
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
from app.projects.use_cases import (
    ApplyOutlineCommandUseCase,
    BindReferenceProjectsUseCase,
    CloneNodeWithProvenanceUseCase,
    GetProjectOutlineTreeUseCase,
    GetProjectUseCase,
    ListProjectsUseCase,
    SaveProjectUseCase,
)
from app.runtime.models import ModelOption
from app.runtime.use_cases import (
    DeleteGoogleApiKeyUseCase,
    GetRuntimeDashboardUseCase,
    SetGoogleApiKeyUseCase,
    UpdateRuntimePolicyUseCase,
)

#: 저장소 루트 — 스킬(`.agents/skills`)과 판정 도구(`.agents/tools`)가 여기 산다.
_REPO_ROOT = Path(__file__).resolve().parents[4]


def _model_options(settings: Settings) -> tuple[ModelOption, ...]:
    return (
        ModelOption(settings.tagger_model, "agy_cli", "초경량 로컬/고속 서식 태깅"),
        ModelOption(settings.composer_model, "agy_cli", "균형 잡힌 주력 서식 스캐폴더", recommended=True),
        ModelOption(settings.pro_model, "agy_cli", "고난도 복합 조항 심층 분석"),
        ModelOption(settings.lite_model, "agy_cli", "초저비용 고속 분류"),
        ModelOption(settings.composer_model, "google_api", "Google Direct REST API 주력", recommended=True),
        ModelOption(settings.lite_model, "google_api", "Google Direct REST API Fallback"),
    )


class Container(containers.DeclarativeContainer):
    """VibeDocStudio API DI 컨테이너. `settings` 는 `create_app()` 이 주입한다."""

    settings = providers.Dependency(instance_of=Settings)
    storage = providers.Callable(lambda s: s.storage, settings)

    # --- 0. 런타임 실행 정책 · 자격 증명 · 취소 토큰 (프로세스 단일 상태) ---
    runtime_policy = providers.Singleton(
        lambda s: RuntimeExecutionPolicy(
            primary_provider=CLI_PROVIDER,
            fallback_provider=GOOGLE_PROVIDER,
            google_api_model=s.composer_model,
            google_api_timeout_seconds=180,
            agent_cli_model=s.composer_model,
            agent_cli_timeout_seconds=180,
            agent_cli_bin="agy",
        ),
        settings,
    )
    credentials = providers.Singleton(OsCredentialStore)
    cancellation_registry = providers.Singleton(CancellationRegistry)

    # --- 1. runtime 도메인 ---
    get_runtime_dashboard = providers.Factory(
        GetRuntimeDashboardUseCase,
        policy=runtime_policy,
        credentials=credentials,
        model_options=providers.Callable(_model_options, settings),
    )
    update_runtime_policy = providers.Factory(UpdateRuntimePolicyUseCase, policy=runtime_policy)
    set_google_api_key = providers.Factory(SetGoogleApiKeyUseCase, credentials=credentials)
    delete_google_api_key = providers.Factory(DeleteGoogleApiKeyUseCase, credentials=credentials)

    # --- 2. catalog 도메인 ---
    catalog_repository = providers.Singleton(
        FilesystemCatalogRepository,
        catalog_root=providers.Callable(lambda st: st.catalog, storage),
    )
    pdf_vdoc_extractor = providers.Singleton(PdfVDocEngineAdapter)
    form_scaffold_agent = providers.Singleton(
        FormScaffoldAgent,
        policy=runtime_policy,
        agent_runs_dir=providers.Callable(lambda st: st.state / "agent_runs", storage),
        fidelity_tools_dir=providers.Object(_REPO_ROOT / ".agents" / "tools" / "visual_fidelity"),
        fidelity_skill_dir=providers.Object(
            _REPO_ROOT / ".agents" / "skills" / "external_pm_08_visual_fidelity_replicator"
        ),
        external_llm_enabled=providers.Callable(lambda s: s.external_llm_enabled, settings),
        agentic_loop_enabled=providers.Callable(lambda s: s.scaffold_agent_loop_enabled, settings),
    )
    list_catalog_forms = providers.Factory(ListCatalogFormsUseCase, repository=catalog_repository)
    get_catalog_bundle = providers.Factory(GetCatalogBundleUseCase, repository=catalog_repository)
    ingest_pdf_to_catalog = providers.Factory(
        IngestPdfToCatalogUseCase,
        repository=catalog_repository,
        extractor=pdf_vdoc_extractor,
    )
    scaffold_pdf_to_document = providers.Factory(ScaffoldPdfToDocumentUseCase, agent=form_scaffold_agent)

    # --- 3. documents 도메인 (`data/knowledge/documents`) ---
    document_repository = providers.Singleton(
        LocalVDocDocumentRepository,
        root_dir=providers.Callable(lambda st: st.knowledge_of("documents"), storage),
    )
    list_documents = providers.Factory(ListDocumentsUseCase, repository=document_repository)
    get_document = providers.Factory(GetDocumentUseCase, repository=document_repository)
    get_document_page_chunk = providers.Factory(GetDocumentPageChunkUseCase, repository=document_repository)
    save_document = providers.Factory(SaveDocumentUseCase, repository=document_repository)
    update_slot_content = providers.Factory(UpdateSlotContentUseCase, repository=document_repository)
    patch_document_structure = providers.Factory(PatchDocumentStructureUseCase, repository=document_repository)
    delete_document = providers.Factory(DeleteDocumentUseCase, repository=document_repository)

    # --- 4. backdata 도메인 (`data/knowledge/backdata`) ---
    backdata_repository = providers.Singleton(
        LocalBackdataRepository,
        root_dir=providers.Callable(lambda st: st.knowledge_of("backdata"), storage),
    )
    import_raw_backdata = providers.Factory(ImportRawBackdataUseCase, repository=backdata_repository)
    list_backdata_chunks = providers.Factory(ListBackdataChunksUseCase, repository=backdata_repository)

    # --- 5. composer 도메인 (`data/knowledge/composer`) ---
    slot_composer_harness = providers.Singleton(
        GroundedSlotComposerAdapter,
        model_name=providers.Callable(lambda s: s.composer_model, settings),
    )
    composition_archive = providers.Singleton(
        LocalCompositionArchiveAdapter,
        root_dir=providers.Callable(lambda st: st.knowledge_of("composer"), storage),
    )
    slot_composer_agent = providers.Factory(SlotComposerAgent, harness=slot_composer_harness)
    storyline_scaffolder = providers.Singleton(ReferenceStorylineScaffolder)
    template_recommender = providers.Singleton(KeywordTemplateRecommender)
    staged_phase_runner = providers.Factory(StagedPhaseRunner, cancellation=cancellation_registry)
    compose_slot_draft = providers.Factory(
        ComposeSlotDraftUseCase,
        agent=slot_composer_agent,
        archive=composition_archive,
    )
    compose_storyline_phase1 = providers.Factory(
        ComposeStorylinePhase1UseCase,
        scaffolder=storyline_scaffolder,
        runner=staged_phase_runner,
    )
    recommend_templates_phase2 = providers.Factory(
        RecommendTemplatesPhase2UseCase,
        recommender=template_recommender,
        runner=staged_phase_runner,
    )
    cancel_composition_run = providers.Factory(CancelCompositionRunUseCase, registry=cancellation_registry)

    # --- 6. projects 도메인 (`data/knowledge/projects`) ---
    project_repository = providers.Singleton(
        LocalVProjectRepository,
        root_dir=providers.Callable(lambda st: st.knowledge_of("projects"), storage),
    )
    list_projects = providers.Factory(ListProjectsUseCase, repository=project_repository)
    get_project = providers.Factory(GetProjectUseCase, repository=project_repository)
    save_project = providers.Factory(SaveProjectUseCase, repository=project_repository)
    get_project_outline_tree = providers.Factory(GetProjectOutlineTreeUseCase, repository=project_repository)
    bind_reference_projects = providers.Factory(BindReferenceProjectsUseCase, repository=project_repository)
    clone_node_with_provenance = providers.Factory(
        CloneNodeWithProvenanceUseCase,
        repository=project_repository,
    )
    apply_outline_command = providers.Factory(ApplyOutlineCommandUseCase, repository=project_repository)
