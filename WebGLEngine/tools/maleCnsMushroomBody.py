#!/usr/bin/env python3
# WebGLEngine/tools/maleCnsMushroomBody.py -- UNNUMBERED (the version is chosen at ship time)
#
# THE MUSHROOM BODY, BAKED FROM THE PUBLIC MALE-CNS RELEASE TABLES (backlog `fly-mushroom-body-data`; Keith, 2026-11-17: "Let's pull in The mushroom body").
# Reads two Apache Feather tables of Janelia FlyEM's male-cns v1.0 release, published WITHOUT a token in the public bucket gs://flyem-male-cns:
#   v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather              (who each body is: class, type, side)
#   v1.0/connectome-data/flat-connectome/connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather  (body-to-body synapse counts, traced bodies)
# and writes vendor/male-cns/mushroom-body-circuit.json:
#   CELLS     every body whose class is Kenyon_Cell, MBON or DAN, and the APL and DPM neurons (types "APL", "DPM"); sorted by group (KC, MBON, DAN, APL, DPM), then type, then bodyId
#   EDGES     [pre index, post index, synapses] for every connection between two of those cells of at least MIN_SYNAPSES synapses, sorted by pre then post
#   TOTALS    for every pair of groups, the connections and synapses AT EVERY WEIGHT and those KEPT -- so what the threshold drops is in the file, not only in prose
#   SOURCES   each table's name, size in bytes and sha256, so the bake can be checked against the very files it read
# No skeletons and no coordinates: topology only. No token, no network: the tables are downloaded beforehand (see vendor/male-cns/PROVENANCE.md).
# Run:  python3 -I tools/maleCnsMushroomBody.py ANNOTATIONS.feather WEIGHTS.feather vendor/male-cns/mushroom-body-circuit.json
import hashlib, json, os, sys

MIN_SYNAPSES = 5
GROUPS = ["KC", "MBON", "DAN", "APL", "DPM"]
DATASET = "male-cns:v1.0"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def group_of(cls, typ):
    if cls == "Kenyon_Cell":
        return "KC"
    if cls in ("MBON", "DAN"):
        return cls
    if typ in ("APL", "DPM"):
        return typ
    return None


def main(ann_path, w_path, out_path):
    import pandas as pd
    import pyarrow.feather as pf
    a = pd.read_feather(ann_path)
    a["group"] = [group_of(c, t) for c, t in zip(a["class"].fillna(""), a["type"].fillna(""))]
    mb = a[a["group"].notna()].copy()
    mb["order"] = mb["group"].map({g: i for i, g in enumerate(GROUPS)})
    mb = mb.sort_values(["order", "type", "bodyId"], kind="mergesort").reset_index(drop=True)
    index = {int(b): i for i, b in enumerate(mb["bodyId"])}
    w = pf.read_table(w_path, columns=["body_pre", "body_post", "weight"]).to_pandas()
    s = w[w.body_pre.isin(index.keys()) & w.body_post.isin(index.keys())]
    pre = s.body_pre.map(index).astype(int)
    post = s.body_post.map(index).astype(int)
    s = s.assign(pre=pre, post=post, gp=pre.map(dict(enumerate(mb["group"]))), gq=post.map(dict(enumerate(mb["group"]))))
    kept = s[s.weight >= MIN_SYNAPSES].sort_values(["pre", "post"], kind="mergesort")
    totals = {}
    for (gp, gq), part in s.groupby(["gp", "gq"]):
        k = part[part.weight >= MIN_SYNAPSES]
        totals[f"{gp}>{gq}"] = {"connections": int(len(part)), "synapses": int(part.weight.sum()), "keptConnections": int(len(k)), "keptSynapses": int(k.weight.sum())}
    cells = [{"bodyId": int(r.bodyId), "group": r.group, "type": str(r.type), "instance": None if pd.isna(r.instance) else str(r.instance), "side": None if pd.isna(r.somaSide) else str(r.somaSide)} for r in mb.itertuples()]
    out = {
        "format": "swek-connectome-topology-v1",
        "circuit": "mushroom body",
        "dataset": DATASET,
        "source": "Janelia FlyEM male-cns v1.0 public release tables, gs://flyem-male-cns/v1.0/connectome-data/flat-connectome/",
        "minSynapses": MIN_SYNAPSES,
        "groups": GROUPS,
        "sources": [{"name": os.path.basename(p), "bytes": os.path.getsize(p), "sha256": sha256(p)} for p in (ann_path, w_path)],
        "cells": cells,
        "edges": [[int(p), int(q), int(n)] for p, q, n in zip(kept.pre, kept.post, kept.weight)],
        "totals": dict(sorted(totals.items())),
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")
    print(f"{len(cells)} cells, {len(out['edges'])} connections of at least {MIN_SYNAPSES} synapses (of {len(s)} at any weight) -> {out_path}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("usage: python3 -I tools/maleCnsMushroomBody.py ANNOTATIONS.feather WEIGHTS.feather OUT.json")
    main(*sys.argv[1:])
