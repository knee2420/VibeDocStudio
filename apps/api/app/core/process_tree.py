"""자식 프로세스 트리를 부모(API 프로세스)와 생사를 같이하도록 묶는다.

Windows 는 부모가 죽어도 자식이 남는다. 터미널을 닫거나 dev 서버를 강제 종료하면 lifespan 정리가
돌지 않아 agy 상주 프로세스(개당 170MB 이상)가 고아로 쌓였다. 그래서 프로세스마다 Job Object 를 만들어
`KILL_ON_JOB_CLOSE` 를 건다.

- 이 프로세스가 어떻게 죽든(정상 종료 · 강제 종료 · 크래시) 커널이 Job 핸들을 닫고, Job 안의 프로세스
  트리 전체가 함께 종료된다.
- `kill()` 은 `TerminateJobObject` 로 agy 가 띄운 손자 프로세스(도구 실행 셸 등)까지 한 번에 끝낸다.

Windows 가 아니거나 Job 생성에 실패하면 평범한 `Popen.kill()` 로 물러난다.
"""
from __future__ import annotations

import logging
import subprocess
import sys
from typing import Optional

logger = logging.getLogger(__name__)

_IS_WINDOWS = sys.platform == "win32"

if _IS_WINDOWS:  # pragma: py-not-win32
    import ctypes
    from ctypes import wintypes

    _kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    _JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
    _JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS = 9

    class _IO_COUNTERS(ctypes.Structure):
        _fields_ = [(name, ctypes.c_ulonglong) for name in (
            "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
            "ReadTransferCount", "WriteTransferCount", "OtherTransferCount",
        )]

    class _JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_longlong),
            ("PerJobUserTimeLimit", ctypes.c_longlong),
            ("LimitFlags", wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", wintypes.DWORD),
            ("SchedulingClass", wintypes.DWORD),
        ]

    class _JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", _JOBOBJECT_BASIC_LIMIT_INFORMATION),
            ("IoInfo", _IO_COUNTERS),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    _kernel32.CreateJobObjectW.restype = wintypes.HANDLE
    _kernel32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    _kernel32.SetInformationJobObject.restype = wintypes.BOOL
    _kernel32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    _kernel32.AssignProcessToJobObject.restype = wintypes.BOOL
    _kernel32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    _kernel32.TerminateJobObject.restype = wintypes.BOOL
    _kernel32.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
    _kernel32.CloseHandle.restype = wintypes.BOOL
    _kernel32.CloseHandle.argtypes = [wintypes.HANDLE]


class ProcessTree:
    """`Popen` 하나와 그 자손 전체. `kill()` 은 트리 전체를 끝낸다."""

    def __init__(self, proc: subprocess.Popen) -> None:
        self.proc = proc
        self._job: Optional[int] = _attach_job(proc) if _IS_WINDOWS else None

    def kill(self) -> None:
        if self._job is not None:  # pragma: py-not-win32
            _kernel32.TerminateJobObject(self._job, 1)
            _kernel32.CloseHandle(self._job)
            self._job = None
        if self.proc.poll() is None:
            try:
                self.proc.kill()
            except OSError:
                pass


def _attach_job(proc: subprocess.Popen) -> Optional[int]:  # pragma: py-not-win32
    job = _kernel32.CreateJobObjectW(None, None)
    if not job:
        logger.warning("[process-tree] CreateJobObject 실패 (err=%s)", ctypes.get_last_error())
        return None
    info = _JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
    info.BasicLimitInformation.LimitFlags = _JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
    ok = _kernel32.SetInformationJobObject(
        job, _JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS, ctypes.byref(info), ctypes.sizeof(info)
    )
    handle = getattr(proc, "_handle", None)
    if ok and handle is not None and _kernel32.AssignProcessToJobObject(job, int(handle)):
        return job
    logger.warning("[process-tree] Job 연결 실패 (pid=%s, err=%s) — 일반 kill 로 정리합니다", proc.pid, ctypes.get_last_error())
    _kernel32.CloseHandle(job)
    return None


def popen_tree(cmd: list[str], **kwargs) -> ProcessTree:
    """`subprocess.Popen(cmd, **kwargs)` 를 띄우고 곧바로 Job 에 묶는다."""
    return ProcessTree(subprocess.Popen(cmd, **kwargs))
