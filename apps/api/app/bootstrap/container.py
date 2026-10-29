"""애플리케이션의 유일한 객체 조립 및 저장 등급 루트 주입 장소 (`app.bootstrap.container`).

도메인 서비스와 어댑터는 여기서만 구체 구현체를 선택하고,
`StorageRoots` 경로 주입도 오직 이 파일에서만 수행한다.
"""
from __future__ import annotations

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
from app.composer.agents import SlotComposerAgent
from app.composer.service import ComposerService
from app.composer.use_cases import ComposeSlotDraftUseCase
from app.core.config import settings
from app.core.llm.execution_policy import (
    CLI_PROVIDER,
    GOOGLE_PROVIDER,
    RuntimeExecutionPolicy,
)
from app.documents.adapters import LocalVDocDocumentRepository
from app.documents.service import DocumentService
from app.documents.use_cases import (
    DeleteDocumentUseCase,
    GetDocumentUseCase,
    ListDocumentsUseCase,
    SaveDocumentUseCase,
    UpdateSlotContentUseCase,
)

_storage = settings.storage


class Container(containers.DeclarativeContainer):
    """VibeDocStudio API DI 컨테이너."""

    # --- 0. 런타임 실행 정책 (단일 싱글톤 상태) ---
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

    # --- 1. catalog 도메인 조립 ---
    catalog_repository = providers.Singleton(
        FilesystemCatalogRepository,
        catalog_root=providers.Object(_storage.catalog),
    )
    pdf_vdoc_extractor = providers.Singleton(PdfVDocEngineAdapter)
    form_scaffold_agent = providers.Singleton(
        FormScaffoldAgent,
        policy=runtime_policy,
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

    # --- 2. documents 도메인 조립 (`data/knowledge/documents`) ---
    document_repository = providers.Singleton(
        LocalVDocDocumentRepository,
        root_dir=providers.Object(_storage.knowledge_of("documents")),
    )
    list_documents = providers.Factory(
        ListDocumentsUseCase,
        repository=document_repository,
    )
    get_document = providers.Factory(
        GetDocumentUseCase,
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
    compose_slot_draft = providers.Factory(
        ComposeSlotDraftUseCase,
        agent=slot_composer_agent,
        archive=composition_archive,
    )
    composer_service = providers.Factory(
        ComposerService,
        compose_draft=compose_slot_draft,
    )

