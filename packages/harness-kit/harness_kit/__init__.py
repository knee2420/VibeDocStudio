"""harness-kit — 하네스 기본기 (호스트 무관 · 표준 라이브러리만).

에이전트 하네스를 "기본기 + 영역별 팩" 으로 나눈다:

- 기본기(이 패키지, 코드): 팩 읽기 · 규칙 글 조립 · 측정기 · 후보 검증기 실행 · 텍스트 변환
- 영역 팩(`packages/harness-packs`, 데이터): core · editor · reference · resource · authoring · form-scaffold 의
  규칙 글(.md) · 도구 명세 · 레지스트리 · 어휘 · 임계값(.json) · 스킬

이 패키지는 `app` 과 `vibefs` 를 import 하지 않는다. 앱과 샌드박스 런타임이 이 패키지를 쓴다.
"""
from . import gates, packs, patterns, text

__all__ = ["gates", "packs", "patterns", "text"]
