#!/usr/bin/env python3
# WebGLEngine/tools/maleCnsRetinotopy.py -- UNNUMBERED, NOT GATED (no selfcheck yet)
# WHERE EACH LC4 AND LPLC2 CELL LOOKS, FROM THE DATA: male-cns:v1.0 on Neuprint annotates the lobula (LO), the lobula plate (LOP) and the medulla with a COLUMN LATTICE (ROIs named LO_R_col_x_y, LOP_L_col_x_y, ...), and every neuron's roiInfo gives its synapse counts per column.
# For each LC4 and LPLC2 cell that synapses onto a Giant Fiber (DNp01(GF)) this writes its dendritic position in lattice units: the centroid of its POSTsynaptic sites over the lobula columns (and, for LPLC2, over the lobula plate columns), the RMS radius of that footprint,
# and the number of columns it covers. For a sample of LPLC2 cells it also measures the four LOBULA-PLATE LAYER SUB-FIELDS (the centroid of the postsynaptic sites in each of layers 1 to 4, as an offset from the cell's own centroid), from the per-synapse layer and column flags.
# WHAT THIS DOES NOT DO: it does not convert lattice units to degrees of visual angle (no calibration of the lattice to the eye is derived here), and it does not say which layer prefers which direction of motion.
# READ-ONLY. NO TOKEN IS READ, TYPED OR WRITTEN HERE: the session's network proxy supplies the credential for neuprint.janelia.org (on your own machine, give the Neuprint client its token the way it expects: this script has no option for one on purpose).
# Run: python3 tools/maleCnsRetinotopy.py --circuit vendor/male-cns/giant-fiber-visual-circuit.json --out vendor/male-cns/giant-fiber-visual-retinotopy.json [--layer-per-side 24]
import argparse, datetime, json, re, sys, time
import numpy as np, requests
SERVER, DATASET = "https://neuprint.janelia.org", "male-cns:v1.0"
def cypher(q, retries=4):
    for i in range(retries):
        try:
            r = requests.post(SERVER + "/api/custom/custom", json={"cypher": q, "dataset": DATASET}, timeout=180)
            if r.status_code in (401, 403): raise SystemExit("HTTP %d: no access: stop" % r.status_code)
            if r.status_code >= 500 or r.status_code == 429: time.sleep(10 * (i + 1)); continue
            r.raise_for_status(); d = r.json(); return [dict(zip(d["columns"], row)) for row in d["data"]]
        except requests.exceptions.RequestException:
            if i == retries - 1: raise
            time.sleep(10 * (i + 1))
    raise RuntimeError("no answer")
COL = re.compile(r"^(LO|LOP)_([RL])_col_(\d+)_(\d+)$"); LAY = re.compile(r"^LOP_([RL])_layer_(\d)$")
def footprint(info, nm):
    a = np.array([(int(m.group(3)), int(m.group(4)), v.get("post", 0)) for k, v in info.items() for m in [COL.match(k)] if m and m.group(1) == nm], float).reshape(-1, 3)
    w = a[:, 2]
    if w.sum() <= 0: return None
    cx, cy = (a[:, 0] * w).sum() / w.sum(), (a[:, 1] * w).sum() / w.sum()
    rms = float(np.sqrt(((a[:, 0] - cx) ** 2 * w).sum() / w.sum() + ((a[:, 1] - cy) ** 2 * w).sum() / w.sum()))
    return {"x": round(float(cx), 3), "y": round(float(cy), 3), "rms": round(rms, 3), "cols": int((w > 0).sum()), "post": int(w.sum())}
def layer_offsets(body, side):
    res = cypher("MATCH (n:Neuron {bodyId: %d})-[:Contains]->(:SynapseSet)-[:Contains]->(s:Synapse) WHERE s.type = 'post' AND s.`LOP(%s)` = true RETURN properties(s) AS p" % (body, side))
    cl = re.compile(r"^LOP_%s_col_(\d+)_(\d+)$" % side); ll = re.compile(r"^LOP_%s_layer_(\d)$" % side); rows = []
    for r in res:
        p = r["p"]; lay = [int(m.group(1)) for k in p for m in [ll.match(k)] if m and p[k]]; col = [(int(m.group(1)), int(m.group(2))) for k in p for m in [cl.match(k)] if m and p[k]]
        if lay and col: rows.append((lay[0], col[0][0], col[0][1]))
    a = np.array(rows, float)
    if len(a) == 0: return None
    cx, cy = a[:, 1].mean(), a[:, 2].mean(); out = {}
    for L in (1, 2, 3, 4):
        h = a[a[:, 0] == L]
        if len(h) >= 30: out[str(L)] = {"dx": round(float(h[:, 1].mean() - cx), 3), "dy": round(float(h[:, 2].mean() - cy), 3), "rms": round(float(np.sqrt(h[:, 1].var() + h[:, 2].var())), 3), "n": int(len(h))}
    return out
def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--circuit", required=True); ap.add_argument("--out", required=True); ap.add_argument("--layer-per-side", type=int, default=24); a = ap.parse_args()
    circ = json.load(open(a.circuit)); gf = [n["bodyId"] for n in circ["neurons"] if n.get("role") == "giant-fiber"]
    cells = cypher("MATCH (a:Neuron)-[c:ConnectsTo]->(b:Neuron) WHERE b.bodyId IN %s AND a.type IN ['LC4','LPLC2'] RETURN DISTINCT a.bodyId AS bodyId, a.type AS type, a.somaSide AS side, a.roiInfo AS roiInfo" % gf)
    out = []
    for c in sorted(cells, key=lambda r: r["bodyId"]):
        info = json.loads(c["roiInfo"]) if isinstance(c["roiInfo"], str) else c["roiInfo"]
        out.append({"bodyId": c["bodyId"], "type": c["type"], "side": c["side"], "lo": footprint(info, "LO"), "lop": footprint(info, "LOP") if c["type"] == "LPLC2" else None})
    inc = {n["bodyId"] for n in circ["neurons"] if n["type"] == "LPLC2"}; want = set(inc)
    for side in ("R", "L"):
        lp = [c for c in out if c["type"] == "LPLC2" and c["side"] == side]; step = max(1, len(lp) // a.layer_per_side); want |= {c["bodyId"] for c in lp[::step][:a.layer_per_side]}
    by = {c["bodyId"]: c for c in out}
    for b in sorted(want):
        by[b]["layerOffsets"] = layer_offsets(b, by[b]["side"]); print("layer offsets", b, flush=True)
    pop = {}
    for side in ("R", "L"):
        for L in ("1", "2", "3", "4"):
            v = [c["layerOffsets"][L] for c in out if c.get("layerOffsets") and c["side"] == side and L in c["layerOffsets"]]
            if v: pop.setdefault(side, {})[L] = {"dx": round(float(np.mean([x["dx"] for x in v])), 3), "dy": round(float(np.mean([x["dy"] for x in v])), 3), "rms": round(float(np.median([x["rms"] for x in v])), 3), "cells": len(v)}
    doc = {"dataset": DATASET, "server": SERVER, "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "license": "CC-BY-4.0 as declared by the Neuprint server for this dataset (not independently re-confirmed)", "citation": "Janelia FlyEM male-cns connectome, via Neuprint (neuprint.janelia.org)",
           "units": "lattice units: the dataset's own LO/LOP column indices (x, y), NOT degrees; the lattice-to-visual-field calibration is not derived", "cells": out, "layerOffsetsMean": pop, "layerOffsetCells": len(want)}
    json.dump(doc, open(a.out, "w")); print("cells", len(out), "with layer offsets", len(want))
if __name__ == "__main__": main()
