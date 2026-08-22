"""
export_volume.py — export a compact 3D density volume the WebGPU viewer can ray-march.

The raw microscopy is stored as zstd/blosc-compressed zarr, which the Node bridge can't
decode. So this (Python, which already has the zarr reader) reads each sample's volume,
downsamples every timepoint to a small uint8 density grid, and writes:

  volumes/<sample>.vol    raw uint8 bytes: T * D * H * W, timepoints concatenated (t-major,
                          then z (depth), then y (height), then x (width))
  volumes/<sample>.json   header: { sample, dims:[D,H,W], t:T, orig:[Z,Y,X],
                                     voxel_scale:{z,y,x}, phys:[um_z,um_y,um_x] }

The browser fetches the header, then the bytes, uploads them into a WebGPU r8unorm 3D
texture, and ray-marches. Downsampling keeps the payload small (default max 64 voxels on
the largest axis); the physical extent (phys) lets the shader keep the real proportions
(z is ~4x coarser than x/y in the real data).

Usage:
  python export_volume.py --data_dir ../test_data --split train             # all samples
  python export_volume.py --data_dir ../test_data --split train --sample synth_0001 --max_dim 80
"""
import argparse
import json
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi

from io_utils import discover_samples, load_zarr_volume, VOXEL_SCALE


def _downsample_frame(frame, target):
    """Downsample a (Z,Y,X) frame to <= target on each axis via linear zoom."""
    Z, Y, X = frame.shape
    fz = min(1.0, target / Z); fy = min(1.0, target / Y); fx = min(1.0, target / X)
    if fz == 1.0 and fy == 1.0 and fx == 1.0:
        return frame.astype(np.float32)
    return ndi.zoom(frame.astype(np.float32), (fz, fy, fx), order=1)


def export_sample(sample_id, data_dir, split, out_dir, max_dim=64, gamma=0.7, clip_pct=99.5):
    volume, shape = load_zarr_volume(f"{data_dir}/{split}/{sample_id}.zarr")
    T, Z, Y, X = shape

    # normalize intensity across the whole volume (robust percentiles) so density is 0..1
    lo = float(np.percentile(volume, 50.0))
    hi = float(np.percentile(volume, 99.7))
    rng = max(1.0, hi - lo)

    frames = []
    dims = None
    for t in range(T):
        ds = _downsample_frame(volume[t], max_dim)
        if dims is None:
            dims = list(ds.shape)   # [D, H, W]
        # v2079 -- per-frame robust normalization: clip to a high percentile
        # so a few hot voxels don't compress every nucleus into the low bins
        # (faint cells were washing out). Then a tunable gamma lifts dim
        # nuclei. Both improve the ray-march's readability with no payload
        # cost -- still one uint8 per voxel.
        hi_f = np.percentile(ds, clip_pct) if ds.size else 1.0
        lo_f = np.percentile(ds, 100.0 - clip_pct) if ds.size else 0.0
        rng_f = max(1e-6, hi_f - lo_f)
        norm = np.clip((ds - lo_f) / rng_f, 0.0, 1.0)
        norm = norm ** gamma
        frames.append((norm * 255.0).astype(np.uint8))

    D, H, W = dims
    blob = np.stack(frames, axis=0).tobytes()   # T,D,H,W uint8

    out_dir = Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{sample_id}.vol").write_bytes(blob)
    header = {
        "sample": sample_id,
        "dims": [int(D), int(H), int(W)],
        "t": int(T),
        "orig": [int(Z), int(Y), int(X)],
        "voxel_scale": VOXEL_SCALE,
        # physical extent (um) of the full volume — lets the shader keep real proportions
        "phys": [float(Z * VOXEL_SCALE["z"]), float(Y * VOXEL_SCALE["y"]), float(X * VOXEL_SCALE["x"])],
        "intensity_lo": lo, "intensity_hi": hi,
    }
    (out_dir / f"{sample_id}.json").write_text(json.dumps(header))
    return {"sample": sample_id, "dims": [D, H, W], "t": T, "bytes": len(blob)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data_dir", default="../test_data")
    ap.add_argument("--split", default="train")
    ap.add_argument("--sample", default=None)
    ap.add_argument("--out", default="../volumes")
    ap.add_argument("--max_dim", type=int, default=64, help="downsample so the largest voxel axis <= this. Higher = crisper nuclei, larger payload (cubic).")
    ap.add_argument("--gamma", type=float, default=0.7, help="transfer gamma; <1 lifts dim nuclei (0.5 = very bright, 1.0 = linear)")
    ap.add_argument("--clip_pct", type=float, default=99.5, help="per-frame intensity clip percentile; lower (e.g. 98) tames hot spots so faint cells stay visible")
    args = ap.parse_args()

    samples = [args.sample] if args.sample else discover_samples(args.data_dir, args.split)
    for sid in samples:
        info = export_sample(sid, args.data_dir, args.split, args.out, args.max_dim, gamma=args.gamma, clip_pct=args.clip_pct)
        print(f"[{sid}] volume {info['dims']} x t={info['t']}  ->  {info['bytes']/1024:.0f} KB")
    print(f"\nWrote {len(samples)} volume(s) to {args.out}")


if __name__ == "__main__":
    main()
