#!/usr/bin/env python3
# WebGLEngine/tools/maleCnsDendritePositions.py -- UNNUMBERED (the version is chosen at ship time)
#
# WHERE EACH CELL OF A TYPE HAS ITS DENDRITE, OUT OF THE MALE-CNS RELEASE'S PER-SYNAPSE FILE. The flat connectome (tools/maleCnsFlatExtract.py) says who connects to whom and how strongly; it does not say WHERE. For a visual cell that is half of what it is: an LC10a cell sees the patch of the eye its dendrite
# sits under in the lobula, and the body annotations give no such place for it. The release's syn-partners file has every synapse's coordinates. This reads it once (124 million rows for the significant-only file; a record batch at a time) and, for each cell of the named type in a vendored circuit, writes
#   sites      how many of its INPUT synapses were found (post-synaptic sites on the cell)
#   dendrite   how many of them are its dendrite: the input sites FARTHER than half the cell's farthest from the centre of the type's OUTPUT sites on that side (an LC10a cell's outputs are in the AOTU, its dendrite in the lobula, a long way off; the rest of its inputs are on its axon)
#   centroid   the median of those dendrite sites, [x, y, z] in the dataset's own coordinates (voxels)
#
#   python3 tools/maleCnsDendritePositions.py --partners <syn-partners-...significant-only.feather> --circuit vendor/male-cns/lc10-tracking-circuit.json --type LC10a --out vendor/male-cns/lc10-positions.json
#
# Needs pyarrow. It downloads nothing (the file is fetched by hand: its URL and sha256 go in vendor/male-cns/PROVENANCE.md) and judges nothing: which way the sheet of centroids maps onto the visual field is NOT in this file and not in its output.
import argparse, hashlib, json, sys, statistics, datetime

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--partners", required=True); ap.add_argument("--circuit", required=True); ap.add_argument("--type", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    import pyarrow as pa, pyarrow.compute as pc
    V = json.load(open(a.circuit)); cells = [n for n in V["neurons"] if n["type"] == a.type]
    if not cells: sys.exit(f"maleCnsDendritePositions: no neuron of type {a.type} in {a.circuit}")
    idset = pa.array([n["bodyId"] for n in cells], type=pa.int64()); ins = {n["bodyId"]: [] for n in cells}; outs = {n["bodyId"]: [] for n in cells}
    r = pa.ipc.open_file(pa.memory_map(a.partners)); rows = 0
    for k in range(r.num_record_batches):
        b = r.get_batch(k); rows += b.num_rows
        for col, store, xyz in (("body_post", ins, ("x_post", "y_post", "z_post")), ("body_pre", outs, ("x_pre", "y_pre", "z_pre"))):
            f = b.filter(pc.is_in(b.column(col), value_set=idset))
            for body, x, y, z in zip(f.column(col).to_pylist(), f.column(xyz[0]).to_pylist(), f.column(xyz[1]).to_pylist(), f.column(xyz[2]).to_pylist()): store[body].append((x, y, z))
    dist = lambda p, q: ((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2) ** 0.5
    centre = {}
    for side in sorted({n["somaSide"] for n in cells}):
        pts = [p for n in cells if n["somaSide"] == side for p in outs[n["bodyId"]]]
        centre[side] = [sum(p[i] for p in pts) / len(pts) for i in range(3)]
    out_cells = []
    for n in cells:
        pin = ins[n["bodyId"]]; d = [dist(p, centre[n["somaSide"]]) for p in pin]; far = [p for p, x in zip(pin, d) if x > 0.5 * max(d)]
        out_cells.append({"bodyId": n["bodyId"], "somaSide": n["somaSide"], "sites": len(pin), "dendrite": len(far), "centroid": [statistics.median(p[i] for p in far) for i in range(3)]})
    out = {"dataset": "male-cns:v1.0", "server": "https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/", "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "license": "CC-BY-4.0 (as vendor/male-cns/PROVENANCE.md records for this dataset from the Neuprint server; the release bucket's README states none; not re-confirmed)", "type": a.type, "circuit": a.circuit.replace("\\", "/").split("/")[-1],
           "method": "per cell: the median of its input sites farther than half its farthest from the centre of the type's output sites on its side", "units": "the dataset's voxels",
           "sources": {"partners": {"file": a.partners.split("/")[-1], "sha256": sha256(a.partners), "rows": rows}}, "outputCentres": centre, "cells": out_cells}
    json.dump(out, open(a.out, "w"), separators=(",", ":")); open(a.out, "a").write("\n")
    print(f"[maleCnsDendritePositions] {a.out}: {len(out_cells)} {a.type} cells, {sum(c['sites'] for c in out_cells)} input sites of which {sum(c['dendrite'] for c in out_cells)} dendrite, of {rows} rows read")

main()
