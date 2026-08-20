#!/usr/bin/env python3
"""
tools/tracker_bench.py — the Hungarian baseline against the integer program, on the same data, with the
same metric.

    python3 tools/tracker_bench.py

WHY THIS SHAPE. The only thing that changed is the LINKER. So the detector is taken out of the experiment
entirely: both trackers are handed the ground-truth centroids and asked to reconstruct the lineage. Any
difference in score is the linking model and nothing else. Then the detections are degraded — jittered,
dropped — and the same thing is asked again, because a tracker that is only good on perfect input is a
tracker nobody can use.

The metric is `metric.py`, which implements the competition's own scoring: bipartite node matching capped at
7 um, edge Jaccard, and divisions with a plus-or-minus-one-timepoint tolerance. Both trackers are read by it.
An accuracy claim between two trackers means nothing unless the same metric reads both.

AND IT HAS NEVER SEEN REAL DATA. The lineages below come from a generator written here. Real microscopy has
noise, density and dropout that no generator in this file knows about, and the numbers will move.
"""

from __future__ import annotations

import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
# tracksdata draws a progress bar per frame. A bench whose output is 90% progress bars is unreadable.
import os
os.environ.setdefault("TQDM_DISABLE", "1")
try:
    import tqdm
    tqdm.tqdm.__init__ = (lambda orig: (lambda self, *a, **k: orig(self, *a, **{**k, "disable": True})))(tqdm.tqdm.__init__)
except Exception:
    pass
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from metric import evaluate_sample  # noqa: E402
from tracker import link_frames  # noqa: E402
from tracker_ilp import ilp_available, link_frames_ilp  # noqa: E402


# --- a lineage, with divisions, in voxels ------------------------------------------------------------------
def make_lineage(seed: int, n_cells: int = 8, n_frames: int = 12, n_divisions: int = 3, shape=(48, 96, 96)):
    """A ground-truth movie of moving, dividing cells. Returns (nodes_df, edges_df, detections)."""
    rng = np.random.default_rng(seed)
    nodes, edges = [], []
    next_id = 0
    # Each live track is (node_id, position, velocity).
    live = []
    for _ in range(n_cells):
        pos = np.array([rng.uniform(6, shape[0] - 6), rng.uniform(6, shape[1] - 6), rng.uniform(6, shape[2] - 6)])
        vel = rng.normal(0, 0.8, 3)
        live.append([None, pos, vel])

    div_frames = sorted(rng.choice(np.arange(2, n_frames - 2), size=min(n_divisions, n_frames - 4), replace=False))
    detections: dict[int, np.ndarray] = {}

    for t in range(n_frames):
        # Move.
        for cell in live:
            cell[2] += rng.normal(0, 0.25, 3)
            cell[1] = np.clip(cell[1] + cell[2], 3, np.array(shape) - 4)

        # Emit this frame's nodes and remember each track's node id.
        frame_pts = []
        for cell in live:
            nid = next_id
            next_id += 1
            nodes.append((nid, t, *cell[1]))
            if cell[0] is not None:
                edges.append((cell[0], nid))
            cell[0] = nid
            frame_pts.append(cell[1].copy())
        detections[t] = np.array(frame_pts)

        # Divide: one track becomes two, and both daughters descend from the parent's node.
        if t in div_frames and len(live) < 20:
            parent = live[int(rng.integers(0, len(live)))]
            offset = rng.normal(0, 1.0, 3)
            offset = offset / (np.linalg.norm(offset) + 1e-9) * 2.5
            daughter = [parent[0], parent[1] + offset, parent[2] + rng.normal(0, 0.3, 3)]
            parent[1] = parent[1] - offset
            live.append(daughter)

    nodes_df = pd.DataFrame(nodes, columns=["node_id", "t", "z", "y", "x"])
    edges_df = pd.DataFrame(edges, columns=["source_id", "target_id"])
    return nodes_df, edges_df, detections


def degrade(detections, seed, jitter_vox=0.8, drop_prob=0.08):
    """Jitter every centroid and drop a few. Real microscopy does both, constantly."""
    rng = np.random.default_rng(seed + 7717)
    out = {}
    for t, pts in detections.items():
        keep = rng.random(len(pts)) > drop_prob
        p = pts[keep] if keep.any() else pts[:1]
        out[t] = p + rng.normal(0, jitter_vox, p.shape)
    return out


def score(pred_nodes, pred_edges, gt_nodes, gt_edges):
    """evaluate_sample returns {"edge": {...}, "division": {tp,fp,fn}}. Read it, do not guess at it."""
    return evaluate_sample(pred_nodes, pred_edges, gt_nodes, gt_edges, estimated_total_nodes=len(gt_nodes))


def run(label, detections, gt_nodes, gt_edges, seeds):
    rows = []
    for name, fn in (
        ("hungarian (tracker.py)", lambda d: link_frames(d)),
        ("tracksdata NN", lambda d: link_frames_ilp(d, solver="nn")),
        ("tracksdata ILP (SCIP)", lambda d: link_frames_ilp(d, solver="ilp")),
    ):
        edge_j, div_tp, div_fp, div_fn = [], 0, 0, 0
        for s in seeds:
            n, e = fn(detections[s])
            r = score(n, e, gt_nodes[s], gt_edges[s])
            edge_j.append(r["edge"]["adjusted_jaccard"])
            div_tp += r["division"]["tp"]
            div_fp += r["division"]["fp"]
            div_fn += r["division"]["fn"]
        dj = div_tp / max(1, div_tp + div_fp + div_fn)
        rows.append((name, float(np.mean(edge_j)), dj, div_tp, div_fp, div_fn))

    print(f"\n=== {label} ===")
    print(f"{'tracker':26} {'edge jaccard':>13} {'division J':>11}   TP/FP/FN")
    for name, ej, dj, tp, fp, fn in rows:
        print(f"{name:26} {ej:13.4f} {dj:11.4f}   {tp}/{fp}/{fn}")
    return rows


def main():
    ok, why = ilp_available()
    print(f"ILP backend: {'yes' if ok else 'NO'} ({why})")
    if not ok:
        print("  the ILP rows below cannot run. `pip install tracksdata ilpy`")
        return 1

    seeds = list(range(6))
    gt_nodes, gt_edges, clean, noisy = {}, {}, {}, {}
    for s in seeds:
        n, e, d = make_lineage(seed=s)
        gt_nodes[s], gt_edges[s], clean[s] = n, e, d
        noisy[s] = degrade(d, s)

    total_div = sum(
        int((gt_edges[s].groupby("source_id").size() == 2).sum()) for s in seeds
    )
    print(f"{len(seeds)} synthetic movies, {sum(len(gt_nodes[s]) for s in seeds)} nodes, {total_div} true divisions")

    run("PERFECT DETECTIONS (the linker alone)", clean, gt_nodes, gt_edges, seeds)
    run("JITTERED + 8% DROPPED (what a detector really gives you)", noisy, gt_nodes, gt_edges, seeds)

    print("\n  (synthetic lineages, generated here. The competition's zarr volumes are not in this")
    print("   environment, and every number above will move when they are.)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
