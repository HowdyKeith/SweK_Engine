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
import argparse, json, sys, datetime, os

GLOBAL_URL = "https://global.brain-wire-test.org/"
DATASTACK = "fish1_full"
SYN_TABLE = "synapses_axde_label"


SYN_BASE = "synapses_axde"   # the synapses themselves; SYN_TABLE is a reference_tag layer over it (target_id -> synapses_axde.id; tag 1 inhibitory, 2 excitatory) and the server answers a root-id filter on it with a 500


def synapses_of(client, **filt):
    """Synapses of one root id (pre_pt_root_id=... or post_pt_root_id=...) from the BASE table, each carrying the tag the label table gives it ("none" if untagged). The filter is refused on the label table itself (HTTP 500 KeyError 'pre_pt_root_id', measured at v733)."""
    df = getattr(client.materialize.tables, SYN_BASE)(**filt).query()
    if len(df) == 0:
        return df.assign(tag=[]) if hasattr(df, "assign") else df
    ids = [int(v) for v in df["id"]]
    tag = {}
    for i in range(0, len(ids), 1000):
        lab = getattr(client.materialize.tables, SYN_TABLE)(target_id=ids[i:i + 1000]).query()
        for _, r in lab.iterrows():
            tag[int(r["target_id"])] = str(r["tag"])
    return df.assign(tag=[tag.get(int(v), "none") for v in df["id"]])


def build_circuit(client, lore_ids, partners=0, version=None):
    """The induced circuit of `lore_ids` (+ strongest soma-annotated partners). `client` is a CAVEclient (or anything with the same .materialize.tables surface)."""
    bad = [str(l) for l in lore_ids if not str(l).strip().isdigit()]
    if bad:
        raise SystemExit(f"lore ids are whole numbers (the small stable soma id); not: {', '.join(bad)}. Find them with --list-somas / --near.")
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
        take(synapses_of(client, pre_pt_root_id=rid), "out")
        take(synapses_of(client, post_pt_root_id=rid), "in")
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
            take(synapses_of(client, pre_pt_root_id=rid), "out")
            take(synapses_of(client, post_pt_root_id=rid), "in")
    members = set(soma)
    return soma, {k: v for k, v in counts.items() if k[0] in members and k[1] in members}, tags


NM = (16.0, 16.0, 30.0)   # nm per voxel of the somas table's pt_position (the notebook: "voxel coords at 16 x 16 x 30 nm")


def list_somas(client, near=None, radius_nm=None, limit=None):
    """Every soma (lore id, cell type, position) -- or, with `near` = (x, y, z) in the table's own voxel units and `radius_nm`, those within that distance, nearest first. Returns a list of dicts."""
    df = client.materialize.tables.somas().query()
    rows = []
    for _, r in df.iterrows():
        x, y, z = (int(v) for v in r["pt_position"])
        d = None
        if near is not None:
            d = (((x - near[0]) * NM[0]) ** 2 + ((y - near[1]) * NM[1]) ** 2 + ((z - near[2]) * NM[2]) ** 2) ** 0.5
            if radius_nm is not None and d > radius_nm:
                continue
        rows.append({"lore": str(r["id"]), "cell_type": r["cell_type"], "x": x, "y": y, "z": z, "root_id": int(r["pt_root_id"]), "distance_nm": None if d is None else round(d)})
    if near is not None:
        rows.sort(key=lambda t: t["distance_nm"])
    return rows[:limit] if limit else rows


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
            if not kw: return T(lambda: pd.DataFrame([{"id": k, "pt_root_id": v[0], "cell_type": v[1], "pt_position": [int(k) * 1000, 0, 0]} for k, v in rows.items()]))
            if "id" in kw: i = kw["id"]; return T(lambda: pd.DataFrame([{"id": i, "pt_root_id": rows[i][0], "cell_type": rows[i][1], "pt_position": [i and 10, 20, 30]}] if i in rows else []))
            rid = kw["pt_root_id"]; m = {v[0]: (k, v[1]) for k, v in rows.items()}
            return T(lambda: pd.DataFrame([{"id": m[rid][0], "pt_root_id": rid, "cell_type": m[rid][1], "pt_position": [1, 2, 3]}] if rid in m else []))
        syn = [(1, 101, 102, "2"), (2, 101, 102, "2"), (3, 102, 103, "2"), (4, 103, 101, "1"), (5, 999, 101, "2")]
        def synapses_axde(self, **kw):   # the BASE table: the root-id filter works here and rows carry no tag
            def q():
                sel = [s for s in self.syn if ("pre_pt_root_id" in kw and s[1] == kw["pre_pt_root_id"]) or ("post_pt_root_id" in kw and s[2] == kw["post_pt_root_id"])]
                return pd.DataFrame([{"id": i, "pre_pt_root_id": a, "post_pt_root_id": b} for i, a, b, t in sel], columns=["id", "pre_pt_root_id", "post_pt_root_id"])
            return T(q)
        def synapses_axde_label(self, **kw):   # the tag layer: only target_id is filterable (a root-id filter on it is a server 500, as measured)
            if set(kw) != {"target_id"}: raise RuntimeError("HTTP 500 'pre_pt_root_id' -- the label table cannot be filtered by root id")
            return T(lambda: pd.DataFrame([{"target_id": i, "tag": t} for i, a, b, t in self.syn if i in kw["target_id"]], columns=["target_id", "tag"]))
    class C:
        class materialize: tables = Tables()
    soma, edges, tags = build_circuit(C, [1, 2, 3])
    assert edges == {(101, 102): 2, (102, 103): 1, (103, 101): 1}, edges   # two synapses 101>102 counted ONCE each though both ends are read; the synapse from the outside neuron 999 is not in the circuit
    assert tags[(103, 101)] == {"1": 1}
    near = list_somas(C, (2000, 0, 0), 20000)   # 16 nm/voxel: lore 2 sits at x=2000 (distance 0), lore 1 at 1000 voxels = 16000 nm, lore 3 at 3000 = 16000 nm; all inside 20000 nm
    assert [r["lore"] for r in near][0] == "2" and {r["lore"] for r in near} == {"1", "2", "3"} and near[0]["distance_nm"] == 0, near
    assert [r["lore"] for r in list_somas(C, (2000, 0, 0), 10000)] == ["2"]   # the radius excludes the others
    assert len(list_somas(C)) == 3
    try:
        build_circuit(C, ["ID1"]); raise AssertionError("a non-numeric lore id must stop the run")
    except SystemExit as e:
        assert "whole numbers" in str(e)
    out = to_json(soma, edges, tags, 1, "test")
    assert out["neuronCount"] == 3 and out["edgeCount"] == 3 and out["edges"][0] == [101, 102, 2]
    return soma, edges, tags


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--lore", help="comma-separated lore ids of the seed neurons")
    ap.add_argument("--out", help="output json")
    ap.add_argument("--partners", type=int, default=0)
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--list-somas", metavar="CSV", help="write every soma (lore id, type, position) to this CSV and stop; with --near x,y,z the nearest first")
    ap.add_argument("--near", help="x,y,z in the somas table's voxel units (16x16x30 nm): only somas within --radius-nm of this point")
    ap.add_argument("--radius-nm", type=float, default=20000.0, help="with --near: radius in nm (default 20000 = 20 micrometres)")
    a = ap.parse_args()
    if a.selftest:
        s, e, t = selftest(); print(json.dumps({"soma": {str(k): v for k, v in s.items()}, "edges": {f"{k[0]}>{k[1]}": v for k, v in e.items()}}, indent=1)); sys.exit(0)
    if not a.list_somas and (not a.lore or not a.out):
        ap.error("--lore and --out are required (or --list-somas CSV to find lore ids)")
    from caveclient import CAVEclient
    client = CAVEclient(datastack_name=DATASTACK, server_address=GLOBAL_URL)
    client.materialize.version = client.materialize.most_recent_version()
    if a.list_somas:
        import csv
        near = tuple(float(v) for v in a.near.split(",")) if a.near else None
        rows = list_somas(client, near, a.radius_nm if near else None)
        os.makedirs(os.path.dirname(os.path.abspath(a.list_somas)), exist_ok=True)
        with open(a.list_somas, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["lore", "cell_type", "x", "y", "z", "root_id", "distance_nm"]); w.writeheader(); w.writerows(rows)
        print(f"wrote {os.path.abspath(a.list_somas)}: {len(rows)} somas (snapshot v{client.materialize.version})"); sys.exit(0)
    soma, edges, tags = build_circuit(client, [x.strip() for x in a.lore.split(",") if x.strip()], a.partners)
    out = to_json(soma, edges, tags, client.materialize.version, GLOBAL_URL)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)   # vendor/zebrafish/ does not exist in a fresh clone
    json.dump(out, open(a.out, "w"), indent=1)
    print(f"wrote {os.path.abspath(a.out)}: {out['neuronCount']} neurons, {out['edgeCount']} edges (snapshot v{client.materialize.version})")
