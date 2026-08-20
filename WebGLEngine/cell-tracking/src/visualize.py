"""
visualize.py — render the detect -> track -> score pipeline visually, so you can SEE
where it works and where it breaks instead of reading only the aggregate score.

Produces (PNG, headless via Agg):
  1. <sample>_detections_tXX.png  — max-intensity Z-projection of a frame with GT
     centroids (green o) and predicted detections (magenta x) overlaid. Shows
     detection recall/precision at a glance (unmatched green = missed cells;
     unmatched magenta = false detections).
  2. <sample>_tracks_xy.png       — all predicted tracks as XY polylines over time
     (color = track id), with division forks marked. The lineage/trajectory view.
  3. <sample>_tracks_zt.png       — Z-vs-time for each track: shows depth motion and
     where tracks start/end/break across frames.

Usage:
  python visualize.py --data_dir ../test_data --split train --sample synth_0001 --frame 10
  python visualize.py --data_dir ../test_data --split train          # all samples, mid frame
Outputs to ../viz/ by default.
"""
import argparse
from pathlib import Path
from collections import defaultdict

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from io_utils import discover_samples, load_zarr_volume, load_geff_graph, VOXEL_SCALE
from detector import detect_blobs_volume, estimate_threshold
from tracker import link_frames
from scipy.spatial.distance import cdist
from scipy.optimize import linear_sum_assignment

_SCALE = np.array([VOXEL_SCALE["z"], VOXEL_SCALE["y"], VOXEL_SCALE["x"]])


def _match(pred_xyz, gt_xyz, max_um=7.0):
    """Return (matched_pred_idx set, matched_gt_idx set) under scaled distance <= max_um."""
    if len(pred_xyz) == 0 or len(gt_xyz) == 0:
        return set(), set()
    D = cdist(np.asarray(pred_xyz, float) * _SCALE, np.asarray(gt_xyz, float) * _SCALE)
    C = D.copy(); C[C > max_um] = 1e6
    ri, ci = linear_sum_assignment(C)
    mp, mg = set(), set()
    for r, c in zip(ri, ci):
        if C[r, c] < 1e6:
            mp.add(r); mg.add(c)
    return mp, mg


def render_detections(sample_id, volume, gt_nodes, det, frame, out_dir):
    Z, Y, X = volume.shape[1:]
    mip = volume[frame].max(axis=0)   # Z-projection -> (Y, X)
    g = gt_nodes[gt_nodes.t == frame][["z", "y", "x"]].values.astype(float)
    p = np.asarray(det.get(frame, np.zeros((0, 3))), float)
    mp, mg = _match(p[:, :3] if len(p) else p, g[:, :3] if len(g) else g)

    fig, ax = plt.subplots(figsize=(7, 7))
    ax.imshow(mip, cmap="gray", origin="upper",
              vmax=np.percentile(mip, 99.5) if mip.size else 1)
    # GT: matched green, missed (FN) red
    for i, (z, y, x) in enumerate(g):
        col = "#3adb6a" if i in mg else "#ff4d4d"
        ax.scatter(x, y, s=90, facecolors="none", edgecolors=col, linewidths=1.6,
                   marker="o", label=None)
    # predictions: matched magenta, false (FP) yellow
    for i, row in enumerate(p):
        z, y, x = row[:3]
        col = "#e05cff" if i in mp else "#ffd23f"
        ax.scatter(x, y, s=55, c=col, marker="x", linewidths=1.6)
    tp = len(mg); fn = len(g) - len(mg); fp = len(p) - len(mp)
    ax.set_title(f"{sample_id}  t={frame}  |  detections: TP={tp} FN(missed)={fn} FP(false)={fp}\n"
                 f"green o = GT (red = missed) · magenta x = pred (yellow = false)", fontsize=9)
    ax.set_xlabel("x (voxels)"); ax.set_ylabel("y (voxels)")
    ax.set_xlim(0, X); ax.set_ylim(Y, 0)
    fig.tight_layout()
    fp_out = out_dir / f"{sample_id}_detections_t{frame:02d}.png"
    fig.savefig(fp_out, dpi=110); plt.close(fig)
    return fp_out


def _tracks_from_edges(nodes_df, edges_df):
    """Group predicted nodes into tracks by walking edges; return list of node-id chains + fork nodes."""
    pos = {int(r.node_id): (int(r.t), float(r.z), float(r.y), float(r.x)) for r in nodes_df.itertuples()}
    out_adj = defaultdict(list)
    indeg = defaultdict(int)
    for e in edges_df.itertuples():
        out_adj[int(e.source_id)].append(int(e.target_id))
        indeg[int(e.target_id)] += 1
    fork_nodes = {n for n, outs in out_adj.items() if len(outs) >= 2}
    # chains start at nodes with no incoming edge
    starts = [n for n in pos if indeg[n] == 0]
    chains = []
    for s in starts:
        chain = [s]; cur = s
        while out_adj[cur]:
            cur = out_adj[cur][0]     # follow the primary successor
            chain.append(cur)
            if len(chain) > 10000:
                break
        chains.append(chain)
    return pos, chains, fork_nodes


def render_tracks(sample_id, nodes_df, edges_df, shape, out_dir):
    Z, Y, X = shape[1:]
    pos, chains, forks = _tracks_from_edges(nodes_df, edges_df)
    cmap = plt.get_cmap("turbo")

    # XY trajectory view
    fig, ax = plt.subplots(figsize=(7, 7))
    for i, chain in enumerate(chains):
        pts = np.array([[pos[n][3], pos[n][2]] for n in chain])  # (x, y)
        if len(pts) == 0:
            continue
        col = cmap((i % 20) / 20.0)
        ax.plot(pts[:, 0], pts[:, 1], "-", color=col, lw=1.3, alpha=0.9)
        ax.scatter(pts[0, 0], pts[0, 1], s=18, color=col, marker="o")   # start
        ax.scatter(pts[-1, 0], pts[-1, 1], s=28, color=col, marker="s") # end
    for n in forks:
        t, z, y, x = pos[n]
        ax.scatter(x, y, s=120, facecolors="none", edgecolors="#ffffff", linewidths=1.8, marker="D")
        ax.scatter(x, y, s=40, color="#ff2d55", marker="*")
    ax.set_title(f"{sample_id}  predicted tracks (XY)  |  {len(chains)} tracks, {len(forks)} divisions\n"
                 f"o=start  square=end  white-diamond+star=division fork", fontsize=9)
    ax.set_xlabel("x (voxels)"); ax.set_ylabel("y (voxels)")
    ax.set_xlim(0, X); ax.set_ylim(Y, 0); ax.set_aspect("equal")
    fig.tight_layout()
    xy_out = out_dir / f"{sample_id}_tracks_xy.png"
    fig.savefig(xy_out, dpi=110); plt.close(fig)

    # Z-vs-time view (depth motion + track lifespans)
    fig, ax = plt.subplots(figsize=(8, 5))
    for i, chain in enumerate(chains):
        tz = np.array([[pos[n][0], pos[n][1]] for n in chain])  # (t, z)
        if len(tz) == 0:
            continue
        col = cmap((i % 20) / 20.0)
        ax.plot(tz[:, 0], tz[:, 1], "-o", color=col, lw=1.1, ms=3, alpha=0.9)
    for n in forks:
        t, z, y, x = pos[n]
        ax.scatter(t, z, s=90, color="#ff2d55", marker="*", zorder=5)
    ax.set_title(f"{sample_id}  predicted tracks: Z vs time  (star = division)", fontsize=9)
    ax.set_xlabel("t (frame)"); ax.set_ylabel("z (voxels)")
    ax.set_ylim(Z, 0)
    fig.tight_layout()
    zt_out = out_dir / f"{sample_id}_tracks_zt.png"
    fig.savefig(zt_out, dpi=110); plt.close(fig)
    return xy_out, zt_out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data_dir", default="../test_data")
    ap.add_argument("--split", default="train")
    ap.add_argument("--sample", default=None, help="one sample id; default = all")
    ap.add_argument("--frame", type=int, default=None, help="frame for the detection view; default = middle")
    ap.add_argument("--out", default="../viz")
    ap.add_argument("--sigma", type=float, default=1.5)
    ap.add_argument("--min_distance", type=int, default=4)
    args = ap.parse_args()

    out_dir = Path(args.out); out_dir.mkdir(parents=True, exist_ok=True)
    sample_ids = [args.sample] if args.sample else discover_samples(args.data_dir, args.split)
    written = []
    for sid in sample_ids:
        volume, shape = load_zarr_volume(f"{args.data_dir}/{args.split}/{sid}.zarr")
        gt_nodes, gt_edges, meta = load_geff_graph(f"{args.data_dir}/{args.split}/{sid}.geff")
        thr = estimate_threshold(volume)
        det = detect_blobs_volume(volume, sigma=args.sigma, min_distance=args.min_distance, absolute_threshold=thr)
        nodes_df, edges_df = link_frames(det)
        frame = args.frame if args.frame is not None else shape[0] // 2
        written.append(render_detections(sid, volume, gt_nodes, det, frame, out_dir))
        xy, zt = render_tracks(sid, nodes_df, edges_df, shape, out_dir)
        written.extend([xy, zt])
        print(f"[{sid}] wrote detection(t={frame}) + track views")
    print("\nWrote:")
    for w in written:
        print(" ", w)


if __name__ == "__main__":
    main()
