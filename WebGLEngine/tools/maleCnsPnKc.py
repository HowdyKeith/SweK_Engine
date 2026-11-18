#!/usr/bin/env python3
# WebGLEngine/tools/maleCnsPnKc.py -- UNNUMBERED (the version is chosen at ship time)
#
# THE PROJECTION NEURONS ONTO THE KENYON CELLS, BAKED FROM THE PUBLIC MALE-CNS RELEASE TABLES (Keith, 2026-11-18: "Let's do all 5" -- the fifth, realistic odours for the mushroom body).
# Reads the same two Apache Feather tables of Janelia FlyEM's male-cns v1.0 release as tools/maleCnsMushroomBody.py (public bucket gs://flyem-male-cns, no token):
#   v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather
#   v1.0/connectome-data/flat-connectome/connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather
# and writes vendor/male-cns/pn-kc-circuit.json:
#   CELLS     every body whose class is ALPN (antennal-lobe projection neurons; group PN) and every body whose class is Kenyon_Cell (group KC); sorted by group (PN, KC), then type, then
#             bodyId -- the KCs in exactly the order vendor/male-cns/mushroom-body-circuit.json has them. A PN's glomerulus is its type before the first "_" ("DA1_lPN" -> "DA1"), or null
#             for a multiglomerular type (one starting "M_")
#   EDGES     [PN index, KC index, synapses] for every PN-to-KC connection of at least MIN_SYNAPSES synapses, sorted by PN then KC (one direction only)
#   TOTALS    PN>KC at every weight and as kept
#   SOURCES   each table's name, size in bytes and sha256
# No skeletons and no coordinates: topology only. No token, no network: the tables are downloaded beforehand (see vendor/male-cns/PROVENANCE.md).
# Run:  python3 -I tools/maleCnsPnKc.py ANNOTATIONS.feather WEIGHTS.feather vendor/male-cns/pn-kc-circuit.json
import hashlib, json, os, sys

MIN_SYNAPSES = 5
GROUPS = ["PN", "KC"]
DATASET = "male-cns:v1.0"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def group_of(cls):
    return "PN" if cls == "ALPN" else "KC" if cls == "Kenyon_Cell" else None


def glomerulus_of(group, typ):
    if group != "PN" or typ.startswith("M_") or "_" not in typ:
        return None
    return typ.split("_")[0]


def main(ann_path, w_path, out_path):
    import pandas as pd
    import pyarrow.feather as pf
    a = pd.read_feather(ann_path)
    a["group"] = [group_of(c) for c in a["class"].fillna("")]
    cells = a[a["group"].notna()].copy()
    cells["order"] = cells["group"].map({g: i for i, g in enumerate(GROUPS)})
    cells["type"] = cells["type"].fillna("")
    cells = cells.sort_values(["order", "type", "bodyId"], kind="mergesort").reset_index(drop=True)
    index = {int(b): i for i, b in enumerate(cells["bodyId"])}
    pns = {int(b) for b, g in zip(cells["bodyId"], cells["group"]) if g == "PN"}
    kcs = {int(b) for b, g in zip(cells["bodyId"], cells["group"]) if g == "KC"}
    w = pf.read_table(w_path, columns=["body_pre", "body_post", "weight"]).to_pandas()
    s = w[w.body_pre.isin(pns) & w.body_post.isin(kcs)]
    s = s.assign(pre=s.body_pre.map(index).astype(int), post=s.body_post.map(index).astype(int))
    kept = s[s.weight >= MIN_SYNAPSES].sort_values(["pre", "post"], kind="mergesort")
    out = {
        "format": "swek-connectome-topology-v1",
        "circuit": "projection neurons onto Kenyon cells",
        "dataset": DATASET,
        "source": "Janelia FlyEM male-cns v1.0 public release tables, gs://flyem-male-cns/v1.0/connectome-data/flat-connectome/",
        "minSynapses": MIN_SYNAPSES,
        "groups": GROUPS,
        "sources": [{"name": os.path.basename(p), "bytes": os.path.getsize(p), "sha256": sha256(p)} for p in (ann_path, w_path)],
        "cells": [{"bodyId": int(r.bodyId), "group": r.group, "type": str(r.type), "glomerulus": glomerulus_of(r.group, str(r.type)), "side": None if pd.isna(r.somaSide) else str(r.somaSide)} for r in cells.itertuples()],
        "edges": [[int(p), int(q), int(n)] for p, q, n in zip(kept.pre, kept.post, kept.weight)],
        "totals": {"PN>KC": {"connections": int(len(s)), "synapses": int(s.weight.sum()), "keptConnections": int(len(kept)), "keptSynapses": int(kept.weight.sum())}},
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")
    print(f"{len(out['cells'])} cells ({len(pns)} PN, {len(kcs)} KC), {len(out['edges'])} PN-to-KC connections of at least {MIN_SYNAPSES} synapses (of {len(s)} at any weight) -> {out_path}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("usage: python3 -I tools/maleCnsPnKc.py ANNOTATIONS.feather WEIGHTS.feather OUT.json")
    main(*sys.argv[1:])
