/**
 * @vibe/ai-vault — AI 를 볼트 파일 모델에 잇는 어댑터 층.
 * - Composer: 컨텍스트 제공자 · 클라이언트 도구(범위 가드 · 변경안) · 설정/대기열 저장소 · 런타임
 * - 에셋 AI: 블록 · 레퍼런스 → 에셋 추상화 · 적용 미리보기 (백엔드 없으면 규칙 폴백)
 * 화면(React)은 앱이 조립한다.
 */
export * from "./contexts";
export * from "./media";
export * from "./store";
export * from "./tools";
export * from "./workspace";
export * from "./assetAi";
