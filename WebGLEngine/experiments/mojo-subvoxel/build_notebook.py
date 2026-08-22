#!/usr/bin/env python3
"""Builds mojo_subvoxel_colab.ipynb -- a self-contained Colab notebook that
installs Mojo, runs the CPU sub-voxel Mojo-vs-NumPy comparison, and demos a
GPU kernel on Colab's NVIDIA hardware. Generated (not hand-written JSON) so the
structure is always valid."""
import json

def md(*lines):
    return {"cell_type": "markdown", "metadata": {}, "source": list(_split(lines))}

def code(*lines):
    return {"cell_type": "code", "metadata": {}, "execution_count": None,
            "outputs": [], "source": list(_split(lines))}

def _split(lines):
    # join then re-split so each source line keeps its trailing newline except last
    text = "\n".join(lines)
    parts = text.split("\n")
    return [p + "\n" for p in parts[:-1]] + [parts[-1]]

cells = []

cells.append(md(
    "# Mojo vs NumPy -- cell-tracking sub-voxel loop (SweK experiment)",
    "",
    "Self-contained benchmark for the SweK Engine. It answers one question with real numbers:",
    "**does Mojo meaningfully beat the current NumPy version of the sub-voxel centroid loop,**",
    "**and is the result identical?**",
    "",
    "Runs top-to-bottom on Google Colab. Two parts:",
    "1. **CPU** -- the exact loop from `detector._refine_subvoxel`, NumPy vs a Mojo port, verified identical then timed.",
    "2. **GPU** -- a small Mojo GPU-kernel demo, to see Mojo's headline feature on Colab's NVIDIA hardware.",
    "",
    "**Before running the GPU part:** Runtime -> Change runtime type -> select a **GPU** (T4/L4/A100 all work).",
    "",
    "> Mojo is beta (1.0.0b2), compiler closed-source until fall 2026. If a stdlib symbol has moved,",
    "> the error prints verbatim -- report it back and we pin the exact spelling.",
))

cells.append(md("---", "## 1. Install Mojo (the `%%mojo` cell magic)"))

cells.append(code(
    "# Modular's official Colab install. Adds the %%mojo cell magic so we can",
    "# compile + run Mojo in a cell. Takes a minute or two (downloads a few hundred MB).",
    "!curl -fsSL https://pixi.sh/install.sh | bash > /dev/null 2>&1",
    "import os",
    "os.environ['PATH'] = os.path.expanduser('~/.pixi/bin') + ':' + os.environ['PATH']",
    "",
    "# install mojo (beta) into a pixi global env; --prerelease/beta channel required",
    "!pixi global install -c https://conda.modular.com/max -c conda-forge mojo 2>&1 | tail -5",
    "",
    "# make the mojo binary visible to this kernel",
    "import glob, os",
    "cand = glob.glob(os.path.expanduser('~/.pixi/**/bin/mojo'), recursive=True)",
    "if cand:",
    "    os.environ['PATH'] = os.path.dirname(cand[0]) + ':' + os.environ['PATH']",
    "    print('mojo found at:', cand[0])",
    "!mojo --version || echo 'mojo not on PATH yet -- see install output above'",
))

cells.append(md(
    "If the cell above fails, the fallback is the official notebook magic installer.",
    "Run this **only if `mojo --version` above did not print a version:**",
))

cells.append(code(
    "# Fallback per Modular's Colab docs: the notebook cell-magic installer.",
    "# (Skip if mojo --version already worked.)",
    "try:",
    "    import subprocess",
    "    v = subprocess.run(['mojo','--version'], capture_output=True, text=True)",
    "    if v.returncode == 0:",
    "        print('Mojo already installed:', v.stdout.strip()); raise SystemExit",
    "except FileNotFoundError:",
    "    pass",
    "!pip install modular --extra-index-url https://modular.gateway.scarf.sh/simple/ --pre 2>&1 | tail -5",
    "# load the %%mojo magic if the package provides it",
    "try:",
    "    import max.mojo.notebook  # noqa",
    "    print('loaded %%mojo magic')",
    "except Exception as e:",
    "    print('magic not available via package:', e)",
))

cells.append(md("---", "## 2. CPU benchmark -- the sub-voxel loop"))

cells.append(md(
    "### 2a. The current production version (NumPy), verbatim from the engine",
))

cells.append(code(
    "import numpy as np, time",
    "",
    "def refine_subvoxel_numpy(smoothed, coords, thr):",
    "    \"\"\"Verbatim from detector._refine_subvoxel.\"\"\"",
    "    Z, Y, X = smoothed.shape",
    "    out = np.empty((len(coords), 3), dtype=np.float64)",
    "    for i, (cz, cy, cx) in enumerate(coords):",
    "        z0, z1 = max(0, cz - 1), min(Z, cz + 2)",
    "        y0, y1 = max(0, cy - 1), min(Y, cy + 2)",
    "        x0, x1 = max(0, cx - 1), min(X, cx + 2)",
    "        patch = smoothed[z0:z1, y0:y1, x0:x1]",
    "        w = np.clip(patch - thr, 0.0, None)",
    "        wsum = w.sum()",
    "        if wsum <= 0:",
    "            out[i] = (cz, cy, cx); continue",
    "        zz, yy, xx = np.mgrid[z0:z1, y0:y1, x0:x1]",
    "        out[i] = (np.sum(zz*w)/wsum, np.sum(yy*w)/wsum, np.sum(xx*w)/wsum)",
    "    return out",
    "",
    "def make_data(n_det, vol=(24,128,128), seed=0):",
    "    rng = np.random.RandomState(seed); Z,Y,X = vol",
    "    smoothed = rng.rand(Z,Y,X).astype(np.float64)",
    "    zz,yy,xx = np.mgrid[0:Z,0:Y,0:X]",
    "    for _ in range(min(n_det,200)):",
    "        cz,cy,cx = rng.randint(2,Z-2), rng.randint(2,Y-2), rng.randint(2,X-2)",
    "        smoothed += 0.5*np.exp(-(((zz-cz)**2+(yy-cy)**2+(xx-cx)**2)/(2*2.5**2)))",
    "    coords = np.column_stack([rng.randint(1,Z-1,n_det), rng.randint(1,Y-1,n_det), rng.randint(1,X-1,n_det)]).astype(np.int64)",
    "    thr = float(np.percentile(smoothed,50))",
    "    return smoothed, coords, thr",
    "",
    "print('NumPy baseline:')",
    "for n in (100,500,2000,8000):",
    "    sm,co,thr = make_data(n,seed=2); it = max(3, 30000//n)",
    "    refine_subvoxel_numpy(sm,co,thr)",
    "    t0=time.perf_counter()",
    "    for _ in range(it): refine_subvoxel_numpy(sm,co,thr)",
    "    print(f'  n={n:5d}: {(time.perf_counter()-t0)/it*1000:8.3f} ms')",
))

cells.append(md(
    "### 2b. The Mojo port",
    "",
    "Writes the kernel to `subvoxel.mojo`, compiles it, and calls it. The kernel is scalar",
    "loops over each 3x3x3 window -- no per-patch NumPy allocation, which is the point.",
))

cells.append(code(
    "%%writefile subvoxel.mojo",
    "from python import Python, PythonObject",
    "from memory import UnsafePointer",
    "",
    "fn refine_kernel(vol: UnsafePointer[Float64], Z: Int, Y: Int, X: Int,",
    "                 coords: UnsafePointer[Int], n: Int, thr: Float64,",
    "                 out: UnsafePointer[Float64]):",
    "    for i in range(n):",
    "        var cz = coords[i*3+0]; var cy = coords[i*3+1]; var cx = coords[i*3+2]",
    "        var z0 = cz-1; z0 = 0 if z0 < 0 else z0",
    "        var z1 = cz+2; z1 = Z if z1 > Z else z1",
    "        var y0 = cy-1; y0 = 0 if y0 < 0 else y0",
    "        var y1 = cy+2; y1 = Y if y1 > Y else y1",
    "        var x0 = cx-1; x0 = 0 if x0 < 0 else x0",
    "        var x1 = cx+2; x1 = X if x1 > X else x1",
    "        var wsum: Float64 = 0.0; var sz: Float64 = 0.0",
    "        var sy: Float64 = 0.0; var sx: Float64 = 0.0",
    "        for zz in range(z0, z1):",
    "            for yy in range(y0, y1):",
    "                var base = (zz*Y + yy)*X",
    "                for xx in range(x0, x1):",
    "                    var v = vol[base+xx] - thr",
    "                    if v > 0.0:",
    "                        wsum += v; sz += Float64(zz)*v; sy += Float64(yy)*v; sx += Float64(xx)*v",
    "        if wsum <= 0.0:",
    "            out[i*3+0] = Float64(cz); out[i*3+1] = Float64(cy); out[i*3+2] = Float64(cx)",
    "        else:",
    "            out[i*3+0] = sz/wsum; out[i*3+1] = sy/wsum; out[i*3+2] = sx/wsum",
    "",
    "@export",
    "fn refine_subvoxel(vol_obj: PythonObject, coords_obj: PythonObject, thr: Float64) raises -> PythonObject:",
    "    var np = Python.import_module('numpy')",
    "    var Z = Int(vol_obj.shape[0]); var Y = Int(vol_obj.shape[1]); var X = Int(vol_obj.shape[2])",
    "    var n = Int(coords_obj.shape[0])",
    "    var vol_ptr = vol_obj.ctypes.data.unsafe_get_as_pointer[DType.float64]()",
    "    var coords_ptr = coords_obj.ctypes.data.unsafe_get_as_pointer[DType.int64]()",
    "    var out_np = np.empty((n,3), dtype=np.float64)",
    "    var out_ptr = out_np.ctypes.data.unsafe_get_as_pointer[DType.float64]()",
    "    var ci = UnsafePointer[Int].alloc(n*3)",
    "    for k in range(n*3): ci[k] = Int(coords_ptr[k])",
    "    refine_kernel(vol_ptr, Z, Y, X, ci, n, thr, out_ptr)",
    "    ci.free()",
    "    return out_np",
))

cells.append(code(
    "# Build the Mojo module into a Python-importable package, then compare.",
    "# `mojo build` emits a shared object we import from Python.",
    "import subprocess, sys, importlib, numpy as np, time",
    "",
    "build = subprocess.run(['mojo','build','subvoxel.mojo','--emit','shared-lib','-o','subvoxel.so'],",
    "                       capture_output=True, text=True)",
    "print(build.stdout); print(build.stderr)",
    "",
    "mojo_fn = None",
    "if build.returncode == 0:",
    "    try:",
    "        sys.path.insert(0, '.')",
    "        import subvoxel as _sv",
    "        mojo_fn = _sv.refine_subvoxel",
    "        print('Mojo module imported OK')",
    "    except Exception as e:",
    "        print('import failed:', e)",
    "else:",
    "    print('BUILD FAILED -- copy the error above and report it back so we can pin the API.')",
))

cells.append(code(
    "# Correctness gate FIRST, then the speed comparison.",
    "if mojo_fn is None:",
    "    print('Mojo unavailable -- NumPy baseline (section 2a) stands on its own. Report the build error above.')",
    "else:",
    "    sm,co,thr = make_data(64, seed=1)",
    "    a = refine_subvoxel_numpy(sm,co,thr)",
    "    b = np.asarray(mojo_fn(sm,co,thr))",
    "    max_diff = float(np.max(np.abs(a-b))) if a.shape==b.shape else float('inf')",
    "    print(f'correctness: max|mojo-numpy| = {max_diff:.2e}  ->  {\"IDENTICAL\" if max_diff<1e-9 else \"MISMATCH\"}')",
    "    if max_diff < 1e-9:",
    "        print()",
    "        print(f'{\"n_det\":<8}{\"numpy (ms)\":>14}{\"mojo (ms)\":>14}{\"speedup\":>10}')",
    "        for n in (100,500,2000,8000):",
    "            sm,co,thr = make_data(n,seed=2); it = max(3, 30000//n)",
    "            mojo_fn(sm,co,thr); refine_subvoxel_numpy(sm,co,thr)",
    "            t0=time.perf_counter()",
    "            for _ in range(it): refine_subvoxel_numpy(sm,co,thr)",
    "            npm=(time.perf_counter()-t0)/it",
    "            t0=time.perf_counter()",
    "            for _ in range(it): np.asarray(mojo_fn(sm,co,thr))",
    "            mjm=(time.perf_counter()-t0)/it",
    "            print(f'{n:<8}{npm*1000:>14.3f}{mjm*1000:>14.3f}{npm/mjm:>9.1f}x')",
    "    else:",
    "        print('Kernel mismatch -- do NOT trust speed. Report the diff so we fix the port.')",
))

cells.append(md("---", "## 3. GPU kernel demo (Mojo's headline feature)",
    "",
    "This is where Mojo is actually differentiated: a GPU kernel in the same language,",
    "no CUDA. **Needs a GPU runtime** (Runtime -> Change runtime type -> GPU).",
))

cells.append(code(
    "%%writefile gpu_demo.mojo",
    "from gpu.host import DeviceContext",
    "from gpu import thread_idx, block_idx, block_dim",
    "from sys import has_accelerator",
    "",
    "# square each element on the GPU -- the 'hello world' of GPU kernels.",
    "fn square_kernel(data: UnsafePointer[Float32], n: Int):",
    "    var i = block_idx.x * block_dim.x + thread_idx.x",
    "    if i < n:",
    "        data[i] = data[i] * data[i]",
    "",
    "def main():",
    "    @parameter",
    "    if not has_accelerator():",
    "        print('No GPU detected -- switch Colab to a GPU runtime and re-run.')",
    "        return",
    "    var ctx = DeviceContext()",
    "    alias N = 1024",
    "    var buf = ctx.enqueue_create_buffer[DType.float32](N)",
    "    with buf.map_to_host() as host:",
    "        for i in range(N): host[i] = Float32(i)",
    "    ctx.enqueue_function[square_kernel](buf.unsafe_ptr(), N, grid_dim=(N+255)//256, block_dim=256)",
    "    ctx.synchronize()",
    "    with buf.map_to_host() as host:",
    "        print('GPU squared: [0]=', host[0], ' [2]=', host[2], ' [10]=', host[10], ' (expect 0, 4, 100)')",
    "    print('GPU kernel ran successfully.')",
))

cells.append(code(
    "# Run the GPU demo. If the API surface has drifted (beta), the error prints here --",
    "# report it and we pin the exact current spelling from your run.",
    "import subprocess",
    "r = subprocess.run(['mojo','gpu_demo.mojo'], capture_output=True, text=True)",
    "print(r.stdout)",
    "print(r.stderr)",
))

cells.append(md(
    "---",
    "## What to report back",
    "",
    "Copy back:",
    "1. The **CPU comparison table** (section 2c) -- especially whether it says *IDENTICAL* and the speedups.",
    "2. The **GPU demo output** (section 3).",
    "3. Any **build/compile errors** verbatim -- Mojo is beta, so a moved stdlib symbol is expected and easy to pin.",
    "",
    "From those numbers we decide whether Mojo earns a place in the cell-tracking pipeline,",
    "and wire it in with the same fallback discipline as the GPU smoother (Mojo path when built, NumPy otherwise).",
))

nb = {
    "cells": cells,
    "metadata": {
        "colab": {"provenance": [], "toc_visible": True},
        "kernelspec": {"display_name": "Python 3", "name": "python3"},
        "language_info": {"name": "python"},
    },
    "nbformat": 4,
    "nbformat_minor": 0,
}

with open("mojo_subvoxel_colab.ipynb", "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=1)
print("wrote mojo_subvoxel_colab.ipynb with", len(cells), "cells")
