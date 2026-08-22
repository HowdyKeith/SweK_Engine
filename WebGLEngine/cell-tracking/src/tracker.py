"""
tracker.py — links per-frame cell detections into tracks across time, and
identifies division events (one parent splitting into two daughters).

Approach: greedy/optimal bipartite matching between consecutive frames using
the Hungarian algorithm on physically-scaled Euclidean distance (matching the
competition's evaluation metric, which uses the same scaled-distance matching
for scoring). After the main 1-to-1 linking pass, a second pass looks for
"orphaned" detections in frame t+1 that are close to an existing track's last
position — if TWO daughters are both closer to one parent than to any other
track, and within a division distance threshold, that parent is marked as
having divided.
"""
import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment
from scipy.spatial.distance import cdist

from io_utils import VOXEL_SCALE


def scaled_distance(coords_a, coords_b):
    """
    Pairwise distance between two sets of (z, y, x) integer coords, scaled by
    the physical voxel size (matches the competition's evaluation metric scale).
    """
    scale = np.array([VOXEL_SCALE["z"], VOXEL_SCALE["y"], VOXEL_SCALE["x"]])
    a_phys = coords_a * scale
    b_phys = coords_b * scale
    return cdist(a_phys, b_phys, metric="euclidean")


# v2079 -- accel step 3: sparse candidate matching. Building the full MxN
# distance matrix wastes almost all of its work when max_link_distance is
# small (~7 voxels) and frames are dense (hundreds of cells) -- the vast
# majority of pairs are impossible links. This bins detections into a
# spatial hash sized to the link radius (in PHYSICAL space, since z is 4x
# coarser than x/y), so each track only tests detections in its own and
# neighboring bins. Results are IDENTICAL to the full-matrix path -- we
# only skip pairs that scaled_distance would have rejected anyway.
def _sparse_link_pairs(prev_coords, curr_coords, radius):
    """Return (rows, cols, dists): the track/detection index pairs within
    `radius` (physical um) and their distances, via a uniform spatial hash
    sized to the radius. Only pairs that could possibly link are returned;
    scaled_distance would have rejected all the rest. Distances are computed
    in ONE batched vectorized pass (no per-pair Python math)."""
    scale = np.array([VOXEL_SCALE["z"], VOXEL_SCALE["y"], VOXEL_SCALE["x"]])
    if radius <= 0 or len(prev_coords) == 0 or len(curr_coords) == 0:
        return np.array([], dtype=int), np.array([], dtype=int), np.array([])
    curr_phys = curr_coords * scale
    prev_phys = prev_coords * scale
    inv = 1.0 / radius
    grid = {}
    curr_bins = np.floor(curr_phys * inv).astype(np.int64)
    for j in range(len(curr_coords)):
        key = (int(curr_bins[j, 0]), int(curr_bins[j, 1]), int(curr_bins[j, 2]))
        grid.setdefault(key, []).append(j)
    prev_bins = np.floor(prev_phys * inv).astype(np.int64)
    rows, cols = [], []
    for i in range(len(prev_coords)):
        bz, by, bx = int(prev_bins[i, 0]), int(prev_bins[i, 1]), int(prev_bins[i, 2])
        cands = []
        for dz in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    g = grid.get((bz + dz, by + dy, bx + dx))
                    if g:
                        cands.extend(g)
        if cands:
            rows.append(np.full(len(cands), i, dtype=int))
            cols.append(np.asarray(cands, dtype=int))
    if not rows:
        return np.array([], dtype=int), np.array([], dtype=int), np.array([])
    R = np.concatenate(rows)
    C = np.concatenate(cols)
    D = np.linalg.norm(curr_phys[C] - prev_phys[R], axis=1)
    keep = D <= radius
    return R[keep], C[keep], D[keep]


class Track:
    """A single cell's trajectory: list of (t, node_id, z, y, x)."""

    _next_id = [1]

    def __init__(self):
        self.id = Track._next_id[0]
        Track._next_id[0] += 1
        self.points = []  # list of (t, node_id, z, y, x)
        self.alive = True

    def last(self):
        return self.points[-1] if self.points else None

    def add(self, t, node_id, z, y, x):
        self.points.append((t, node_id, z, y, x))


def link_frames(detections, max_link_distance=7.0, division_distance=10.0, max_gap=2):
    """
    detections: dict[t] -> (N_t, 3) array of (z, y, x) int centroids.
    max_link_distance: max physical distance (um) to link a cell frame-to-frame
        (matches the competition's max 7.0 um matching radius).
    division_distance: max physical distance (um) from a parent's last position
        to its two daughters at the division frame.
    max_gap: how many consecutive frames a track may go undetected and still be
        re-linked when it reappears (v2080 gap-closing). 0 = old behavior (a
        single miss ends the track). Real microscopy drops detections often
        (dim frames, occlusion, threshold flicker); coasting preserves the
        edge continuity the metric rewards instead of severing the lineage and
        starting a false new one.

    Returns:
      nodes_df: DataFrame[node_id, t, z, y, x]
      edges_df: DataFrame[source_id, target_id]
    """
    timepoints = sorted(detections.keys())
    if not timepoints:
        return pd.DataFrame(columns=["node_id", "t", "z", "y", "x"]), \
               pd.DataFrame(columns=["source_id", "target_id"])

    node_id_counter = [1]
    nodes = []      # (node_id, t, z, y, x)
    edges = []       # (source_id, target_id)

    # active_tracks: list of dicts {node_id, z, y, x} representing each live track's
    # most recent point. Indices align 1:1 with a Python list we manage directly.
    active = []  # each item: {"node_id": int, "coord": np.array([z,y,x])}

    def new_node(t, coord):
        nid = node_id_counter[0]
        node_id_counter[0] += 1
        nodes.append((nid, t, int(coord[0]), int(coord[1]), int(coord[2])))
        return nid

    # initialize tracks at the first frame
    first_coords = detections[timepoints[0]]
    for c in first_coords:
        nid = new_node(timepoints[0], c)
        active.append({"node_id": nid, "coord": np.array(c, dtype=float), "misses": 0})

    for ti in range(1, len(timepoints)):
        t = timepoints[ti]
        coords = detections[t]
        if len(coords) == 0:
            # v2080 -- EMPTY FRAME: coast every track (one missed frame) instead
            # of ending them all. One bad frame (z-stack glitch, a bright
            # artifact tripping the threshold) previously severed EVERY lineage
            # in the movie. Now tracks that have not exceeded max_gap survive.
            for a in active:
                a["misses"] = a.get("misses", 0) + 1
            active = [a for a in active if a["misses"] <= max_gap]
            continue
        if not active:
            # nothing to link from — start fresh tracks
            new_active = []
            for c in coords:
                nid = new_node(t, c)
                new_active.append({"node_id": nid, "coord": np.array(c, dtype=float), "misses": 0})
            active = new_active
            continue

        prev_coords = np.array([a["coord"] for a in active])
        curr_arr = np.array(coords)

        # v2079 -- SPARSE matching: only compute distances for track/detection
        # pairs within max_link_distance (via the spatial hash), then run the
        # Hungarian on a cost matrix seeded to "forbidden" everywhere and filled
        # only at candidate pairs. Identical result to the full-matrix path
        # (same finite entries, same 1e6 elsewhere), far less distance math on
        # dense frames. Falls back to the dense path for tiny frames where the
        # hash overhead is not worth it.
        M, N = len(active), len(coords)
        # v2079 -- crossover: below ~1500 cells/frame the dense cdist is
        # already fast and simplest; above it, cdist and the MxN matrix
        # dominate (measured: n=3000 dense 537ms vs sparse 115ms = 4.7x) and
        # the spatial hash pays off. Both produce IDENTICAL matches -- the
        # sparse path only omits pairs beyond max_link_distance, which
        # scaled_distance forbids anyway.
        if max(M, N) < 1500:
            cost = scaled_distance(prev_coords, curr_arr)
            cost[cost > max_link_distance] = 1e6
        else:
            R, C, D = _sparse_link_pairs(prev_coords, curr_arr, max_link_distance)
            cost = np.full((M, N), 1e6, dtype=float)
            if len(R):
                cost[R, C] = np.minimum(cost[R, C], D)
        row_ind, col_ind = linear_sum_assignment(cost)

        matched_prev = set()
        matched_curr = set()
        new_active = [None] * len(active)  # filled for matched; coasted below; None only when truly ended

        for r, c in zip(row_ind, col_ind):
            if cost[r, c] >= 1e6:
                continue  # assignment exceeded distance threshold — not a real match
            nid = new_node(t, coords[c])
            # v2080 -- edge connects from the track's LAST REAL node (which may be
            # from several frames ago if it was coasting), so a re-linked track
            # keeps ONE continuous lineage across the gap.
            edges.append((active[r]["node_id"], nid))
            new_active[r] = {"node_id": nid, "coord": np.array(coords[c], dtype=float), "misses": 0}
            matched_prev.add(r)
            matched_curr.add(c)

        # ---- division detection pass (v2080 -- rebuilt) ----
        # The OLD rule only fired when TWO unmatched detections shared a nearest
        # parent -- but at a real division one daughter is usually close enough
        # that the 1-to-1 Hungarian pass grabs it as a normal match, leaving only
        # ONE unmatched daughter, so the division was missed. The metric rewards
        # divisions (+0.1*division_jaccard) and wants a predicted node with
        # out-degree>=2, so we now detect a fork wherever a parent has BOTH a
        # matched child AND a nearby unmatched detection within division_distance
        # -- the common case the old logic dropped. Each unmatched detection is
        # assigned to its single best parent (nearest, within range); a parent
        # that ends up with a 2nd child becomes a division (its matched child is
        # the 1st edge, this the 2nd).
        unmatched_curr = [c for c in range(len(coords)) if c not in matched_curr]
        if unmatched_curr and active:
            all_prev_coords = np.array([a["coord"] for a in active])
            unmatched_coords = np.array([coords[c] for c in unmatched_curr])
            div_dist = scaled_distance(all_prev_coords, unmatched_coords)
            nearest_parent_idx = np.argmin(div_dist, axis=0)
            nearest_parent_dist = np.min(div_dist, axis=0)

            for k, c_idx in enumerate(unmatched_curr):
                nid = new_node(t, coords[c_idx])
                if nearest_parent_dist[k] > division_distance:
                    # too far from any track -> a genuinely new appearing cell
                    new_active.append({"node_id": nid, "coord": np.array(coords[c_idx], dtype=float), "misses": 0})
                    continue
                parent_r = int(nearest_parent_idx[k])
                # edge from the parent's LAST REAL node (works whether the parent
                # was matched this frame, coasting, or unmatched) -> the fork node
                # gets out-degree>=2 exactly when the parent also has a 1-to-1
                # child, which is what the metric looks for.
                edges.append((active[parent_r]["node_id"], nid))
                daughter = {"node_id": nid, "coord": np.array(coords[c_idx], dtype=float), "misses": 0}
                if new_active[parent_r] is None:
                    # parent had no 1-to-1 match -> this detection simply continues
                    # its lineage (not a division: only one child)
                    new_active[parent_r] = daughter
                else:
                    # parent already has a matched child this frame -> DIVISION:
                    # the parent node now has two outgoing edges. The daughter is
                    # a new track.
                    new_active.append(daughter)

        # v2080 -- GAP-CLOSING: an unmatched track (still None) is not ended
        # immediately -- it COASTS at its last known position with misses+1,
        # and is kept as a re-link candidate until it exceeds max_gap. This
        # preserves lineage edges across dropped detections instead of severing
        # them and spawning a false new track on reappearance.
        coasted = []
        for r in range(len(active)):
            if new_active[r] is not None:
                coasted.append(new_active[r])          # matched (or division-filled) this frame
            else:
                a = active[r]
                misses = a.get("misses", 0) + 1
                if misses <= max_gap:
                    # keep the SAME node_id + last coord so a future match links
                    # straight back to the pre-gap lineage; no node created for
                    # the missed frame (we do not invent detections).
                    coasted.append({"node_id": a["node_id"], "coord": a["coord"], "misses": misses})
                # else: truly ended, drop it
        # plus any brand-new tracks appended during division/new-cell handling
        for extra in new_active[len(active):]:
            if extra is not None:
                coasted.append(extra)
        active = coasted

    nodes_df = pd.DataFrame(nodes, columns=["node_id", "t", "z", "y", "x"])
    edges_df = pd.DataFrame(edges, columns=["source_id", "target_id"])
    return nodes_df, edges_df
