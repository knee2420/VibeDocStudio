"""[A Observation] 실행 관측 자료의 저장 게이트.

`data/runs/{run_id}/` 안에서 **생애주기 파일은 `agent_runtime` 레포지토리가**,
**관측 파일은 이 패키지가** 소유한다. 어느 쪽도 경로를 스스로 만들지 않는다 —
등급 루트는 `bootstrap/container.py` 가 주입한다.
"""
from app.core.observation.run_store import RunObservationStore

__all__ = ["RunObservationStore"]
