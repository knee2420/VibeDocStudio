"""vibefs 프로세스 진입점 — agy 가 `python -I <이 파일>` 로 띄운다.

`-I`(격리 모드)는 스크립트 폴더를 import 경로에 넣지 않으므로, 패키지가 들어 있는 폴더를 여기서 한 번만
경로에 올린 뒤 패키지로 import 한다. 패키지 모듈들은 상대 import 만 쓴다.
"""
import os
import site
import sys
from pathlib import Path

if not __package__:
    _HERE = Path(__file__).resolve()
    _PKGS = _HERE.parents[3] / "packages"
    # vibefs 패키지가 든 폴더 · 하네스/문서엔진 패키지 — 격리 모드(-I)에서 직접 경로 등록
    _extra = [str(_HERE.parents[1])]
    for _pkg in ("harness-kit", "docstruct-engine", "pdf-fidelity-engine", "pdf-vdoc-engine"):
        _p = _PKGS / _pkg
        if _p.is_dir():
            _extra.append(str(_p))
    sys.path[:0] = _extra
    # Windows 등 --user 설치 의존성(pymupdf, pydantic 등)은 -I 에서 빠지므로 존재할 때만 뒤에 붙인다
    _user_site = site.getusersitepackages()
    if _user_site and os.path.isdir(_user_site) and _user_site not in sys.path:
        sys.path.append(_user_site)


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
