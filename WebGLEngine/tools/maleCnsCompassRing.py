#!/usr/bin/env python3
# WebGLEngine/tools/maleCnsCompassRing.py -- UNNUMBERED (the version is chosen at ship time)
#
# THE RING NEURONS AND THEIR CONNECTIONS ONTO THE COMPASS NEURONS, BAKED FROM THE PUBLIC MALE-CNS RELEASE TABLES (backlog `fly-compass-learns`; Keith, 2026-11-17: "Let's continue and do
# (fly-compass-learns)"). The ring neurons (ER types) carry what the fly sees into the ellipsoid body; their connections onto the compass (E-PG) neurons are where, in the animal, the visual
# scene is tied to the heading. Reads the same two Apache Feather tables as tools/maleCnsMushroomBody.py (gs://flyem-male-cns, no token):
#   v1.0/connectome-data/flat-connectome/body-annotations-male-cns-v1.0-minconf-0.5.feather
#   v1.0/connectome-data/flat-connectome/connectome-weights-male-cns-v1.0-minconf-0.5-traced-only.feather
# and writes vendor/male-cns/ring-compass-circuit.json:
#   CELLS     every body whose type is a ring neuron's (ER and a digit) and every EPG and EPGt body; sorted by group (RING, EPG), then type, then bodyId
#   EDGES     [ring index, compass index, synapses] for every connection FROM a ring neuron ONTO a compass neuron of at least MIN_SYNAPSES synapses, sorted by pre then post
#   TOTALS    the ring-to-compass connections and synapses AT EVERY WEIGHT and those KEPT
#   SOURCES   each table's name, size in bytes and sha256
# Topology only, and only this one direction: the compass neurons' other connections are in vendor/male-cns/epg-compass-circuit.json. No token, no network.
# Run:  python3 -I tools/maleCnsCompassRing.py ANNOTATIONS.feather WEIGHTS.feather vendor/male-cns/ring-compass-circuit.json
import hashlib, json, os, re, sys

MIN_SYNAPSES = 5
GROUPS = ["RING", "EPG"]
DATASET = "male-cns:v1.0"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def group_of(typ):
    if re.match(r"^ER\d", typ):
        return "RING"
    if typ in ("EPG", "EPGt"):
        return "EPG"
    return None


def main(ann_path, w_path, out_path):
    import pandas as pd
    import pyarrow.feather as pf
    a = pd.read_feather(ann_path)
    a["group"] = [group_of(t) for t in a["type"].fillna("")]
    c = a[a["group"].notna()].copy()
    c["order"] = c["group"].map({g: i for i, g in enumerate(GROUPS)})
    c = c.sort_values(["order", "type", "bodyId"], kind="mergesort").reset_index(drop=True)
    index = {int(b): i for i, b in enumerate(c["bodyId"])}
    ring = {int(b) for b, g in zip(c["bodyId"], c["group"]) if g == "RING"}
    epg = {int(b) for b, g in zip(c["bodyId"], c["group"]) if g == "EPG"}
    w = pf.read_table(w_path, columns=["body_pre", "body_post", "weight"]).to_pandas()
    s = w[w.body_pre.isin(ring) & w.body_post.isin(epg)]
    s = s.assign(pre=s.body_pre.map(index).astype(int), post=s.body_post.map(index).astype(int))
    kept = s[s.weight >= MIN_SYNAPSES].sort_values(["pre", "post"], kind="mergesort")
    cells = [{"bodyId": int(r.bodyId), "group": r.group, "type": str(r.type), "instance": None if pd.isna(r.instance) else str(r.instance), "side": None if pd.isna(r.somaSide) else str(r.somaSide)} for r in c.itertuples()]
    out = {
        "format": "swek-connectome-topology-v1",
        "circuit": "ring neurons onto compass neurons",
        "dataset": DATASET,
        "source": "Janelia FlyEM male-cns v1.0 public release tables, gs://flyem-male-cns/v1.0/connectome-data/flat-connectome/",
        "minSynapses": MIN_SYNAPSES,
        "groups": GROUPS,
        "sources": [{"name": os.path.basename(p), "bytes": os.path.getsize(p), "sha256": sha256(p)} for p in (ann_path, w_path)],
        "cells": cells,
        "edges": [[int(p), int(q), int(n)] for p, q, n in zip(kept.pre, kept.post, kept.weight)],
        "totals": {"RING>EPG": {"connections": int(len(s)), "synapses": int(s.weight.sum()), "keptConnections": int(len(kept)), "keptSynapses": int(kept.weight.sum())}},
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")
    print(f"{len(cells)} cells, {len(out['edges'])} ring-to-compass connections of at least {MIN_SYNAPSES} synapses (of {len(s)} at any weight) -> {out_path}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("usage: python3 -I tools/maleCnsCompassRing.py ANNOTATIONS.feather WEIGHTS.feather OUT.json")
    main(*sys.argv[1:])
