"""agy 작업 폴더(샌드박스)의 `.agents/` 설정을 만든다 — 사용자 전역 agy 설정은 건드리지 않는다.

agy 1.5.3 은 작업 폴더의 `.agents/` 를 그대로 읽는다 (실측):
    .agents/hooks.json                      PreToolUse(가드) · PostToolUse(읽은 범위)
    .agents/plugins/vibefs/plugin.json      작업 폴더 플러그인 표식
    .agents/plugins/vibefs/mcp_config.json  vibefs MCP 서버
    .agents/rules/vibedoc.md                항상 켜지는 규칙 (서브에이전트 포함)

예열 풀이 agy 를 띄우기 **전에** 불러야 한다 (설정은 agy 기동 때 읽힌다).
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

from harness_kit import packs

HERE = Path(__file__).resolve().parent
#: 훅 · MCP 서버 공용 프로세스 진입점
ENTRY = HERE / "__main__.py"
PLUGIN = "vibefs"

#: 작업 폴더 규칙 파일(`.agents/rules/vibedoc.md`) 본문 — 하네스 core 팩의 샌드박스 규칙
RULE_TEXT = packs.text("core:sandbox/rules.md")


def _short_path(path: str) -> str:
    """Windows 8.3 짧은 경로 (`C:/Users/x/클로드 코드 전용` → `C:/Users/x/클로드~1`). 못 구하면 원래 경로."""
    if sys.platform != "win32":
        return path
    try:
        import ctypes
        from ctypes import wintypes

        get_short = ctypes.windll.kernel32.GetShortPathNameW
        get_short.argtypes = [wintypes.LPCWSTR, wintypes.LPWSTR, wintypes.DWORD]
        buf = ctypes.create_unicode_buffer(32768)
        return buf.value if get_short(path, buf, len(buf)) else path
    except (AttributeError, OSError):
        return path


def _arg(value: str) -> str:
    """훅 명령 한 조각. 공백이 있으면 짧은 경로로 바꿔 따옴표 없이 쓴다.

    agy 1.5.3 은 훅을 `cmd /c "<명령>"` 으로 띄우면서 명령 안의 따옴표를 `\\"` 로 이스케이프한다 (실측).
    cmd 는 `\\"` 를 모르므로 따옴표가 하나라도 있으면 경로가 깨져 훅이 exit 1 로 죽고, agy 는 그걸 차단으로
    보고 **모든 도구**를 사유 없이 `failed` 로 막는다 (프로젝트 경로에 공백이 있는 PC 에서 Composer 가 전부 실패).
    짧은 경로를 못 구할 때(8.3 이름이 꺼진 볼륨)만 따옴표로 감싼다.
    """
    text = value
    if " " in text:
        text = _short_path(text)
    text = text.replace("\\", "/")
    return f'"{text}"' if " " in text else text


def hook_command(python_exe: str, mode: str, state_dir: Path) -> str:
    return " ".join([_arg(python_exe), "-I", _arg(str(ENTRY)), "hook", mode, "--state", _arg(str(state_dir))])


def build_files(python_exe: str, state_dir: Path, include_plugin: bool = True) -> dict[str, str]:
    hooks = {
        "vibedoc-workspace": {
            "PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": hook_command(python_exe, "pre", state_dir), "timeout": 15}]}],
            "PostToolUse": [{"matcher": "read_file", "hooks": [{"type": "command", "command": hook_command(python_exe, "post", state_dir), "timeout": 15}]}],
        }
    }
    files = {
        ".agents/hooks.json": json.dumps(hooks, ensure_ascii=False, indent=1),
        ".agents/rules/vibedoc.md": packs.text("core:sandbox/rules.md"),
    }
    if include_plugin:
        mcp = {
            "mcpServers": {
                PLUGIN: {
                    "command": python_exe.replace("\\", "/"),
                    "args": ["-I", str(ENTRY).replace("\\", "/"), "mcp", "--state", str(state_dir).replace("\\", "/")],
                }
            }
        }
        files[f".agents/plugins/{PLUGIN}/plugin.json"] = json.dumps({"name": PLUGIN}, indent=1)
        files[f".agents/plugins/{PLUGIN}/mcp_config.json"] = json.dumps(mcp, ensure_ascii=False, indent=1)
    return files


def prepare_sandbox(sandbox_dir: Path, state_dir: Path, python_exe: str, include_plugin: bool = True) -> list[str]:
    """설정 파일을 쓴다 (내용이 같으면 건드리지 않는다). 바뀐 파일 목록을 돌려준다."""
    changed = []
    state_dir.mkdir(parents=True, exist_ok=True)
    if not include_plugin:
        plugin_dir = sandbox_dir / ".agents" / "plugins" / PLUGIN
        if plugin_dir.exists():
            shutil.rmtree(plugin_dir, ignore_errors=True)
            changed.append(f".agents/plugins/{PLUGIN} (removed)")
    for rel, content in build_files(python_exe, state_dir, include_plugin=include_plugin).items():
        path = sandbox_dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            if path.read_text(encoding="utf-8") == content:
                continue
        except OSError:
            pass
        path.write_text(content, encoding="utf-8")
        changed.append(rel)
    return changed
