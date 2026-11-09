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
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLUGIN = "vibefs"

RULE_TEXT = """\
---
trigger: always_on
---
# VibeDocStudio 작업 공간

- 이 작업 폴더는 빈 샌드박스다. 사용자의 자료는 vibefs MCP 도구(ws_overview · ws_tree · ws_glob · ws_grep ·
  ws_outline · ws_links · ws_find · ws_duplicates · ws_diff · ws_coverage)로 찾고, 원문은 `read_file`
  (Path=절대 경로, StartLine, EndLine)로 필요한 줄만 읽는다.
- 터미널 · 파일 쓰기 · 브라우저 · 웹 검색은 차단된다. 시도하지 마라.
- 읽지 않은 내용을 지어내지 마라. 인용은 실제로 read_file 로 읽은 줄 안에서만 한다.
"""


def _arg(value: str) -> str:
    """`cmd /c` 로 실행되는 훅 명령 한 조각. 공백이 있을 때만 따옴표로 감싼다."""
    text = value.replace("\\", "/")
    return f'"{text}"' if " " in text else text


def hook_command(python_exe: str, mode: str, state_dir: Path) -> str:
    return " ".join([_arg(python_exe), "-I", _arg(str(HERE / "hook.py")), mode, "--state", _arg(str(state_dir))])


def build_files(python_exe: str, state_dir: Path, include_plugin: bool = True) -> dict[str, str]:
    hooks = {
        "vibedoc-workspace": {
            "PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": hook_command(python_exe, "pre", state_dir), "timeout": 15}]}],
            "PostToolUse": [{"matcher": "read_file", "hooks": [{"type": "command", "command": hook_command(python_exe, "post", state_dir), "timeout": 15}]}],
        }
    }
    files = {
        ".agents/hooks.json": json.dumps(hooks, ensure_ascii=False, indent=1),
        ".agents/rules/vibedoc.md": RULE_TEXT,
    }
    if include_plugin:
        mcp = {
            "mcpServers": {
                PLUGIN: {
                    "command": python_exe.replace("\\", "/"),
                    "args": ["-I", str(HERE / "vibefs_server.py").replace("\\", "/"), "--state", str(state_dir).replace("\\", "/")],
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
            import shutil
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
