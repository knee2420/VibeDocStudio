import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * 렌더마다 새로 만들어지는 콜백을 "항상 최신 구현을 부르는 고정 참조"로 바꾼다.
 * `React.memo` 자식에게 넘기는 핸들러가 매번 바뀌어 메모가 깨지는 것을 막는다.
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R
): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
