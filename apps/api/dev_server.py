"""개발용 API 실행기 — `uvicorn --reload` 대신 쓴다 (`pnpm dev:api`).

왜 따로 두나 (Windows):
- uvicorn 리로더는 워커를 내릴 때 `CTRL_C_EVENT` 를 보낸다. 이 신호는 프로세스 하나가 아니라 **같은 콘솔을
  쓰는 모든 프로세스**에 간다. `pnpm --parallel dev` 는 API 와 Vite 가 콘솔을 공유하므로, `.py` 파일을 한 번
  저장할 때마다 Vite · esbuild · pnpm 래퍼까지 함께 죽고 `cmd` 래퍼는 "일괄 작업을 끝내시겠습니까" 에서 멈춘
  채 남았다. 리로드가 dev 스택 전체를 죽이고 좀비를 남기는 원인이었다.
- 워커가 강제 종료되면 lifespan 정리가 돌지 않아 agy 상주 프로세스가 고아로 남았다.

그래서 이 실행기는:
1. 워커(uvicorn)를 **새 프로세스 그룹**으로 띄우고 Job Object 로 묶는다 — 실행기가 어떻게 죽든 워커와
   그 자손(agy 포함)이 함께 정리된다.
2. 재시작은 그 그룹에만 `CTRL_BREAK_EVENT` 를 보내 graceful 종료(lifespan 정리)를 기다리고, 시간 안에
   안 끝나면 트리를 강제 종료한다. 다른 프로세스는 신호를 받지 않는다.
3. `watchfiles` 로 `.py` 변경을 감시한다 (`state/` · 캐시 · 테스트 임시 폴더는 무시).
"""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

from watchfiles import PythonFilter, watch

HERE = Path(__file__).resolve().parent
ENGINE_SRC = HERE.parents[1] / "packages" / "pdf-vdoc-engine"
WATCH_DIRS = [HERE / "app", HERE / "main.py", ENGINE_SRC / "pdf_vdoc_engine"]
GRACEFUL_SECONDS = 8
IS_WINDOWS = sys.platform == "win32"

# Windows 콘솔(cp949)에서 출력 한 줄 때문에 실행기가 죽지 않게 한다.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

sys.path.insert(0, str(HERE))
from app.core.process_tree import ProcessTree, popen_tree  # noqa: E402


def _start(port: str) -> ProcessTree:
    cmd = [sys.executable, "-m", "uvicorn", "main:app", "--port", port]
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if IS_WINDOWS else 0
    tree = popen_tree(cmd, cwd=str(HERE), creationflags=flags, start_new_session=not IS_WINDOWS)
    print(f"[dev_server] uvicorn 시작 (pid={tree.proc.pid}, port={port})", flush=True)
    return tree


def _stop(tree: ProcessTree) -> None:
    proc = tree.proc
    if proc.poll() is None:
        try:
            if IS_WINDOWS:
                os.kill(proc.pid, signal.CTRL_BREAK_EVENT)  # 이 프로세스 그룹에만 간다
            else:
                os.killpg(proc.pid, signal.SIGINT)
            proc.wait(timeout=GRACEFUL_SECONDS)
        except (subprocess.TimeoutExpired, OSError):
            print("[dev_server] graceful 종료 시간 초과 -> 프로세스 트리를 강제 종료합니다", flush=True)
    tree.kill()


def main() -> int:
    port = os.environ.get("VIBE_API_PORT", "8090")
    if "--port" in sys.argv:
        port = sys.argv[sys.argv.index("--port") + 1]
    tree = _start(port)
    try:
        for changes in watch(*[p for p in WATCH_DIRS if p.exists()], watch_filter=PythonFilter(), debounce=400):
            names = sorted({Path(c[1]).name for c in changes})
            print(f"[dev_server] 변경 감지: {', '.join(names[:5])}{' ...' if len(names) > 5 else ''} -> 재시작", flush=True)
            _stop(tree)
            time.sleep(0.2)
            tree = _start(port)
    except KeyboardInterrupt:
        pass
    finally:
        _stop(tree)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
