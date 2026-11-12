"""Run kid code in a separate process with a hard timeout.

The engine already limits steps, but a separate process protects the server from
anything unexpected (memory hogs, very slow code). Set ROBOFIGHT_INPROCESS=1 to
run in-process (tests, tiny deployments).

For a public deployment, additionally run the server inside a container sandbox
(e.g. gVisor / a restricted Docker container without network).
"""

import multiprocessing
import os
import queue


def _call(fn_name, kwargs):
    import robofight
    from robofight import runner
    if fn_name == "mission":
        return runner.run_mission(kwargs["mission"], kwargs["code"])
    if fn_name == "match":
        return robofight.run_match(kwargs["bots"], kwargs.get("arena", "werkhalle"), kwargs.get("seed", 1),
                                   kwargs.get("max_ticks", 300))
    raise ValueError(fn_name)


def _worker(q, fn_name, kwargs, sys_path):
    import sys
    sys.path[:0] = [p for p in sys_path if p not in sys.path]
    try:
        q.put(("ok", _call(fn_name, kwargs)))
    except Exception as exc:  # noqa: BLE001
        q.put(("err", repr(exc)))


def run_isolated(fn_name, kwargs, timeout=20):
    if os.environ.get("ROBOFIGHT_INPROCESS"):
        return _call(fn_name, kwargs)
    import sys
    ctx = multiprocessing.get_context("spawn")
    q = ctx.Queue()
    p = ctx.Process(target=_worker, args=(q, fn_name, kwargs, list(sys.path)), daemon=True)
    p.start()
    try:
        status, value = q.get(timeout=timeout)
    except queue.Empty:
        p.kill()
        raise TimeoutError("Das Programm hat zu lange gebraucht.")
    finally:
        p.join(1)
        if p.is_alive():
            p.kill()
    if status != "ok":
        raise RuntimeError(value)
    return value
