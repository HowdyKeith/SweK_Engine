"""
gpu_smooth.py -- Python side of the GPU-accelerated Gaussian smoothing for
the cell-tracking detector (accel step 2).

It spawns the Deno WebGPU smoother (gpu_smooth.mjs) once, keeps it warm, and
streams frames to it over a length-prefixed binary protocol. The GPU does
the separable 3D Gaussian (the detector's dominant cost); the caller keeps
scipy's peak_local_max on the result, so detections match the CPU path.

CONTRACT: gpu_smooth(frame, sigma) -> smoothed float32 ndarray, OR raises if
the GPU path is unavailable. detector.py catches that and falls back to
scipy, so the pipeline ALWAYS works -- GPU is a speedup, never a dependency.
"""
import os
import struct
import subprocess
import threading
import numpy as np

_MAGIC_IN = b"SMTH"
_MAGIC_OUT = b"SMTD"
_MAGIC_ERR = b"SERR"

_proc = None
_lock = threading.Lock()
_disabled = False   # set True after a hard failure so we stop retrying


def _find_deno():
    # explicit override wins; else PATH; else the common install location the
    # engine's installers use (~/.deno/bin).
    cand = os.environ.get("SWEK_DENO")
    if cand and os.path.exists(cand):
        return cand
    from shutil import which
    w = which("deno")
    if w:
        return w
    home = os.path.expanduser("~")
    for p in (os.path.join(home, ".deno", "bin", "deno"),
              os.path.join(home, ".deno", "bin", "deno.exe")):
        if os.path.exists(p):
            return p
    return None


def _script_path():
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "gpu_smooth.mjs")


def _start():
    global _proc, _disabled
    if _disabled:
        raise RuntimeError("gpu smoother disabled after prior failure")
    if _proc is not None and _proc.poll() is None:
        return _proc
    deno = _find_deno()
    if not deno:
        _disabled = True
        raise RuntimeError("deno not found (GPU smoothing unavailable; using CPU)")
    env = dict(os.environ)
    env.setdefault("WGPU_BACKEND", "vulkan")   # matches the brain's Windows pin
    _proc = subprocess.Popen(
        [deno, "run", "--unstable-webgpu", "--allow-env", _script_path()],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        bufsize=0,
    )
    return _proc


def _read_exact(stream, n):
    buf = bytearray()
    while len(buf) < n:
        chunk = stream.read(n - len(buf))
        if not chunk:
            raise RuntimeError("gpu smoother closed the pipe")
        buf.extend(chunk)
    return bytes(buf)


def gpu_smooth(frame, sigma):
    """Smooth a single (Z,Y,X) frame on the GPU. `sigma` is a scalar OR a
    per-axis (sz, sy, sx) tuple (v2080 anisotropy). Raises on any failure so the
    caller can fall back to scipy. Thread-safe (serialized -- one GPU stream)."""
    if np.isscalar(sigma):
        sz = sy = sx = float(sigma)
    else:
        sz, sy, sx = (float(sigma[0]), float(sigma[1]), float(sigma[2]))
    global _proc, _disabled
    if _disabled:
        raise RuntimeError("gpu smoother disabled")
    f = np.ascontiguousarray(frame, dtype=np.float32)
    Z, Y, X = f.shape
    with _lock:
        p = _start()
        # header: magic | Z | Y | X | sigma_z | sigma_y | sigma_x  (3x f32)
        hdr = _MAGIC_IN + struct.pack("<IIIfff", Z, Y, X, sz, sy, sx)
        try:
            p.stdin.write(hdr)
            p.stdin.write(f.tobytes(order="C"))
            p.stdin.flush()
            magic = _read_exact(p.stdout, 4)
            if magic == _MAGIC_ERR:
                (mlen,) = struct.unpack("<I", _read_exact(p.stdout, 4))
                msg = _read_exact(p.stdout, mlen).decode("utf-8", "replace")
                # a hardware/adapter error is permanent for this box -> disable
                _disabled = True
                raise RuntimeError("gpu smoother error: " + msg)
            if magic != _MAGIC_OUT:
                _disabled = True
                raise RuntimeError("gpu smoother bad response magic: %r" % magic)
            data = _read_exact(p.stdout, Z * Y * X * 4)
            out = np.frombuffer(data, dtype=np.float32).reshape(Z, Y, X).copy()
            return out
        except Exception:
            # kill the process so a fresh one starts next time (unless disabled)
            try:
                if _proc:
                    _proc.kill()
            except Exception:
                pass
            _proc = None
            raise


def available():
    """True if the GPU smoother can plausibly run (deno present, not disabled).
    Does not prove the GPU works -- the first real call does that."""
    if _disabled:
        return False
    return _find_deno() is not None and os.path.exists(_script_path())


def shutdown():
    global _proc
    with _lock:
        try:
            if _proc:
                _proc.kill()
        except Exception:
            pass
        _proc = None
