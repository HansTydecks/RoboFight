"""Shared helpers to execute kid code: restricted builtins, imports, step limits."""

import builtins
import sys

CODE_FILENAME = "<robot>"
BLOCKED_BUILTINS = {"input", "open", "exit", "quit", "breakpoint", "help", "eval", "exec",
                    "compile", "globals", "locals", "vars", "memoryview"}
ALLOWED_MODULES = {"math", "random"}


def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root = name.split(".")[0]
    if root not in ALLOWED_MODULES:
        raise ImportError(
            f"Das Modul `{name}` ist im Roboter nicht erlaubt. Erlaubt sind: "
            + ", ".join(sorted(ALLOWED_MODULES)))
    return __import__(name, globals, locals, fromlist, level)


def make_builtins(print_fn):
    safe = {k: v for k, v in vars(builtins).items() if k not in BLOCKED_BUILTINS}
    safe["__import__"] = _safe_import
    safe["print"] = print_fn
    return safe


class StepCounter:
    """sys.settrace based line counter for code compiled as CODE_FILENAME."""

    def __init__(self, limit, on_limit):
        self.limit = limit
        self.count = 0
        self.on_limit = on_limit  # callable(lineno) -> exception to raise
        self.check = None  # optional callable() -> exception or None

    def _local(self, frame, event, arg):
        if event == "line":
            self.count += 1
            if self.check is not None:
                exc = self.check()
                if exc is not None:
                    raise exc
            if self.count > self.limit:
                raise self.on_limit(frame.f_lineno)
        return self._local

    def _global(self, frame, event, arg):
        if frame.f_code.co_filename == CODE_FILENAME:
            return self._local
        return None

    def __enter__(self):
        self._old_rec = sys.getrecursionlimit()
        sys.setrecursionlimit(min(self._old_rec, 400))
        sys.settrace(self._global)
        return self

    def __exit__(self, *exc):
        sys.settrace(None)
        sys.setrecursionlimit(self._old_rec)
        return False


def error_line(exc):
    import traceback
    line = None
    for fs in traceback.extract_tb(exc.__traceback__):
        if fs.filename == CODE_FILENAME:
            line = fs.lineno
    if line is None and isinstance(exc, SyntaxError):
        line = exc.lineno
    return line
