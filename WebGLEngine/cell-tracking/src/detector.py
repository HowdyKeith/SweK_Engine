"""
detector.py — per-frame 3D cell (blob) detection.

Baseline approach: Difference-of-Gaussians / Laplacian-of-Gaussian blob detection
on each (Z, Y, X) frame independently, tuned for roughly-spherical fluorescent
nuclei/cells against a noisy background. This is intentionally simple and fast;
swap in a learned detector (e.g. a 3D U-Net / StarDist3D) later without touching
the tracker downstream — the contract is just "list of (z, y, x) centroids per frame".
"""
import numpy as np
from scipy import ndimage as ndi
from skimage.feature import peak_local_max
from skimage.filters import gaussian

# v2080 -- voxel physical scale (um/voxel). z is ~4x coarser than x/y, so a
# SCALAR gaussian sigma over-smooths z by 4x (see _axis_sigma). Kept local so
# detector.py does not need the zarr-heavy io_utils just for three numbers;
# the values match io_utils.VOXEL_SCALE exactly.
VOXEL_SCALE = {"z": 1.625, "y": 0.40625, "x": 0.40625}


def _axis_sigma(sigma, voxel_scale=None):
    """Turn a physical smoothing radius into a PER-AXIS voxel sigma so the blur
    is physically ISOTROPIC. Interpreting `sigma` as a physical extent in the
    finest (x/y) axis units, the voxel-space sigma on each axis is
    sigma * (finest_scale / axis_scale) -- so the coarse z axis gets a
    proportionally SMALLER voxel sigma (it already covers more physical space
    per voxel). Returns (sz, sy, sx)."""
    vs = voxel_scale or VOXEL_SCALE
    finest = min(vs["z"], vs["y"], vs["x"])
    return (sigma * finest / vs["z"], sigma * finest / vs["y"], sigma * finest / vs["x"])


def detect_blobs_frame(frame, sigma=2.5, min_distance=4, threshold_rel=0.12,
                        absolute_threshold=None, use_gpu=False, adaptive=False, subvoxel=False):
    """
    Detects cell centroids in a single (Z, Y, X) frame.

    Approach: smooth with a Gaussian (sigma tuned to expected cell radius),
    then find local maxima above a relative/absolute intensity threshold,
    enforcing a minimum separation between detections (min_distance, in voxels)
    so adjacent cells in dense clusters don't merge into one detection.

    Returns: array of shape (N, 3) of (z, y, x) integer centroid coordinates.
    """
    # v2078 -- GPU smoothing (accel step 2): the separable 3D Gaussian is the
    # detector's dominant cost and is a textbook GPU win. Try it when asked;
    # ANY failure (no deno, no GPU, software adapter, protocol error) falls
    # back to the exact scipy path, so the pipeline never depends on the GPU.
    smoothed = None
    if use_gpu:
        try:
            import gpu_smooth as _gs
            if _gs.available():
                # v2080 -- pass per-axis sigma so the GPU blur is isotropic too
                smoothed = _gs.gpu_smooth(frame, _axis_sigma(sigma)).astype(np.float64)
        except Exception as _e:
            smoothed = None   # silent fallback; the CPU path below is exact
    if smoothed is None:
        frame = frame.astype(np.float64)
        # v2080 -- ANISOTROPIC sigma: equal PHYSICAL smoothing on every axis.
        # A scalar sigma blurred z 4x too hard (2.44um vs 0.61um), shifting and
        # merging peaks along z. skimage.gaussian accepts a per-axis tuple.
        smoothed = gaussian(frame, sigma=_axis_sigma(sigma), preserve_range=True)

    if adaptive:
        # v2080 -- PER-FRAME ADAPTIVE threshold: photobleaching dims later
        # frames, so a single global threshold under-detects them. Compute a
        # threshold from THIS frame's own background + dynamic range, floored
        # by a fraction of the global estimate so a truly empty frame does not
        # start detecting noise. This tracks brightness drift over time.
        bg = np.median(smoothed)
        hi = np.percentile(smoothed, 99.0)
        thr = bg + threshold_rel * max(1e-6, hi - bg)
        if absolute_threshold is not None:
            thr = max(thr, 0.5 * absolute_threshold)   # floor: never far below the global
    elif absolute_threshold is not None:
        thr = absolute_threshold
    else:
        # relative to the smoothed frame's dynamic range — robust to varying
        # background levels between frames/samples
        thr = smoothed.min() + threshold_rel * (smoothed.max() - smoothed.min())

    coords = peak_local_max(
        smoothed,
        min_distance=min_distance,
        threshold_abs=thr,
        exclude_border=False,
    )
    if subvoxel and len(coords):
        # v2080 -- SUB-VOXEL centroids: peak_local_max snaps to integer voxels,
        # but a cell's true center is between voxels. Refine each peak to the
        # intensity-weighted centroid of its 3x3x3 neighborhood (background-
        # subtracted so only the blob's mass counts). This sharpens positions,
        # especially in z where voxels are ~4x coarser -- and the metric matches
        # on physical distance, so sharper positions => more correct matches.
        # Returns float coords; the tracker already treats coords as float.
        coords = _refine_subvoxel(smoothed, coords, thr)
    return coords  # (N, 3) array of (z, y, x); int unless subvoxel refined


def _refine_subvoxel(smoothed, coords, thr):
    """Intensity-weighted centroid in a 3x3x3 window around each integer peak.
    Background-subtracted at `thr` so only above-threshold mass pulls the
    centroid; falls back to the integer coord if the local mass vanishes."""
    Z, Y, X = smoothed.shape
    out = np.empty((len(coords), 3), dtype=np.float64)
    # local offset grid for a 3x3x3 window
    oz, oy, ox = np.mgrid[-1:2, -1:2, -1:2]
    for i, (cz, cy, cx) in enumerate(coords):
        z0, z1 = max(0, cz - 1), min(Z, cz + 2)
        y0, y1 = max(0, cy - 1), min(Y, cy + 2)
        x0, x1 = max(0, cx - 1), min(X, cx + 2)
        patch = smoothed[z0:z1, y0:y1, x0:x1]
        w = np.clip(patch - thr, 0.0, None)   # background-subtracted weights
        wsum = w.sum()
        if wsum <= 0:
            out[i] = (cz, cy, cx)   # no mass above threshold -> keep integer peak
            continue
        zz, yy, xx = np.mgrid[z0:z1, y0:y1, x0:x1]
        out[i] = (np.sum(zz * w) / wsum, np.sum(yy * w) / wsum, np.sum(xx * w) / wsum)
    return out


def _detect_one(args):
    """Worker: (t, frame, sigma, min_distance, threshold_rel, absolute_threshold, use_gpu) -> (t, coords)."""
    t, frame, sigma, min_distance, threshold_rel, absolute_threshold, use_gpu, adaptive, subvoxel = args
    coords = detect_blobs_frame(frame, sigma=sigma, min_distance=min_distance,
                                threshold_rel=threshold_rel, absolute_threshold=absolute_threshold,
                                use_gpu=use_gpu, adaptive=adaptive, subvoxel=subvoxel)
    return t, coords


def detect_blobs_volume(volume, sigma=2.5, min_distance=4, threshold_rel=0.12,
                         absolute_threshold=None, progress=False, workers=1, use_gpu=False, adaptive=False, subvoxel=False):
    """
    Runs detect_blobs_frame on every timepoint of a (T, Z, Y, X) volume.
    Returns dict[t] -> (N_t, 3) array of (z, y, x) centroids.

    workers: number of parallel processes for per-frame detection. Detection is the
    dominant cost and each frame is independent, so on a many-core machine (e.g. a
    powerful CPU box) this scales near-linearly. workers<=1 runs the plain sequential
    loop (lowest overhead for small volumes); workers>1 or workers=0 (=all cores)
    spreads frames across a process pool. Frames are dispatched as views to keep the
    pickling cost proportional to one frame, not the whole volume.
    """
    T = volume.shape[0]
    # decide worker count
    if workers is not None and workers <= 0:
        import os
        workers = os.cpu_count() or 1
    workers = max(1, int(workers or 1))
    # small volumes or single worker: sequential (avoids process-spawn overhead)
    if workers == 1 or T < 4:
        detections = {}
        for t in range(T):
            coords = detect_blobs_frame(volume[t], sigma=sigma, min_distance=min_distance,
                                        threshold_rel=threshold_rel, absolute_threshold=absolute_threshold,
                                        use_gpu=use_gpu, adaptive=adaptive, subvoxel=subvoxel)
            detections[t] = coords
            if progress:
                print(f"  t={t}: {len(coords)} detections")
        return detections

    # parallel across frames
    from concurrent.futures import ProcessPoolExecutor
    # NOTE: with use_gpu, keep workers=1 -- one GPU stream is faster than many
    # processes contending for it, and each process would spawn its own deno.
    args = [(t, np.ascontiguousarray(volume[t]), sigma, min_distance, threshold_rel, absolute_threshold, use_gpu, adaptive, subvoxel)
            for t in range(T)]
    detections = {}
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for t, coords in ex.map(_detect_one, args):
            detections[t] = coords
            if progress:
                print(f"  t={t}: {len(coords)} detections")
    return detections


def estimate_threshold(volume, percentile=99.0):
    """
    Heuristic: sample a handful of frames and pick an absolute intensity
    threshold based on a high percentile, to make detection robust to
    varying background brightness across samples/datasets.
    """
    T = volume.shape[0]
    sample_idx = np.linspace(0, T - 1, min(5, T), dtype=int)
    vals = np.concatenate([volume[t].ravel() for t in sample_idx])
    bg = np.median(vals)
    hi = np.percentile(vals, percentile)
    # threshold_abs sits between background and the bright percentile
    return bg + 0.3 * (hi - bg)
