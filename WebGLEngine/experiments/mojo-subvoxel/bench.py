#!/usr/bin/env python3
"""
bench.py -- head-to-head: Mojo vs NumPy/scipy for the sub-voxel centroid loop.

Runs the CURRENT NumPy version (copied from detector._refine_subvoxel) and, if
Mojo is available, the Mojo port, on identical synthetic data. It:
  1. VERIFIES the two produce identical centroids (to 1e-9) -- correctness first.
  2. Times both across detection counts and reports the speedup.
  3. Falls back to NumPy-only (still useful as a baseline) if Mojo is absent,
     printing exactly why so we can pin the fix.

Run on a box with Mojo installed:   mojo run bench.py   (or: python3 bench.py)
The engine's Mojo panel shells out to this and captures the output.
"""
import sys
import time
import numpy as np


# ---- the CURRENT production version (verbatim from detector._refine_subvoxel) ----
def refine_subvoxel_numpy(smoothed, coords, thr):
    Z, Y, X = smoothed.shape
    out = np.empty((len(coords), 3), dtype=np.float64)
    for i, (cz, cy, cx) in enumerate(coords):
        z0, z1 = max(0, cz - 1), min(Z, cz + 2)
        y0, y1 = max(0, cy - 1), min(Y, cy + 2)
        x0, x1 = max(0, cx - 1), min(X, cx + 2)
        patch = smoothed[z0:z1, y0:y1, x0:x1]
        w = np.clip(patch - thr, 0.0, None)
        wsum = w.sum()
        if wsum <= 0:
            out[i] = (cz, cy, cx)
            continue
        zz, yy, xx = np.mgrid[z0:z1, y0:y1, x0:x1]
        out[i] = (np.sum(zz * w) / wsum, np.sum(yy * w) / wsum, np.sum(xx * w) / wsum)
    return out


def make_data(n_det, vol=(24, 128, 128), seed=0):
    """Realistic-ish: a smoothed volume + n_det integer peaks inside it."""
    rng = np.random.RandomState(seed)
    Z, Y, X = vol
    smoothed = rng.rand(Z, Y, X).astype(np.float64)
    # bias some structure so weights aren't uniform noise
    zz, yy, xx = np.mgrid[0:Z, 0:Y, 0:X]
    for _ in range(min(n_det, 200)):
        cz, cy, cx = rng.randint(2, Z - 2), rng.randint(2, Y - 2), rng.randint(2, X - 2)
        smoothed += 0.5 * np.exp(-(((zz - cz) ** 2 + (yy - cy) ** 2 + (xx - cx) ** 2) / (2 * 2.5 ** 2)))
    coords = np.column_stack([
        rng.randint(1, Z - 1, n_det),
        rng.randint(1, Y - 1, n_det),
        rng.randint(1, X - 1, n_det),
    ]).astype(np.int64)
    thr = float(np.percentile(smoothed, 50))
    return smoothed, coords, thr


def try_import_mojo():
    """Return the Mojo refine_subvoxel callable, or (None, reason)."""
    try:
        # When run under `mojo run bench.py`, the compiled module is importable.
        # When run under CPython, we import the built package if present.
        import max.mojo  # noqa -- presence check for a Mojo runtime
    except Exception as e:
        return None, "Mojo runtime not importable: %s" % e
    try:
        import subvoxel  # the compiled .mojo module (same dir)
        return subvoxel.refine_subvoxel, None
    except Exception as e:
        return None, "subvoxel.mojo not built/importable: %s (build with: mojo build subvoxel.mojo)" % e


def bench(fn, smoothed, coords, thr, iters):
    fn(smoothed, coords, thr)  # warm
    t0 = time.perf_counter()
    for _ in range(iters):
        r = fn(smoothed, coords, thr)
    return (time.perf_counter() - t0) / iters, r


def main():
    print("=== sub-voxel centroid: Mojo vs NumPy ===")
    mojo_fn, mojo_err = try_import_mojo()
    if mojo_fn is None:
        print("Mojo path: UNAVAILABLE -- %s" % mojo_err)
        print("Showing the NumPy baseline only. Install Mojo and rebuild to compare.\n")
    else:
        print("Mojo path: available\n")

    # correctness gate first (small case, exact compare)
    if mojo_fn is not None:
        sm, co, thr = make_data(64, seed=1)
        a = refine_subvoxel_numpy(sm, co, thr)
        b = np.asarray(mojo_fn(sm, co, thr))
        max_diff = float(np.max(np.abs(a - b))) if a.shape == b.shape else float("inf")
        ok = max_diff < 1e-9
        print("correctness: max|mojo - numpy| = %.2e  ->  %s" % (max_diff, "IDENTICAL" if ok else "MISMATCH (do not trust speed numbers)"))
        if not ok:
            print("  shapes:", a.shape, b.shape)
            print("  ABORTING speed comparison -- fix the kernel first.")
            return
        print()

    print("%-10s %14s %14s %10s" % ("n_det", "numpy (ms)", "mojo (ms)", "speedup"))
    for n_det in (100, 500, 2000, 8000):
        sm, co, thr = make_data(n_det, seed=2)
        iters = max(3, 30000 // n_det)
        np_ms, _ = bench(refine_subvoxel_numpy, sm, co, thr, iters)
        if mojo_fn is not None:
            mj_ms, _ = bench(lambda s, c, t: np.asarray(mojo_fn(s, c, t)), sm, co, thr, iters)
            print("%-10d %14.3f %14.3f %9.1fx" % (n_det, np_ms * 1000, mj_ms * 1000, np_ms / mj_ms if mj_ms > 0 else 0))
        else:
            print("%-10d %14.3f %14s %10s" % (n_det, np_ms * 1000, "-", "-"))

    print()
    print("Report these numbers back and we'll decide whether Mojo earns a place in the pipeline.")


if __name__ == "__main__":
    main()
