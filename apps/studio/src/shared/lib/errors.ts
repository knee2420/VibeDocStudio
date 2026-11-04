/** `Error` 가 아닌 값도 사용자에게 보여줄 문장으로. */
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
