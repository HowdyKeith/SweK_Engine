"""
io_utils.py — readers for the competition's zarr v3 image volumes and geff
ground-truth graphs, plus the submission CSV writer.
"""
from pathlib import Path

import numpy as np
import pandas as pd
import zarr


VOXEL_SCALE = {"z": 1.625, "y": 0.40625, "x": 0.40625}  # um/voxel


def load_zarr_volume(zarr_path):
    """
    Loads a (T, Z, Y, X) uint16 volume from a zarr v3 directory.
    Returns the full volume as a numpy array (loaded into memory) plus its shape.
    For very large datasets, prefer load_zarr_frame() to stream one timepoint at a time.
    """
    root = zarr.open_group(str(zarr_path), mode="r")
    arr = root["0"]
    return arr[:], arr.shape


def open_zarr_array(zarr_path):
    """Opens the zarr array lazily (no data loaded) — use with load_zarr_frame()."""
    root = zarr.open_group(str(zarr_path), mode="r")
    return root["0"]


def load_zarr_frame(arr, t):
    """Loads a single (Z, Y, X) timepoint from a lazily-opened zarr array."""
    return arr[t]


def load_geff_graph(geff_path):
    """
    Loads a geff ground-truth graph. Returns:
      nodes_df: DataFrame[node_id, t, z, y, x]
      edges_df: DataFrame[source_id, target_id]
      meta: dict of geff attrs (e.g. estimated_number_of_nodes, voxel_scale)
    """
    root = zarr.open_group(str(geff_path), mode="r")
    nodes_grp = root["nodes"]
    node_ids = nodes_grp["ids"][:]
    props = nodes_grp["props"]
    t = props["t"]["values"][:]
    z = props["z"]["values"][:]
    y = props["y"]["values"][:]
    x = props["x"]["values"][:]

    nodes_df = pd.DataFrame({"node_id": node_ids, "t": t, "z": z, "y": y, "x": x})

    edges_arr = root["edges"]["ids"][:]
    if edges_arr.size == 0:
        edges_df = pd.DataFrame({"source_id": [], "target_id": []})
    else:
        edges_df = pd.DataFrame({"source_id": edges_arr[:, 0], "target_id": edges_arr[:, 1]})

    meta = dict(root.attrs)
    return nodes_df, edges_df, meta


def write_submission_csv(predictions, out_path):
    """
    predictions: dict[dataset_name] -> (nodes_df, edges_df)
      nodes_df columns: node_id, t, z, y, x  (integer voxel coords)
      edges_df columns: source_id, target_id

    Writes the competition's combined CSV format:
      id,dataset,row_type,node_id,t,z,y,x,source_id,target_id
    """
    rows = []
    idx = 0
    for dataset, (nodes_df, edges_df) in predictions.items():
        for _, n in nodes_df.iterrows():
            rows.append({
                "id": idx, "dataset": dataset, "row_type": "node",
                "node_id": int(n["node_id"]), "t": int(n["t"]),
                "z": int(n["z"]), "y": int(n["y"]), "x": int(n["x"]),
                "source_id": -1, "target_id": -1,
            })
            idx += 1
        for _, e in edges_df.iterrows():
            rows.append({
                "id": idx, "dataset": dataset, "row_type": "edge",
                "node_id": -1, "t": -1, "z": -1, "y": -1, "x": -1,
                "source_id": int(e["source_id"]), "target_id": int(e["target_id"]),
            })
            idx += 1

    out_df = pd.DataFrame(rows, columns=["id", "dataset", "row_type", "node_id",
                                          "t", "z", "y", "x", "source_id", "target_id"])
    out_df.to_csv(out_path, index=False)
    return out_df


def discover_samples(data_dir, split="train"):
    """Returns list of sample_ids found in data_dir/split (matching .zarr files)."""
    split_dir = Path(data_dir) / split
    return sorted(p.stem for p in split_dir.glob("*.zarr"))
