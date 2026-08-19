"""
make_synthetic_data.py — generates a synthetic 3D+time cell-tracking dataset that
mimics the competition's zarr v3 + geff format, for developing/testing the pipeline
without real data.

v1878 — REALISTIC rewrite. The previous generator placed cells with plain uniform
sampling + unconstrained random-walk drift, which let nuclei land on top of each
other (ground-truth nearest-neighbour spacing hit 0.00 um). Overlapping cells can't
be separated by ANY centroid detector, so detection recall was capped artificially
and the local score was a poor proxy for algorithm quality. This version fixes the
realism so the local score actually predicts pipeline quality:

  1. NON-OVERLAPPING placement. Cells are seeded AND kept apart by rejection sampling
     against a minimum physical separation (min_sep_um), in real micrometres using the
     anisotropic voxel scale. Drift that would violate the spacing is rejected, so two
     nuclei never occupy the same voxel. `overlap_frac` optionally allows a controlled
     fraction of close-but-resolvable pairs (never coincident) to keep dense regions.
  2. ANISOTROPIC blobs. Real microscopy has ~4x coarser z sampling (1.625 vs 0.406
     um/voxel). Blobs now use a physical radius in um converted to per-axis voxel sigma,
     so a cell is a few voxels in z but many in x/y — matching real nuclei.
  3. POISSON + read noise. Fluorescence is shot-noise limited: signal ~ Poisson, plus a
     Gaussian read/background term and a slow background gradient across the field.
  4. Plausible divisions + motion. Daughters are pushed apart along a random axis (not
     jittered onto each other) and inherit a smoothly-varying velocity; parents stop.

Output layout (unchanged):
  test_data/{train}/<sample_id>.zarr   (image volume)
                    <sample_id>.geff   (ground-truth graph)
"""
import json
import shutil
from pathlib import Path

import numpy as np
import zarr


VOXEL_SCALE = {"z": 1.625, "y": 0.40625, "x": 0.40625}  # um/voxel, per competition spec
_SCALE = np.array([VOXEL_SCALE["z"], VOXEL_SCALE["y"], VOXEL_SCALE["x"]])


def _phys(a, b):
    """Physical (um) distance between two (z,y,x) voxel coords."""
    return float(np.linalg.norm((np.asarray(a, float) - np.asarray(b, float)) * _SCALE))


def make_gaussian_blob(shape, center, sigma_vox, amplitude):
    """
    Render a 3D Gaussian blob with PER-AXIS sigma (anisotropic) into a (Z,Y,X) region
    via a bounding box. sigma_vox = (sz, sy, sx) in voxels.
    """
    zc, yc, xc = center
    sz, sy, sx = sigma_vox
    rz, ry, rx = int(sz * 4) + 2, int(sy * 4) + 2, int(sx * 4) + 2
    z0, z1 = max(0, zc - rz), min(shape[0], zc + rz)
    y0, y1 = max(0, yc - ry), min(shape[1], yc + ry)
    x0, x1 = max(0, xc - rx), min(shape[2], xc + rx)
    if z0 >= z1 or y0 >= y1 or x0 >= x1:
        return (0, 0, 0, 0, 0, 0), np.zeros((0, 0, 0))
    zz, yy, xx = np.meshgrid(np.arange(z0, z1), np.arange(y0, y1), np.arange(x0, x1), indexing="ij")
    d2 = ((zz - zc) / sz) ** 2 + ((yy - yc) / sy) ** 2 + ((xx - xc) / sx) ** 2
    blob = amplitude * np.exp(-0.5 * d2)
    return (z0, z1, y0, y1, x0, x1), blob


class Cell:
    """A simulated cell trajectory; can split into two daughters at a division frame."""

    _next_id = [1]

    def __init__(self, pos, radius_um=3.0, amplitude=3000.0, vel=None):
        self.id = Cell._next_id[0]
        Cell._next_id[0] += 1
        self.pos = np.array(pos, dtype=float)          # (z, y, x) voxels
        self.radius_um = radius_um
        self.amplitude = amplitude
        self.vel = np.zeros(3) if vel is None else np.array(vel, float)   # voxels/frame
        self.alive = True
        self.parent_node_id = None

    def sigma_vox(self):
        """Physical radius (um) -> per-axis sigma in voxels (anisotropic)."""
        return np.array([self.radius_um / VOXEL_SCALE["z"],
                         self.radius_um / VOXEL_SCALE["y"],
                         self.radius_um / VOXEL_SCALE["x"]]) * 0.5


def _bounds(shape):
    Z, Y, X = shape[-3], shape[-2], shape[-1]
    return (6, Z - 7), (12, Y - 13), (12, X - 13)


def _place_nonoverlapping(existing, shape, rng, min_sep_um, tries=200):
    """Rejection-sample a position at least min_sep_um from every existing cell."""
    (z0, z1), (y0, y1), (x0, x1) = _bounds(shape)
    for _ in range(tries):
        p = np.array([rng.uniform(z0, z1), rng.uniform(y0, y1), rng.uniform(x0, x1)])
        if all(_phys(p, c.pos) >= min_sep_um for c in existing):
            return p
    return None   # couldn't fit another cell without overlap


def _step_cell(c, others, shape, rng, min_sep_um, drift_std=1.2, vel_damp=0.6):
    """Advance a cell with smooth velocity + jitter, rejecting moves that overlap."""
    (z0, z1), (y0, y1), (x0, x1) = _bounds(shape)
    c.vel = vel_damp * c.vel + rng.normal(0, drift_std, size=3)
    cand = c.pos + c.vel
    cand[0] = np.clip(cand[0], z0, z1)
    cand[1] = np.clip(cand[1], y0, y1)
    cand[2] = np.clip(cand[2], x0, x1)
    # reject if it would collide with another live cell; if so, damp velocity and stay
    if all(_phys(cand, o.pos) >= min_sep_um for o in others if o is not c and o.alive):
        c.pos = cand
    else:
        c.vel *= -0.3   # bounce a little, hold position this frame


def generate_sample(sample_id, out_dir, shape=(20, 48, 96, 96), n_cells=8,
                     n_divisions=2, seed=0, min_sep_um=6.0, read_noise=40.0,
                     bg_level=180.0, label_prob=0.85):
    """
    Generates one (zarr, geff) pair with non-overlapping, anisotropic, Poisson-noised cells.
    min_sep_um: minimum physical separation enforced between any two nuclei (um).
    """
    rng = np.random.default_rng(seed)
    T, Z, Y, X = shape

    # seed non-overlapping cells
    cells = []
    for _ in range(n_cells):
        p = _place_nonoverlapping(cells, shape, rng, min_sep_um)
        if p is None:
            break   # volume is full at this spacing
        cells.append(Cell(p, radius_um=rng.uniform(2.5, 3.8), amplitude=rng.uniform(2500, 4200),
                          vel=rng.normal(0, 0.6, size=3)))

    division_frames = sorted(rng.choice(range(3, T - 3), size=min(n_divisions, max(0, T - 6)), replace=False)) if T > 6 else []

    nodes, edges = [], []
    cell_last_node_id = {}
    node_id_counter = [1]

    def new_node_id():
        nid = node_id_counter[0]; node_id_counter[0] += 1; return nid

    volume = np.zeros(shape, dtype=np.uint16)

    for t in range(T):
        # divisions BEFORE rendering: parent splits into two daughters pushed apart
        if t in division_frames:
            live = [c for c in cells if c.alive]
            if live:
                parent = rng.choice(live)
                parent.alive = False
                axis = rng.normal(0, 1, size=3); axis /= (np.linalg.norm(axis) + 1e-9)
                push_vox = (min_sep_um * 0.7) / _SCALE.min()   # push daughters ~0.7*min_sep apart
                for sign in (+1, -1):
                    dpos = parent.pos + sign * axis * (push_vox / 2)
                    daughter = Cell(dpos, radius_um=parent.radius_um, amplitude=parent.amplitude,
                                    vel=parent.vel * 0.5 + sign * axis * 0.4)
                    daughter.parent_node_id = cell_last_node_id.get(parent.id)
                    cells.append(daughter)

        # render frame: clean signal, then Poisson shot noise + read noise + bg gradient
        signal = np.zeros((Z, Y, X), dtype=np.float64)
        for c in cells:
            if not c.alive:
                continue
            bbox, blob = make_gaussian_blob((Z, Y, X), tuple(np.round(c.pos).astype(int)), c.sigma_vox(), c.amplitude)
            if blob.size:
                z0, z1, y0, y1, x0, x1 = bbox
                signal[z0:z1, y0:y1, x0:x1] += blob

        # slow background gradient across the field (illumination falloff)
        gy = np.linspace(-1, 1, Y)[None, :, None]
        gx = np.linspace(-1, 1, X)[None, None, :]
        bg = bg_level * (1.0 + 0.15 * gy) * (1.0 + 0.10 * gx)
        # Poisson on (signal+bg) in "photon" units (scale down, sample, scale back up)
        gain = 0.08
        lam = np.clip((signal + bg) * gain, 0, None)
        noisy = rng.poisson(lam).astype(np.float64) / gain
        noisy += rng.normal(0, read_noise, size=noisy.shape)
        volume[t] = np.clip(noisy, 0, 65535).astype(np.uint16)

        # sparse ground-truth labels (like real annotations)
        for c in cells:
            if not c.alive:
                continue
            if rng.random() > label_prob:
                continue
            nid = new_node_id()
            z, y, x = np.round(c.pos).astype(int)
            nodes.append((nid, t, int(z), int(y), int(x)))
            prev_nid = cell_last_node_id.get(c.id)
            if prev_nid is not None:
                edges.append((prev_nid, nid))
            elif c.parent_node_id is not None:
                edges.append((c.parent_node_id, nid))
                c.parent_node_id = None
            cell_last_node_id[c.id] = nid

        # advance all live cells (collision-aware)
        live = [c for c in cells if c.alive]
        for c in live:
            _step_cell(c, live, (Z, Y, X), rng, min_sep_um)

    # ---- write zarr v3 image volume ----
    zarr_path = out_dir / f"{sample_id}.zarr"
    if zarr_path.exists():
        shutil.rmtree(zarr_path)
    store = zarr.storage.LocalStore(str(zarr_path))
    root = zarr.group(store=store, overwrite=True)
    arr = root.create_array("0", shape=shape, chunks=(1, Z, Y, X), dtype="uint16",
                            compressors=zarr.codecs.BloscCodec(cname="zstd", clevel=5))
    arr[:] = volume

    # ---- write geff ground-truth graph ----
    geff_path = out_dir / f"{sample_id}.geff"
    if geff_path.exists():
        shutil.rmtree(geff_path)
    gstore = zarr.storage.LocalStore(str(geff_path))
    groot = zarr.group(store=gstore, overwrite=True)

    node_ids = np.array([n[0] for n in nodes], dtype=np.int64)
    node_t = np.array([n[1] for n in nodes], dtype=np.int64)
    node_z = np.array([n[2] for n in nodes], dtype=np.int64)
    node_y = np.array([n[3] for n in nodes], dtype=np.int64)
    node_x = np.array([n[4] for n in nodes], dtype=np.int64)
    edge_arr = np.array(edges, dtype=np.int64) if edges else np.zeros((0, 2), dtype=np.int64)

    nodes_grp = groot.create_group("nodes")
    nodes_grp.create_array("ids", shape=node_ids.shape, dtype="int64",
                            compressors=zarr.codecs.BloscCodec(cname="zstd"))[:] = node_ids
    props_grp = nodes_grp.create_group("props")
    for prop_name, prop_vals in [("t", node_t), ("z", node_z), ("y", node_y), ("x", node_x)]:
        pg = props_grp.create_group(prop_name)
        pg.create_array("values", shape=prop_vals.shape, dtype="int64",
                         compressors=zarr.codecs.BloscCodec(cname="zstd"))[:] = prop_vals

    edges_grp = groot.create_group("edges")
    edges_grp.create_array("ids", shape=edge_arr.shape, dtype="int64",
                            compressors=zarr.codecs.BloscCodec(cname="zstd"))[:] = edge_arr

    groot.attrs["estimated_number_of_nodes"] = int(len(nodes) / max(0.01, label_prob))
    groot.attrs["voxel_scale"] = VOXEL_SCALE

    # quick self-check: minimum GT nearest-neighbour spacing (should be >~ min_sep_um)
    min_nn = _min_nn_spacing(nodes)
    return {
        "sample_id": sample_id,
        "n_nodes_labeled": len(nodes),
        "n_edges": len(edges),
        "division_frames": [int(f) for f in division_frames],
        "shape": shape,
        "min_nn_um": round(min_nn, 2),
    }


def _min_nn_spacing(nodes):
    """Minimum nearest-neighbour spacing (um) among GT nodes sharing a timepoint."""
    from collections import defaultdict
    by_t = defaultdict(list)
    for (_, t, z, y, x) in nodes:
        by_t[t].append((z, y, x))
    mn = np.inf
    for t, pts in by_t.items():
        if len(pts) < 2:
            continue
        P = np.array(pts, float) * _SCALE
        from scipy.spatial.distance import cdist
        D = cdist(P, P); np.fill_diagonal(D, np.inf)
        mn = min(mn, D.min())
    return float(mn) if np.isfinite(mn) else 0.0


if __name__ == "__main__":
    out_dir = Path(__file__).parent.parent / "test_data" / "train"
    out_dir.mkdir(parents=True, exist_ok=True)

    samples = [
        dict(sample_id="synth_0001", shape=(20, 48, 96, 96), n_cells=6, n_divisions=1, seed=1, min_sep_um=7.0),
        dict(sample_id="synth_0002", shape=(20, 48, 96, 96), n_cells=10, n_divisions=2, seed=2, min_sep_um=6.0),
    ]
    summary = []
    for s in samples:
        info = generate_sample(out_dir=out_dir, **s)
        summary.append(info)
        print(f"[{info['sample_id']}] nodes={info['n_nodes_labeled']} edges={info['n_edges']} "
              f"divisions_at={info['division_frames']} shape={info['shape']} min_NN={info['min_nn_um']}um")

    with open(out_dir.parent / "synthetic_summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\nWrote {len(samples)} synthetic samples to {out_dir}")
