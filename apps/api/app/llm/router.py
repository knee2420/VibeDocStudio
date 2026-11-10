"""LLM 게이트웨이 HTTP 라우터 — AI 설정 화면 (`/api/runtime`, `/api/providers`)."""
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, Response

from .policy import RuntimePolicyUpdate
from .schemas import (
    GoogleApiKeyRequest,
    ModelOptionResponse,
    ProviderKeyStatusResponse,
    RuntimeDashboardResponse,
    RuntimePolicyResponse,
    RuntimePolicyUpdateRequest,
)
from .use_cases import (
    DeleteGoogleApiKeyUseCase,
    GetRuntimeDashboardUseCase,
    SetGoogleApiKeyUseCase,
    UpdateRuntimePolicyUseCase,
)

router = APIRouter()

GetDashboardDep = Annotated[GetRuntimeDashboardUseCase, Depends(Provide["get_runtime_dashboard"])]
UpdatePolicyDep = Annotated[UpdateRuntimePolicyUseCase, Depends(Provide["update_runtime_policy"])]
SetGoogleKeyDep = Annotated[SetGoogleApiKeyUseCase, Depends(Provide["set_google_api_key"])]
DeleteGoogleKeyDep = Annotated[DeleteGoogleApiKeyUseCase, Depends(Provide["delete_google_api_key"])]


@router.get("/runtime", response_model=RuntimeDashboardResponse)
@inject
def get_runtime_dashboard(use_case: GetDashboardDep) -> RuntimeDashboardResponse:
    dashboard = use_case.execute()
    return RuntimeDashboardResponse(
        policy=RuntimePolicyResponse.from_view(dashboard.policy),
        googleConfigured=dashboard.google_configured,
        cliAvailable=dashboard.cli_available,
        models=[ModelOptionResponse.from_option(m) for m in dashboard.models],
    )


@router.put("/runtime/policy", response_model=RuntimePolicyResponse)
@inject
def update_runtime_policy(
    req: RuntimePolicyUpdateRequest,
    use_case: UpdatePolicyDep,
) -> RuntimePolicyResponse:
    view = use_case.execute(
        RuntimePolicyUpdate(
            primary_provider=req.primaryProvider,
            fallback_provider=req.fallbackProvider,
            primary_model=req.primaryModel,
            fallback_model=req.fallbackModel,
            primary_timeout_seconds=req.primaryTimeoutSeconds,
            fallback_timeout_seconds=req.fallbackTimeoutSeconds,
        )
    )
    return RuntimePolicyResponse.from_view(view)


@router.put("/providers/google-api", response_model=ProviderKeyStatusResponse)
@inject
def configure_google_api(
    req: GoogleApiKeyRequest,
    use_case: SetGoogleKeyDep,
) -> ProviderKeyStatusResponse:
    use_case.execute(req.api_key)
    return ProviderKeyStatusResponse(configured=True)


@router.delete("/providers/google-api", status_code=204)
@inject
def delete_google_api(use_case: DeleteGoogleKeyDep) -> Response:
    use_case.execute()
    return Response(status_code=204)
