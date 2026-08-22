"""
tracker_ilp.py — link cells with an integer program instead of a greedy assignment.

`tracker.py` is a classical baseline: Hungarian assignment frame to frame on physically-scaled centroid
distance, then a nearest-parent heuristic for divisions. It is greedy in time — every frame's decision is
made without knowing what the next frame will look like — and its divisions are found by a rule rather than
chosen against the rest of the solution.

This links with `royerlab/tracksdata`, which is by the people who wrote the competition. The tracking problem
becomes one integer program over the whole movie: which detections to keep, which edges to take, where tracks
appear, where they disappear, and where they divide. A globally optimal solution is found by SCIP, through
`ilpy`. Gurobi is supported and NOT required.

    detections {t: (N_t, 3) int (z,y,x)}  ->  (nodes_df, edges_df)

Same contract as `tracker.link_frames`, so `metric.py` scores both on the same data. That is the only reason
to write it this way: an accuracy claim between two trackers means nothing unless the same metric reads both.


THE COSTS ARE THE MODEL, AND THE SIGNS MATTER
---------------------------------------------
The ILP MINIMISES. So:

  * `edge_weight = distance`.  Low is preferred; a short link is a cheap link.
  * `node_weight` MUST BE NEGATIVE.  It is a reward for using a detection at all. Leave it at zero and the
    optimal solution is to select nothing: an empty tracking costs exactly zero.
  * `appearance` / `disappearance` are POSITIVE costs, and they must be EXPENSIVE RELATIVE TO A PLAUSIBLE
    LINK. This is the one that is not obvious. Price an appearance at 1 and, at a division, the solver will
    happily let the second daughter START A NEW TRACK — two appearances at 1 each beat one division plus two
    edges at 3.2 each. It is not wrong; it is answering the question it was asked.
  * ...but not too expensive. Price an appearance at 20 and the solver drops the division to avoid paying a
    disappearance somewhere else. There is a BAND, and `tests/test_tracker_ilp.py` pins both ends of it.

`APPEAR_COST` is set to a small multiple of the link radius for that reason, so the two costs stay in the
same units and the same order of magnitude as each other.


WHAT THIS IS NOT
----------------
It is not `ultrack`. Ultrack's contribution is that it does not commit to one segmentation: it carries
MULTIPLE candidate segmentations per cell per timepoint and lets the tracker choose between them. Our
detector emits one centroid per cell per frame, so there is nothing to choose between, and wiring ultrack in
front of a single-hypothesis detector would buy nothing but a dependency. That is the next real piece of
work, and it belongs in the detector, not here.

AND IT HAS NEVER SEEN REAL DATA. Everything below is validated against the synthetic generator, exactly as
`tracker.py` is. The competition's zarr volumes are not in this environment.
"""

from __future__ import annotations

import warnings

import numpy as np
import pandas as pd

from io_utils import VOXEL_SCALE

# Matches tracker.py and the competition's 7 um node-matching radius.
MAX_LINK_DISTANCE_UM = 7.0
# Appearance and disappearance must cost more than a plausible link and less than an implausible one. Half
# the link radius puts them squarely inside the band that `tests/test_tracker_ilp.py` measures.
APPEAR_COST = MAX_LINK_DISTANCE_UM * 0.75
# A reward for keeping a detection. Any value comfortably larger than the worst edge cost works; what must
# not happen is zero, which makes an empty solution optimal.
NODE_REWARD = -(MAX_LINK_DISTANCE_UM * 4.0)
# A division is SLIGHTLY REWARDED, and that is not a thumb on the scale -- it is telling the solver what the
# scoreboard says. The competition metric pays `+0.1 * division_jaccard` on top of the edge Jaccard, and a
# cost-minimising solver has no idea a division is worth anything unless somebody prices it. Measured on six
# synthetic movies with jittered and dropped detections (`tools/tracker_bench.py`):
#
#     division_cost   edge J   div J   competition score
#          +1.0       0.8162  0.4444        0.8606     <- punished: it trades divisions away for edges
#           0.0       0.8130  0.6111        0.8741
#          -2.0       0.8111  0.6842        0.8795     <- here
#          -5.0       0.7975  0.6500        0.8625     <- over-rewarded: it invents them
DIVISION_COST = -2.0
N_NEIGHBORS = 5


def _scaled(coords: np.ndarray) -> np.ndarray:
    """Voxels to microns. Distance is only meaningful in physical units: z is not y."""
    s = np.array([VOXEL_SCALE["z"], VOXEL_SCALE["y"], VOXEL_SCALE["x"]], dtype=float)
    return np.asarray(coords, dtype=float) * s


def ilp_available() -> tuple[bool, str]:
    """Whether an ILP backend is really here. A tracker that silently degrades is a tracker that lies."""
    try:
        import ilpy  # noqa: F401
    except Exception as e:  # pragma: no cover - environment dependent
        return False, f"ilpy is not installed ({e})"
    try:
        import tracksdata  # noqa: F401
    except Exception as e:  # pragma: no cover
        return False, f"tracksdata is not installed ({e})"
    return True, "ilpy + tracksdata"


def link_frames_ilp(
    detections: dict[int, np.ndarray],
    max_link_distance: float = MAX_LINK_DISTANCE_UM,
    appear_cost: float = APPEAR_COST,
    node_reward: float = NODE_REWARD,
    division_cost: float = DIVISION_COST,
    n_neighbors: int = N_NEIGHBORS,
    solver: str = "ilp",
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    detections: dict[t] -> (N_t, 3) array of (z, y, x) voxel centroids.
    solver: "ilp" (globally optimal, needs ilpy) or "nn" (tracksdata's nearest-neighbour solver).

    Returns (nodes_df, edges_df) with exactly the columns tracker.link_frames returns:
        nodes_df: node_id, t, z, y, x
        edges_df: source_id, target_id
    """
    import logging

    import polars as pl

    from tracksdata.constants import DEFAULT_ATTR_KEYS as K
    from tracksdata.edges import DistanceEdges
    from tracksdata.graph import RustWorkXGraph
    from tracksdata.solvers import ILPSolver, NearestNeighborsSolver

    # tracksdata is chatty about empty frames; the caller already knows.
    logging.getLogger("tracksdata").setLevel(logging.ERROR)

    times = sorted(detections.keys())
    if not times or all(len(detections[t]) == 0 for t in times):
        return (
            pd.DataFrame(columns=["node_id", "t", "z", "y", "x"]),
            pd.DataFrame(columns=["source_id", "target_id"]),
        )

    graph = RustWorkXGraph()
    for key in ("z", "y", "x"):
        graph.add_node_attr_key(key, pl.Float64, 0.0)

    # Voxels in, MICRONS in the graph. `DistanceEdges` measures euclidean distance on the attributes it is
    # given, and a threshold of "7" means seven of whatever unit those are.
    rows: list[tuple[int, int, tuple[float, float, float]]] = []
    for t in times:
        pts = np.atleast_2d(np.asarray(detections[t]))
        if pts.size == 0:
            continue
        for zyx in _scaled(pts):
            node_id = graph.add_node({K.T: int(t), "z": float(zyx[0]), "y": float(zyx[1]), "x": float(zyx[2])})
            rows.append((node_id, int(t), tuple(zyx)))

    DistanceEdges(distance_threshold=float(max_link_distance), n_neighbors=int(n_neighbors)).add_edges(graph)

    if solver == "nn":
        chosen = NearestNeighborsSolver(max_children=2, edge_weight="distance").solve(graph)
    else:
        ok, why = ilp_available()
        if not ok:
            raise RuntimeError(f"the ILP solver was asked for and is not available: {why}. Pass solver='nn'.")
        chosen = ILPSolver(
            edge_weight="distance",
            node_weight=float(node_reward),
            appearance_weight=float(appear_cost),
            disappearance_weight=float(appear_cost),
            division_weight=float(division_cost),
        ).solve(graph)

    # Back to our own frame. The node ids are the graph's, and they are stable.
    kept = set(int(i) for i in chosen.node_ids())
    nodes = [(nid, t, *_unscale(zyx)) for (nid, t, zyx) in rows if nid in kept]
    nodes_df = pd.DataFrame(nodes, columns=["node_id", "t", "z", "y", "x"])

    if chosen.num_edges() == 0:
        edges_df = pd.DataFrame(columns=["source_id", "target_id"])
    else:
        e = chosen.edge_attrs()[["source_id", "target_id"]].to_numpy()
        edges_df = pd.DataFrame(e, columns=["source_id", "target_id"]).astype(int)

    return nodes_df.sort_values(["t", "node_id"]).reset_index(drop=True), edges_df.reset_index(drop=True)


def _unscale(zyx) -> tuple[float, float, float]:
    """Microns back to voxels, because that is what the submission and the metric both expect."""
    s = (VOXEL_SCALE["z"], VOXEL_SCALE["y"], VOXEL_SCALE["x"])
    return (zyx[0] / s[0], zyx[1] / s[1], zyx[2] / s[2])


def divisions_of(edges_df: pd.DataFrame) -> list[int]:
    """A division is a node with exactly two outgoing edges. The metric's definition, not ours."""
    if len(edges_df) == 0:
        return []
    counts = edges_df.groupby("source_id").size()
    return sorted(int(i) for i in counts[counts == 2].index)


__all__ = [
    "link_frames_ilp",
    "ilp_available",
    "divisions_of",
    "MAX_LINK_DISTANCE_UM",
    "APPEAR_COST",
    "NODE_REWARD",
    "DIVISION_COST",
]
