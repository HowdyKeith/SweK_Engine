"""
metric.py — implements the competition's exact evaluation metric, per
royerlab/kaggle-cell-tracking-competition/blob/main/metrics.md.

Edge Jaccard:
  1. Node matching: predicted nodes <-> GT nodes via optimal bipartite assignment
     on physically-scaled centroid distance, up to max 7.0 um, per timepoint.
  2. Edge matching: a predicted edge is TP when both endpoints match GT nodes
     connected by a GT edge. FP if exactly one endpoint matches a GT node that
     IS connected to some OTHER node by a GT edge (i.e. the metric "knows about"
     that node but the predicted edge doesn't correctly continue/start its track).
     All other predicted edges are ignored (ground truth too sparse to judge them).
  3. adjusted_jaccard = max(0, jaccard * (1 - a * (T_pred - T_true) / T_true)), a=0.1

Division Jaccard:
  For each GT division (node with 2 GT children), check the predicted graph for
  a single connected component that: has >=1 matched node at/before the split,
  touches BOTH daughter lineages (at any timepoint, absorbing +/-1 offsets), and
  contains a predicted node with >=2 outgoing edges (a predicted fork).
  TP/FP/FN -> micro-averaged Jaccard.

Final score = adjusted_edge_jaccard + 0.1 * division_jaccard
(adjusted edge Jaccard is weight-averaged across samples by w_i = TP+FP+FN;
 division TP/FP/FN are summed across all samples before computing the Jaccard.)
"""
import networkx as nx
import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment
from scipy.spatial.distance import cdist

from io_utils import VOXEL_SCALE

MAX_MATCH_DIST_UM = 7.0
ADJUST_A = 0.1
DIVISION_WEIGHT = 0.1


def _scale(coords):
    s = np.array([VOXEL_SCALE["z"], VOXEL_SCALE["y"], VOXEL_SCALE["x"]])
    return coords * s


def match_nodes_per_timepoint(pred_nodes, gt_nodes, max_dist=MAX_MATCH_DIST_UM):
    """
    pred_nodes, gt_nodes: DataFrame[node_id, t, z, y, x]
    Returns: dict pred_node_id -> gt_node_id (only for matched pairs)
    Matching is done independently per timepoint via Hungarian assignment on
    physically-scaled Euclidean distance, with a hard cutoff at max_dist.
    """
    match = {}
    timepoints = sorted(set(pred_nodes["t"]).union(set(gt_nodes["t"])))
    for t in timepoints:
        p = pred_nodes[pred_nodes["t"] == t]
        g = gt_nodes[gt_nodes["t"] == t]
        if len(p) == 0 or len(g) == 0:
            continue
        p_coords = _scale(p[["z", "y", "x"]].to_numpy(dtype=float))
        g_coords = _scale(g[["z", "y", "x"]].to_numpy(dtype=float))
        dist = cdist(p_coords, g_coords, metric="euclidean")
        cost = dist.copy()
        cost[cost > max_dist] = 1e6
        row_ind, col_ind = linear_sum_assignment(cost)
        p_ids = p["node_id"].to_numpy()
        g_ids = g["node_id"].to_numpy()
        for r, c in zip(row_ind, col_ind):
            if cost[r, c] < 1e6:
                match[p_ids[r]] = g_ids[c]
    return match


def edge_jaccard(pred_nodes, pred_edges, gt_nodes, gt_edges, estimated_total_nodes):
    """
    Computes the adjusted edge Jaccard for one sample.
    Returns dict with tp, fp, fn, jaccard, adjusted_jaccard, t_pred, t_true.
    """
    node_match = match_nodes_per_timepoint(pred_nodes, gt_nodes)  # pred_id -> gt_id
    gt_id_to_pred_id = {}
    for p_id, g_id in node_match.items():
        gt_id_to_pred_id.setdefault(g_id, []).append(p_id)

    # set of GT edges as (gt_source, gt_target) tuples for quick lookup
    gt_edge_set = set(zip(gt_edges["source_id"], gt_edges["target_id"]))
    # which GT nodes participate in at least one GT edge (as source or target)
    gt_nodes_with_edges = set(gt_edges["source_id"]).union(set(gt_edges["target_id"]))

    tp = 0
    fp = 0
    matched_gt_edges = set()

    for _, e in pred_edges.iterrows():
        src_gt = node_match.get(e["source_id"])
        tgt_gt = node_match.get(e["target_id"])

        if src_gt is not None and tgt_gt is not None and (src_gt, tgt_gt) in gt_edge_set:
            tp += 1
            matched_gt_edges.add((src_gt, tgt_gt))
            continue

        # FP conditions per spec:
        #  - predicted edge's target matches a GT node that's connected to ANOTHER source
        #  - predicted edge's source matches a GT node that's connected to ANOTHER target
        is_fp = False
        if tgt_gt is not None and tgt_gt in gt_nodes_with_edges:
            # is there a GT edge ending at tgt_gt whose source isn't src_gt?
            other_sources = {s for (s, t_) in gt_edge_set if t_ == tgt_gt}
            if other_sources and (src_gt not in other_sources):
                is_fp = True
        if not is_fp and src_gt is not None and src_gt in gt_nodes_with_edges:
            other_targets = {t_ for (s, t_) in gt_edge_set if s == src_gt}
            if other_targets and (tgt_gt not in other_targets):
                is_fp = True
        if is_fp:
            fp += 1
        # else: ignored (ground truth too sparse to judge this edge)

    fn = len(gt_edge_set) - len(matched_gt_edges)

    jaccard = tp / (tp + fp + fn) if (tp + fp + fn) > 0 else 0.0
    t_pred = len(pred_nodes)
    t_true = estimated_total_nodes if estimated_total_nodes else max(t_pred, 1)
    adjusted = max(0.0, jaccard * (1 - ADJUST_A * (t_pred - t_true) / t_true))

    return {
        "tp": tp, "fp": fp, "fn": fn,
        "jaccard": jaccard, "adjusted_jaccard": adjusted,
        "t_pred": t_pred, "t_true": t_true,
        "weight": tp + fp + fn,
    }


def _build_nx_graph(nodes_df, edges_df):
    g = nx.DiGraph()
    for _, n in nodes_df.iterrows():
        g.add_node(int(n["node_id"]), t=int(n["t"]))
    for _, e in edges_df.iterrows():
        g.add_edge(int(e["source_id"]), int(e["target_id"]))
    return g


def division_jaccard_components(pred_nodes, pred_edges, gt_nodes, gt_edges):
    """
    Computes division TP/FP/FN for one sample per the spec:
      - GT division = a GT node with >=2 outgoing GT edges.
      - matched via node_match (pred<->gt by centroid, same as edge metric).
      - TP if: >=1 matched node at/before split, both daughter lineages touched
        (possibly at different t, absorbing +/-1), single connected predicted
        component, and that component has a predicted fork (node w/ outdeg>=2).
      - FP: predicted fork whose match lands on an annotated-but-non-dividing
        GT node, not paired to any GT division.
    Returns dict with tp, fp, fn lists/counts for this sample (to be summed
    across samples before computing the micro-averaged Jaccard).
    """
    node_match = match_nodes_per_timepoint(pred_nodes, gt_nodes)  # pred_id -> gt_id
    pred_id_for_gt = {}
    for p_id, g_id in node_match.items():
        pred_id_for_gt.setdefault(g_id, []).append(p_id)

    pred_graph = _build_nx_graph(pred_nodes, pred_edges)
    # weakly-connected components of the predicted graph, as sets of pred node ids
    pred_components = list(nx.weakly_connected_components(pred_graph))
    comp_of_pred_node = {}
    for ci, comp in enumerate(pred_components):
        for nid in comp:
            comp_of_pred_node[nid] = ci

    pred_outdeg = dict(pred_graph.out_degree())
    forked_components = set()
    for nid, od in pred_outdeg.items():
        if od >= 2:
            forked_components.add(comp_of_pred_node.get(nid))

    # GT divisions: nodes with >=2 outgoing GT edges
    gt_outdeg = {}
    gt_children = {}
    for _, e in gt_edges.iterrows():
        gt_outdeg[e["source_id"]] = gt_outdeg.get(e["source_id"], 0) + 1
        gt_children.setdefault(e["source_id"], []).append(e["target_id"])
    gt_divisions = [nid for nid, od in gt_outdeg.items() if od >= 2]

    tp = 0
    fn = 0
    matched_components_for_tp = set()

    for div_gt_id in gt_divisions:
        children = gt_children[div_gt_id][:2]  # exactly 2 daughters expected
        # gather matched predicted nodes that correspond to: parent + both lineages
        parent_pred_ids = pred_id_for_gt.get(div_gt_id, [])
        # descendants of each daughter within the GT graph (for lineage coverage)
        gt_graph = nx.DiGraph()
        for _, e in gt_edges.iterrows():
            gt_graph.add_edge(e["source_id"], e["target_id"])
        lineage_touched = [False, False]
        touched_components = set()

        if parent_pred_ids:
            for pid in parent_pred_ids:
                touched_components.add(comp_of_pred_node.get(pid))

        for li, child_gt in enumerate(children):
            descendants = {child_gt} | nx.descendants(gt_graph, child_gt) if gt_graph.has_node(child_gt) else {child_gt}
            for gt_id in descendants:
                for pid in pred_id_for_gt.get(gt_id, []):
                    lineage_touched[li] = True
                    touched_components.add(comp_of_pred_node.get(pid))

        touched_components.discard(None)
        is_tp = False
        if parent_pred_ids and all(lineage_touched) and len(touched_components) == 1:
            comp_id = next(iter(touched_components))
            if comp_id in forked_components:
                is_tp = True

        if is_tp:
            tp += 1
            matched_components_for_tp.add(comp_id)
        else:
            fn += 1

    # FP: predicted forked components whose fork-node matches an annotated
    # (has GT edges) but non-dividing GT node, and the component wasn't a TP match.
    gt_nodes_with_edges_nondividing = set(gt_outdeg.keys()) - set(gt_divisions)
    gt_targets_only = set(gt_edges["target_id"]) - set(gt_outdeg.keys())  # annotated leaf/passthrough nodes
    annotated_nondividing = gt_nodes_with_edges_nondividing | gt_targets_only

    fp = 0
    for nid, od in pred_outdeg.items():
        if od < 2:
            continue
        comp_id = comp_of_pred_node.get(nid)
        if comp_id in matched_components_for_tp:
            continue  # already counted as part of a TP component
        gt_match = node_match.get(nid)
        if gt_match is not None and gt_match in annotated_nondividing:
            fp += 1

    return {"tp": tp, "fp": fp, "fn": fn}


def evaluate_sample(pred_nodes, pred_edges, gt_nodes, gt_edges, estimated_total_nodes):
    """Returns per-sample edge metrics + division metrics (un-aggregated)."""
    edge_res = edge_jaccard(pred_nodes, pred_edges, gt_nodes, gt_edges, estimated_total_nodes)
    div_res = division_jaccard_components(pred_nodes, pred_edges, gt_nodes, gt_edges)
    return {"edge": edge_res, "division": div_res}


def aggregate_scores(per_sample_results):
    """
    per_sample_results: dict[sample_id] -> result of evaluate_sample()
    Returns the final competition score plus the component breakdowns.
    """
    # weight-averaged adjusted edge Jaccard
    total_weight = sum(r["edge"]["weight"] for r in per_sample_results.values())
    if total_weight > 0:
        adj_edge_jaccard = sum(
            r["edge"]["adjusted_jaccard"] * r["edge"]["weight"] for r in per_sample_results.values()
        ) / total_weight
    else:
        adj_edge_jaccard = 0.0

    # micro-averaged division Jaccard (sum TP/FP/FN across samples first)
    total_tp = sum(r["division"]["tp"] for r in per_sample_results.values())
    total_fp = sum(r["division"]["fp"] for r in per_sample_results.values())
    total_fn = sum(r["division"]["fn"] for r in per_sample_results.values())
    denom = total_tp + total_fp + total_fn
    div_jaccard = total_tp / denom if denom > 0 else 0.0

    final_score = adj_edge_jaccard + DIVISION_WEIGHT * div_jaccard

    return {
        "adjusted_edge_jaccard": adj_edge_jaccard,
        "division_jaccard": div_jaccard,
        "division_tp": total_tp, "division_fp": total_fp, "division_fn": total_fn,
        "final_score": final_score,
    }
