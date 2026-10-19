#!/usr/bin/env python3
# WebGLEngine/tools/fetchFish1Circuit.py -- UNNUMBERED (the version is chosen at ship time)
#
# RUN THIS ON YOUR OWN MACHINE (it needs a Fish1 CAVE token and the network; the cloud sandbox has neither):
#     pip install caveclient pandas
#     python tools/fetchFish1Circuit.py --lore 111111,222222,... --out vendor/zebrafish/fish1-circuit.json [--partners 10]
#
# It reads the Fish1 whole-brain connectome (datastack fish1_full, via CAVE: the access pattern of ProgrammaticInteractionWithFish1Cave.ipynb) and writes ONE SMALL CIRCUIT in the shape of
# vendor/male-cns/giant-fiber-circuit.json, so the same baking tools can turn it into a topology:
#     { dataset, server, fetchedAt, license, citation, typePattern, neuronCount, edgeCount, neurons: [{ bodyId (the root id at the snapshot), lore, type ("exc"|"inh"|"na"), instance, xyz }], edges: [[pre, post, count]] }
# The circuit is the INDUCED subgraph of the seed neurons you name by LORE ID (the small stable soma id, which survives proofreading), plus, with --partners N, the N strongest synaptic partners of the seeds that
# have a soma annotation. An edge is the NUMBER OF SYNAPSES from one neuron to another in the materialisation snapshot; excitatory/inhibitory is the soma's `cell_type` (the synapse tag, 1 inhibitory / 2 excitatory,
# is counted too, as `eiTags`, so the two can be compared). Nothing is invented: a lore id with no soma row stops the run, and the file records the snapshot it came from.
#
# WHICH LORE IDS? The notebook looks neurons up by lore id or by a voxel coordinate (Neuroglancer), not by name. The Mauthner cells are the two giant reticulospinal somata in rhombomere 4 of the hindbrain: find them
# in Neuroglancer, click the soma, and read the lore id from the `somas` table. A root id printed in an example (the notebook's 864691128630286274) is an example of the FORMAT, not a verified Mauthner cell.
# `--selftest` runs the conversion against a fake client with invented numbers (no network) -- a test of this file, not data.
import argparse, json, sys, datetime

GLOBAL_URL = "https://global.brain-wire-test.org/"
DATASTACK = "fish1_full"
SYN_TABLE = "synapses_axde_label"


def build_circuit(client, lore_ids, partners=0, version=None):
    """The induced circuit of `lore_ids` (+ strongest soma-annotated partners). `client` is a CAVEclient (or anything with the same .materialize.tables surface)."""
    soma = {}
    for lid in lore_ids:
        rows = client.materialize.tables.somas(id=str(lid)).query()
        if len(rows) == 0:
            raise SystemExit(f"lore id {lid}: no soma row in the snapshot -- check the id")
        r = rows.iloc[0]
        soma[int(r["pt_root_id"])] = {"lore": str(lid), "type": r["cell_type"], "xyz": [int(v) for v in r["pt_position"]]}
    seeds = list(soma)
    counts, tags, seen = {}, {}, set()
    def take(df, direction):
        for _, s in df.iterrows():
            if "id" in s and s["id"] in seen:   # a synapse between two members is read from both ends; count it once (the synapse id is the key)
                continue
            if "id" in s:
                seen.add(s["id"])
            a, b = int(s["pre_pt_root_id"]), int(s["post_pt_root_id"])
            counts[(a, b)] = counts.get((a, b), 0) + 1
            tags.setdefault((a, b), {}).setdefault(str(s["tag"]), 0)
            tags[(a, b)][str(s["tag"])] += 1
    for rid in seeds:
        take(client.materialize.tables.synapses_axde_label(pre_pt_root_id=rid).query(), "out")
        take(client.materialize.tables.synapses_axde_label(post_pt_root_id=rid).query(), "in")
    if partners:
        strength = {}
        for (a, b), n in counts.items():
            for other, mine in ((a, b), (b, a)):
                if mine in soma and other not in soma:
                    strength[other] = strength.get(other, 0) + n
        for other, _ in sorted(strength.items(), key=lambda kv: -kv[1]):
            if len([k for k in soma if k not in seeds]) >= partners:
                break
            rows = client.materialize.tables.somas(pt_root_id=other).query()
            if len(rows):
                r = rows.iloc[0]
                soma[other] = {"lore": str(r["id"]), "type": r["cell_type"], "xyz": [int(v) for v in r["pt_position"]]}
        # edges among the final set, from the synapses already read plus the new members' own
        for rid in [k for k in soma if k not in seeds]:
            take(client.materialize.tables.synapses_axde_label(pre_pt_root_id=rid).query(), "out")
            take(client.materialize.tables.synapses_axde_label(post_pt_root_id=rid).query(), "in")
    members = set(soma)
    return soma, {k: v for k, v in counts.items() if k[0] in members and k[1] in members}, tags


def to_json(soma, edges, tags, version, server):
    order = list(soma)
    neurons = [{"bodyId": rid, "lore": soma[rid]["lore"], "type": soma[rid]["type"], "instance": f"fish1_lore{soma[rid]['lore']}", "xyz": soma[rid]["xyz"]} for rid in order]
    return {"dataset": f"{DATASTACK}:materialization v{version}", "server": server, "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "license": "SEE THE FISH1 DATA TERMS -- not asserted here",
            "citation": "Fish1 larval zebrafish connectome (Engert and Lichtman groups), via CAVE", "typePattern": "lore ids " + ",".join(soma[r]["lore"] for r in order[:12]) + ("..." if len(order) > 12 else ""),
            "neuronCount": len(neurons), "edgeCount": len(edges), "neurons": neurons,
            "edges": [[a, b, n] for (a, b), n in sorted(edges.items(), key=lambda kv: (-kv[1], kv[0]))], "eiTags": {f"{a}>{b}": t for (a, b), t in tags.items() if (a, b) in edges}}


def selftest():
    import pandas as pd
    class T:
        def __init__(s, f): s.f = f
        def query(s, **k): return s.f()
    class Tables:
        def somas(self, **kw):
            rows = {"1": (101, "exc"), "2": (102, "exc"), "3": (103, "inh")}
            if "id" in kw: i = kw["id"]; return T(lambda: pd.DataFrame([{"id": i, "pt_root_id": rows[i][0], "cell_type": rows[i][1], "pt_position": [i and 10, 20, 30]}] if i in rows else []))
            rid = kw["pt_root_id"]; m = {v[0]: (k, v[1]) for k, v in rows.items()}
            return T(lambda: pd.DataFrame([{"id": m[rid][0], "pt_root_id": rid, "cell_type": m[rid][1], "pt_position": [1, 2, 3]}] if rid in m else []))
        def synapses_axde_label(self, **kw):
            syn = [(1, 101, 102, "2"), (2, 101, 102, "2"), (3, 102, 103, "2"), (4, 103, 101, "1"), (5, 999, 101, "2")]
            def q():
                sel = [s for s in syn if ("pre_pt_root_id" in kw and s[1] == kw["pre_pt_root_id"]) or ("post_pt_root_id" in kw and s[2] == kw["post_pt_root_id"])]
                return pd.DataFrame([{"id": i, "pre_pt_root_id": a, "post_pt_root_id": b, "tag": t} for i, a, b, t in sel])
            return T(q)
    class C:
        class materialize: tables = Tables()
    soma, edges, tags = build_circuit(C, [1, 2, 3])
    assert edges == {(101, 102): 2, (102, 103): 1, (103, 101): 1}, edges   # two synapses 101>102 counted ONCE each though both ends are read; the synapse from the outside neuron 999 is not in the circuit
    assert tags[(103, 101)] == {"1": 1}
    out = to_json(soma, edges, tags, 1, "test")
    assert out["neuronCount"] == 3 and out["edgeCount"] == 3 and out["edges"][0] == [101, 102, 2]
    return soma, edges, tags


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--lore", help="comma-separated lore ids of the seed neurons")
    ap.add_argument("--out", help="output json")
    ap.add_argument("--partners", type=int, default=0)
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        s, e, t = selftest(); print(json.dumps({"soma": {str(k): v for k, v in s.items()}, "edges": {f"{k[0]}>{k[1]}": v for k, v in e.items()}}, indent=1)); sys.exit(0)
    if not a.lore or not a.out:
        ap.error("--lore and --out are required")
    from caveclient import CAVEclient
    client = CAVEclient(datastack_name=DATASTACK, server_address=GLOBAL_URL)
    client.materialize.version = client.materialize.most_recent_version()
    soma, edges, tags = build_circuit(client, [x.strip() for x in a.lore.split(",") if x.strip()], a.partners)
    out = to_json(soma, edges, tags, client.materialize.version, GLOBAL_URL)
    json.dump(out, open(a.out, "w"), indent=1)
    print(f"wrote {a.out}: {out['neuronCount']} neurons, {out['edgeCount']} edges (snapshot v{client.materialize.version})")
