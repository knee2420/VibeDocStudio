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

from app.assistant.adapters import AssistantEngineProvider
from app.assistant.use_cases import AssistantService
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
    """AI 설정 모달의 모델 목록. agy 는 실제 `agy models` 식별자여야 CLI 가 받아들인다."""
    return (
        ModelOption("gemini-3.8-flash-low", "agy_cli", "고속 응답 — Composer · 인라인 기본값", recommended=True),
        ModelOption("gemini-3.8-flash-medium", "agy_cli", "균형 잡힌 주력 작성"),
        ModelOption("gemini-3.8-flash-high", "agy_cli", "깊은 추론이 필요한 작성"),
        ModelOption("gemini-4-argon-medium", "agy_cli", "고난도 복합 조항 심층 분석"),
        ModelOption("claude-sonnet-5-5-medium", "agy_cli", "장문 서술 · 판단 품질"),
        ModelOption("gemini-3.5-flash-lite", "google_api", "Google Direct REST API 고속", recommended=True),
        ModelOption("gemini-3.5-flash", "google_api", "Google Direct REST API 주력"),
    )


def _cli_model(settings: Settings) -> str:
    """설정의 Composer 모델이 agy 식별자(`…-low|medium|high`)가 아니면 실행 가능한 기본값을 쓴다."""
    name = settings.composer_model
    return name if name.endswith(("-low", "-medium", "-high")) else settings.assistant_inline_model


class Container(containers.DeclarativeContainer):
    """VibeDocStudio API DI 컨테이너. `settings` 는 `create_app()` 이 주입한다."""

    settings = providers.Dependency(instance_of=Settings)
    storage = providers.Callable(lambda s: s.storage, settings)

    # --- 0. 런타임 실행 정책 · 자격 증명 · 취소 토큰 (프로세스 단일 상태) ---
    runtime_policy = providers.Singleton(
        lambda s: RuntimeExecutionPolicy(
            primary_provider=CLI_PROVIDER,
            fallback_provider=GOOGLE_PROVIDER,
            google_api_model="gemini-3.5-flash-lite",
            google_api_timeout_seconds=180,
            agent_cli_model=_cli_model(s),
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

    # --- 7. assistant 도메인 (AI Composer · 인라인 AI 공용 실행 계층) ---
    assistant_engines = providers.Singleton(
        AssistantEngineProvider,
        agy_executable=providers.Callable(lambda p: p.agent_cli_bin, runtime_policy),
        sandbox_dir=providers.Callable(lambda st: st.state / "assistant" / "sandbox", storage),
        external_llm_enabled=providers.Callable(lambda s: s.external_llm_enabled, settings),
        google_api_key=providers.Callable(lambda c: c.get_google_api_key, credentials),
    )
    assistant_service = providers.Singleton(
        AssistantService,
        engines=assistant_engines,
        policy=runtime_policy,
        inline_model=providers.Callable(lambda s: s.assistant_inline_model, settings),
    )
