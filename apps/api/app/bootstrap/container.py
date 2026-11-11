"""애플리케이션의 유일한 객체 조립 및 저장 등급 루트 주입 장소 (`app.bootstrap.container`).

도메인 유스케이스와 어댑터는 여기서만 구체 구현체를 선택하고,
`StorageRoots` 경로 주입도 오직 이 파일에서만 수행한다.

라우터는 이 모듈을 import 하지 않는다. `Provide["<provider 이름>"]` 문자열로만 의존하고
`app.main.create_app()` 이 wiring 으로 연결한다. 그래서 라우터 하나를 import 해도
다른 도메인의 조립 코드가 끌려오지 않는다.
"""
from __future__ import annotations

from functools import partial
from pathlib import Path

from dependency_injector import containers, providers
from harness_kit import packs
from harness_kit import patterns as layer_patterns

from app.assistant.use_cases import AssistantService
from app.assistant.workspace import ResourceWorkspace
from app.authoring.adapters import (
    JsonlUsageLedger,
    LocalCompositionArchiveAdapter,
    LocalStagingStore,
    RuleSlotDrafter,
)
from app.authoring.agents import (
    KeywordTemplateRecommender,
    ReferenceStorylineScaffolder,
    SlotComposerAgent,
)
from app.authoring.use_cases import (
    CancelCompositionRunUseCase,
    ComposeSlotDraftUseCase,
    ComposeStorylinePhase1UseCase,
    HarnessService,
    RecommendTemplatesPhase2UseCase,
    StagedPhaseRunner,
    StagingQueueUseCase,
)
from app.catalog.adapters import FilesystemCatalogRepository, PdfVDocEngineAdapter
from app.catalog.use_cases import (
    GetCatalogBundleUseCase,
    IngestPdfToCatalogUseCase,
    ListCatalogFormsUseCase,
)
from app.core.config import Settings
from app.core.observation import CancellationRegistry
from app.documents.adapters import LocalVDocDocumentRepository
from app.documents.use_cases import (
    DeleteDocumentUseCase,
    GetDocumentPageChunkUseCase,
    GetDocumentUseCase,
    ListDocumentsUseCase,
    ListRevisionsUseCase,
    PatchDocumentStructureUseCase,
    SaveDocumentUseCase,
    UpdateSlotContentUseCase,
)
from app.form_scaffold.adapters import AgySlotTextRefiner, LocalScaffoldJobStore
from app.form_scaffold.agents import FormScaffoldAgent
from app.form_scaffold.use_cases import (
    PreviewPdfUseCase,
    ScaffoldJobRunner,
    ScaffoldPdfToDocumentUseCase,
    ScaffoldUrlToDocumentUseCase,
)
from app.llm import catalog as llm_catalog
from app.llm.adapters import AssistantEngineProvider, OsCredentialStore, run_agy_print
from app.llm.policy import CLI_PROVIDER, GOOGLE_PROVIDER, RuntimeExecutionPolicy
from app.llm.use_cases import (
    DeleteGoogleApiKeyUseCase,
    GetRuntimeDashboardUseCase,
    SetGoogleApiKeyUseCase,
    UpdateRuntimePolicyUseCase,
)
from app.projects.adapters import LocalVProjectRepository
from app.projects.use_cases import (
    ApplyOutlineCommandUseCase,
    GetProjectOutlineTreeUseCase,
    GetProjectUseCase,
    ListProjectsUseCase,
    SaveProjectUseCase,
)
from app.reference.adapters import (
    HtmlStructureExtractor,
    LocalReferenceLibrary,
    MeasuredLayerAnalyzer,
    PyMuPdfExtractor,
    UrllibWebFetcher,
)
from app.reference.use_cases import ReferenceLibraryService
from app.resource.backdata.adapters import LocalBackdataRepository
from app.resource.backdata.use_cases import (
    ImportRawBackdataUseCase,
    ListBackdataChunksUseCase,
)
from app.resource.index.adapters import (
    AgyCardEnricher,
    FileEnrichmentCache,
    FsDeckFiles,
    LocalDeckRegistry,
    LocalJobStore,
)
from app.resource.index.use_cases import (
    IndexJobRunner,
    KnowledgeDeckService,
    KnowledgeToolbox,
)
from app.resource.ledger.adapters import (
    FileDirectoryProvider,
    LocalLedgerRepository,
    WebArticleProvider,
)
from app.resource.ledger.use_cases import ResourceLedgerService


def _card_enricher_factory(settings: Settings, policy: RuntimeExecutionPolicy, sandbox: Path):
    """색인 작업마다 부르는 LLM 실행기 팩토리 — 실행 정책의 현재 agy 모델을 따른다 (설정 화면에서 바꾸면 다음 작업부터)."""

    def make():
        if not settings.external_llm_enabled:
            return None
        return AgyCardEnricher(
            executable=policy.agent_cli_bin or "agy",
            model=settings.knowledge_index_model or policy.agent_cli_model,
            sandbox_dir=sandbox,
            timeout_seconds=420,
        )

    return make


class Container(containers.DeclarativeContainer):
    """VibeDocStudio API DI 컨테이너. `settings` 는 `create_app()` 이 주입한다."""

    settings = providers.Dependency(instance_of=Settings)
    storage = providers.Callable(lambda s: s.storage, settings)

    # --- 0. LLM 게이트웨이: 실행 정책 · 자격 증명 (프로세스 단일 상태) · 취소 토큰 ---
    runtime_policy = providers.Singleton(
        lambda s: RuntimeExecutionPolicy(
            primary_provider=CLI_PROVIDER,
            fallback_provider=GOOGLE_PROVIDER,
            google_api_model=llm_catalog.DEFAULT_GOOGLE_MODEL,
            google_api_timeout_seconds=180,
            # 설정의 Composer 모델이 표시용 이름이면 실행 가능한 인라인 기본 agy 모델을 쓴다
            agent_cli_model=llm_catalog.agy_model_or(s.composer_model, s.assistant_inline_model),
            agent_cli_timeout_seconds=180,
            agent_cli_bin="agy",
        ),
        settings,
    )
    credentials = providers.Singleton(OsCredentialStore)
    cancellation_registry = providers.Singleton(CancellationRegistry)

    # --- 1. LLM 게이트웨이: AI 설정 화면 ---
    get_runtime_dashboard = providers.Factory(
        GetRuntimeDashboardUseCase,
        policy=runtime_policy,
        credentials=credentials,
        model_options=providers.Object(llm_catalog.SETTINGS_OPTIONS),
    )
    update_runtime_policy = providers.Factory(UpdateRuntimePolicyUseCase, policy=runtime_policy)
    set_google_api_key = providers.Factory(SetGoogleApiKeyUseCase, credentials=credentials)
    delete_google_api_key = providers.Factory(DeleteGoogleApiKeyUseCase, credentials=credentials)

    # --- 2. catalog: 서식 목록 · 번들 · PDF → 카탈로그 인입 ---
    catalog_repository = providers.Singleton(
        FilesystemCatalogRepository,
        catalog_root=providers.Callable(lambda st: st.catalog, storage),
    )
    pdf_vdoc_extractor = providers.Singleton(PdfVDocEngineAdapter)
    list_catalog_forms = providers.Factory(ListCatalogFormsUseCase, repository=catalog_repository)
    get_catalog_bundle = providers.Factory(GetCatalogBundleUseCase, repository=catalog_repository)
    ingest_pdf_to_catalog = providers.Factory(
        IngestPdfToCatalogUseCase,
        repository=catalog_repository,
        extractor=pdf_vdoc_extractor,
    )

    # --- 2-1. form_scaffold: PDF → 편집 가능한 .vdoc (기준선 · 피델리티 루프 · 단발 구획명 정리) ---
    form_scaffold_agent = providers.Singleton(
        FormScaffoldAgent,
        policy=runtime_policy,
        agent_runs_dir=providers.Callable(lambda st: st.state / "agent_runs", storage),
        fidelity_tools_dir=providers.Callable(lambda: packs.path("form-scaffold:tools/visual_fidelity")),
        fidelity_skill_dir=providers.Callable(
            lambda: packs.path("form-scaffold:skills/external_pm_08_visual_fidelity_replicator")
        ),
        external_llm_enabled=providers.Callable(lambda s: s.external_llm_enabled, settings),
        agentic_loop_enabled=providers.Callable(lambda s: s.scaffold_agent_loop_enabled, settings),
        # 단발 구획명 정리는 빈 샌드박스 폴더에서 돈다 (agy 내장 도구가 사용자 파일을 건드리지 않게)
        one_shot=providers.Callable(
            lambda st: partial(run_agy_print, cwd=st.state / "form_scaffold" / "sandbox"), storage
        ),
        slot_refiner=providers.Callable(
            lambda st, pol: AgySlotTextRefiner(
                one_shot=partial(run_agy_print, cwd=st.state / "form_scaffold" / "sandbox"),
                policy=pol,
                timeout_seconds=120,
                work_root=st.state / "form_scaffold" / "sandbox" / "_slot_refine",
            ),
            storage,
            runtime_policy,
        ),
    )
    scaffold_pdf_to_document = providers.Factory(ScaffoldPdfToDocumentUseCase, agent=form_scaffold_agent)
    scaffold_url_to_document = providers.Factory(ScaffoldUrlToDocumentUseCase)
    preview_pdf = providers.Factory(PreviewPdfUseCase)
    scaffold_job_store = providers.Singleton(
        LocalScaffoldJobStore,
        root=providers.Callable(lambda st: st.state / "form_scaffold" / "jobs", storage),
    )
    scaffold_jobs = providers.Singleton(
        ScaffoldJobRunner,
        store=scaffold_job_store,
        agent=form_scaffold_agent,
        max_parallel_jobs=1,
    )

    # --- 3. documents 도메인 (`data/knowledge/documents`) ---
    document_repository = providers.Singleton(
        LocalVDocDocumentRepository,
        root_dir=providers.Callable(lambda st: st.knowledge_of("documents"), storage),
    )
    list_documents = providers.Factory(ListDocumentsUseCase, repository=document_repository)
    get_document = providers.Factory(GetDocumentUseCase, repository=document_repository)
    get_document_page_chunk = providers.Factory(GetDocumentPageChunkUseCase, repository=document_repository)
    save_document = providers.Factory(SaveDocumentUseCase, repository=document_repository)
    list_document_revisions = providers.Factory(ListRevisionsUseCase, repository=document_repository)
    update_slot_content = providers.Factory(UpdateSlotContentUseCase, repository=document_repository)
    patch_document_structure = providers.Factory(PatchDocumentStructureUseCase, repository=document_repository)
    delete_document = providers.Factory(DeleteDocumentUseCase, repository=document_repository)

    # --- 4. Resource (사실 근거): RM 원장 (`data/knowledge/resource_ledger`) · 업로드 (`data/knowledge/resources`) ---
    resource_ledger = providers.Singleton(
        ResourceLedgerService,
        repository=providers.Singleton(
            LocalLedgerRepository,
            root_dir=providers.Callable(lambda st: st.knowledge_of("resource_ledger"), storage),
            legacy_projects_dir=providers.Callable(lambda st: st.state / "projects", storage),
        ),
        files=providers.Singleton(FileDirectoryProvider),
        web=providers.Singleton(WebArticleProvider),
        uploads_root=providers.Callable(lambda st: st.knowledge_of("resources"), storage),
    )

    # --- 4-1. Resource: 백데이터 원문 단락 (`data/knowledge/backdata`) ---
    backdata_repository = providers.Singleton(
        LocalBackdataRepository,
        root_dir=providers.Callable(lambda st: st.knowledge_of("backdata"), storage),
    )
    import_raw_backdata = providers.Factory(ImportRawBackdataUseCase, repository=backdata_repository)
    list_backdata_chunks = providers.Factory(ListBackdataChunksUseCase, repository=backdata_repository)

    # --- 5. authoring: 규칙 초안기 · 스토리라인 · 서식 추천 (`data/knowledge/composer`) · Staged 대기열 ---
    slot_composer_harness = providers.Singleton(RuleSlotDrafter)
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
    # 대기열은 프로젝트 매니페스트 옆 `data/knowledge/projects/<id>/staging.json` 에 둔다
    staging_store = providers.Singleton(
        LocalStagingStore, root_dir=providers.Callable(lambda st: st.knowledge_of("projects"), storage)
    )
    staging_queue = providers.Factory(StagingQueueUseCase, store=staging_store)

    # --- 6. projects 도메인 (`data/knowledge/projects`) ---
    project_repository = providers.Singleton(
        LocalVProjectRepository,
        root_dir=providers.Callable(lambda st: st.knowledge_of("projects"), storage),
    )
    list_projects = providers.Factory(ListProjectsUseCase, repository=project_repository)
    get_project = providers.Factory(GetProjectUseCase, repository=project_repository)
    save_project = providers.Factory(SaveProjectUseCase, repository=project_repository)
    get_project_outline_tree = providers.Factory(GetProjectOutlineTreeUseCase, repository=project_repository)
    apply_outline_command = providers.Factory(ApplyOutlineCommandUseCase, repository=project_repository)

    # --- 7. Resource: 자동 색인 지식 덱 (`data/knowledge/decks` · `data/knowledge/jobs`) ---
    knowledge_files = providers.Singleton(FsDeckFiles, root=providers.Callable(lambda st: st.knowledge_of("decks"), storage))
    knowledge_registry = providers.Singleton(
        LocalDeckRegistry,
        root=providers.Callable(lambda st: st.knowledge_of("decks"), storage),
        legacy_projects_dir=providers.Callable(lambda st: st.state / "projects", storage),
    )
    knowledge_job_store = providers.Singleton(LocalJobStore, root=providers.Callable(lambda st: st.knowledge_of("jobs"), storage))
    knowledge_cache = providers.Singleton(
        FileEnrichmentCache, root=providers.Callable(lambda st: st.cache_of("knowledge") / "enrich", storage)
    )
    knowledge_jobs = providers.Singleton(
        IndexJobRunner,
        registry=knowledge_registry,
        files=knowledge_files,
        jobs=knowledge_job_store,
        cache=knowledge_cache,
        enricher_factory=providers.Callable(
            _card_enricher_factory, settings, runtime_policy,
            providers.Callable(lambda st: st.state / "knowledge" / "sandbox", storage),
        ),
        max_parallel_jobs=providers.Callable(lambda s: s.knowledge_parallel_jobs, settings),
        llm_concurrency=providers.Callable(lambda s: s.knowledge_llm_concurrency, settings),
    )
    knowledge_decks = providers.Singleton(KnowledgeDeckService, registry=knowledge_registry, files=knowledge_files)
    knowledge_toolbox = providers.Singleton(
        KnowledgeToolbox,
        files=knowledge_files,
        skill_dir=providers.Callable(lambda: packs.path("resource:index/skills/knowledge_deck_reader")),
    )

    # --- 8. assistant 도메인 (AI Composer · 인라인 AI 공용 실행 계층) ---
    # 리소스 작업 공간: RM 에서 체크한 자료를 agy 에 읽기 전용으로 마운트한다 (훅 · vibefs MCP 는 샌드박스 `.agents/`)
    resource_workspace = providers.Singleton(
        ResourceWorkspace,
        state_dir=providers.Callable(lambda st: st.state / "assistant" / "workspace", storage),
        sandbox_dir=providers.Callable(lambda st: st.state / "assistant" / "sandbox", storage),
        agy_executable=providers.Callable(lambda p: p.agent_cli_bin, runtime_policy),
        transport=providers.Callable(lambda s: s.agy_transport, settings),
        documents_root=providers.Callable(lambda st: st.knowledge_of("documents"), storage),
        references_root=providers.Callable(lambda st: st.knowledge_of("references") / "items", storage),
    )
    assistant_engines = providers.Singleton(
        AssistantEngineProvider,
        agy_executable=providers.Callable(lambda p: p.agent_cli_bin, runtime_policy),
        sandbox_dir=providers.Callable(lambda st: st.state / "assistant" / "sandbox", storage),
        external_llm_enabled=providers.Callable(lambda s: s.external_llm_enabled, settings),
        google_api_key=providers.Callable(lambda c: c.get_google_api_key, credentials),
        prepare_sandbox=providers.Callable(lambda ws: ws.prepare, resource_workspace),
        transport=providers.Callable(lambda s: s.agy_transport, settings),
        default_thought_level=providers.Callable(lambda s: s.assistant_thought_level, settings),
        mcp_server_spec_provider=providers.Callable(lambda ws: ws.mcp_server_spec, resource_workspace),
        roots_provider=providers.Callable(lambda ws: ws.roots_for, resource_workspace),
    )
    assistant_service = providers.Singleton(
        AssistantService,
        engines=assistant_engines,
        policy=runtime_policy,
        inline_model=providers.Callable(lambda s: s.assistant_inline_model, settings),
        server_tools=knowledge_toolbox,
        workspace=resource_workspace,
    )

    # --- 8-1. authoring: 하네스 (LLM 게이트웨이 · 지식 덱 근거를 쓴다) ---
    usage_ledger = providers.Singleton(
        JsonlUsageLedger, path=providers.Callable(lambda st: st.state / "assistant" / "ledger.jsonl", storage)
    )
    harness_service = providers.Singleton(
        HarnessService,
        engines=assistant_engines,
        policy=runtime_policy,
        inline_model=providers.Callable(lambda s: s.assistant_inline_model, settings),
        server_tools=knowledge_toolbox,
        ledger=usage_ledger,
    )

    # --- 9. reference 도메인 (`data/knowledge/references`) ---
    # 층위 측정 자는 assistant 작업대와 같은 것을 꽂는다 (레퍼런스와 내 글을 같은 자로 재야 비교가 된다)
    reference_library = providers.Singleton(
        ReferenceLibraryService,
        library=providers.Singleton(
            LocalReferenceLibrary, root_dir=providers.Callable(lambda st: st.knowledge_of("references"), storage)
        ),
        pdf_extractor=providers.Singleton(PyMuPdfExtractor),
        html_extractor=providers.Singleton(HtmlStructureExtractor),
        fetcher=providers.Singleton(UrllibWebFetcher),
        analyzer=providers.Singleton(
            MeasuredLayerAnalyzer, measure=layer_patterns.measure, by_layer=layer_patterns.by_layer
        ),
    )
