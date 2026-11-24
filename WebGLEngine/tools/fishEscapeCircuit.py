#!/usr/bin/env python3
# WebGLEngine/tools/fishEscapeCircuit.py -- UNNUMBERED, NOT GATED (no selfcheck yet)
# Builds vendor/zebrafish/fish1-escape-top30.json: the two Mauthner CANDIDATES (found by soma position, see brain/FISH_VISUAL_INPUTS_WIP.md) plus the 30 soma-bearing cells with the most synapses onto them,
# with every synapse among those 32 cells at ONE materialization version, signed from synapses_axde_label (looked up by target_id; the root-id filter on the label table is a server 500).
# Needs caveclient and a CAVE token that the PROXY or caveclient supplies; it never reads or prints a token (CAVE_TOKEN=any placeholder only lets the client start). Read-only.
# Run: CAVE_TOKEN=placeholder python3 tools/fishEscapeCircuit.py --version 759 --somas somas.csv --out vendor/zebrafish/fish1-escape-top30.json
# Root ids are 18 digits (> 2^53): they are STRINGS in the file; a JSON.parse of a bare number would round them.
import argparse, datetime, json, re, sys, time
import numpy as np, pandas as pd
from caveclient import CAVEclient
CANDIDATES = {"864691128610327387": "A", "864691128634739649": "B"}
def retry(f, n=6):
    for i in range(n):
        try: return f()
        except Exception as e:
            if i == n - 1: raise
            time.sleep(15)
def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--version", type=int, required=True); ap.add_argument("--somas", required=True); ap.add_argument("--out", required=True); ap.add_argument("--top", type=int, default=30)
    a = ap.parse_args()
    c = CAVEclient("fish1_full", server_address="https://global.brain-wire-test.org"); V = a.version
    ids = [int(k) for k in CANDIDATES]
    inn = retry(lambda: c.materialize.query_table("synapses_axde", filter_in_dict={"post_pt_root_id": ids}, materialization_version=V, select_columns=["id", "pre_pt_root_id", "post_pt_root_id"]))
    s = pd.read_csv(a.somas); s = s[s.pt_root_id != 0].drop_duplicates("pt_root_id").set_index("pt_root_id")
    inn = inn[inn.pre_pt_root_id.isin(s.index) & ~inn.pre_pt_root_id.isin(ids)]
    top = inn.groupby("pre_pt_root_id").size().sort_values(ascending=False, kind="stable").head(a.top)
    cells = ids + [int(r) for r in top.index]
    syn = retry(lambda: c.materialize.query_table("synapses_axde", filter_in_dict={"post_pt_root_id": cells}, materialization_version=V, select_columns=["id", "pre_pt_root_id", "post_pt_root_id"]))
    syn = syn[syn.pre_pt_root_id.isin(cells) & (syn.pre_pt_root_id != syn.post_pt_root_id)]
    tg = syn.id.tolist(); lab = []
    for i in range(0, len(tg), 2000): lab.append(retry(lambda: c.materialize.query_table("synapses_axde_label", filter_in_dict={"target_id": tg[i:i + 2000]}, materialization_version=V, select_columns=["target_id", "tag"])))
    lab = pd.concat(lab).drop_duplicates("target_id").set_index("target_id").tag
    syn = syn.assign(tag=syn.id.map(lab.astype(str).where(lab.notna())))   # the tag column is text ("1"/"2") on this server
    edges, signs = [], []
    for (p, q), g in syn.groupby(["pre_pt_root_id", "post_pt_root_id"]):
        edges.append([str(p), str(q), int(len(g))]); signs.append([str(p), str(q), int((g.tag == "2").sum()), int((g.tag == "1").sum()), int(g.tag.isna().sum())])
    nA = inn[inn.post_pt_root_id == ids[0]].groupby("pre_pt_root_id").size(); nB = inn[inn.post_pt_root_id == ids[1]].groupby("pre_pt_root_id").size()
    neurons = []
    for r in cells:
        row = s.loc[r]; xyz = [float(v) for v in re.findall(r"[-\d.]+", row.pt_position)]
        n = {"bodyId": str(r), "type": "Mauthner-candidate" if str(r) in CANDIDATES else "soma-partner", "instance": "fish1:%d" % r, "somaUm": [round(xyz[0] * .008, 1), round(xyz[1] * .008, 1), round(xyz[2] * .03, 1)], "somaCellType": str(row.cell_type)}
        if str(r) in CANDIDATES: n["label"] = "candidate " + CANDIDATES[str(r)]
        else: n["synOntoA"] = int(nA.get(r, 0)); n["synOntoB"] = int(nB.get(r, 0))
        neurons.append(n)
    ver = c.materialize.get_version_metadata(V)
    out = {"dataset": "fish1_full:v%d (segmentation fish1_v250915)" % V, "server": "https://global.brain-wire-test.org", "materializationTimestamp": str(ver["time_stamp"]), "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "license": "open access under the Fish1 data policy; the CAVE account is a separate agreement; do not post publicly", "citation": "Petkova, M. D., Januszewski, M., et al. (2025). A connectomic resource for neural cataloguing and circuit dissection of the larval zebrafish brain. bioRxiv. (Fish1 release)",
           "typePattern": "2 Mauthner CANDIDATES (identified by soma position and input count only; NOT confirmed) + the %d soma-bearing cells with the most synapses onto them" % a.top,
           "idsAreStrings": True, "signs": "edgeSigns rows are [pre, post, excitatory, inhibitory, untagged] from synapses_axde_label (tag 2 = excitatory, 1 = inhibitory)",
           "neuronCount": len(neurons), "edgeCount": len(edges), "neurons": neurons, "edges": edges, "edgeSigns": signs}
    json.dump(out, open(a.out, "w"), indent=1); print("neurons", len(neurons), "edges", len(edges), "synapses", int(syn.shape[0]))
if __name__ == "__main__": main()
