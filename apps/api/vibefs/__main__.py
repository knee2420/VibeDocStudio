"""vibefs 프로세스 진입점 — agy 가 `python -I <이 파일>` 로 띄운다.

`-I`(격리 모드)는 스크립트 폴더를 import 경로에 넣지 않으므로, 패키지가 들어 있는 폴더를 여기서 한 번만
경로에 올린 뒤 패키지로 import 한다. 패키지 모듈들은 상대 import 만 쓴다.
"""
import sys
from pathlib import Path

if not __package__:
    _HERE = Path(__file__).resolve()
    # vibefs 패키지가 든 폴더 · 하네스 기본기(harness-kit) — 규칙 · 도구 명세 · 어휘는 하네스 팩에서 읽는다
    sys.path[:0] = [str(_HERE.parents[1]), str(_HERE.parents[3] / "packages" / "harness-kit")]


def main(argv: list[str]) -> int:
    command, rest = (argv[0], argv[1:]) if argv else ("", [])
    if command == "mcp":
        from vibefs import server

        return server.main(rest)
    if command == "hook":
        from vibefs import hook

        return hook.main(rest)
    sys.stderr.write("usage: vibefs (mcp --state <dir> [--session <id>] | hook pre|post --state <dir>)\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
