#!/usr/bin/env python3
# WebGLEngine/tools/maleCnsVisualCircuit.py -- UNNUMBERED, NOT GATED (no selfcheck yet)
# The fly's looming path into the Giant Fibers, from male-cns:v1.0 on Neuprint, as a circuit file in the shape of vendor/male-cns/giant-fiber-circuit.json (without skeletons unless --skeletons).
# Cells: the two Giant Fibers (DNp01(GF)_R / _L, found by type DNp01 and an instance that names GF) plus, for EACH Giant Fiber, the N strongest presynaptic LC4 cells and the N strongest presynaptic LPLC2 cells (by synapses onto that Giant Fiber; N = --per-side-type, default 10), and every
# ConnectsTo edge among those cells (weight = the server's synapse count). Each neuron carries its type, instance, side, the server's neurotransmitter prediction (predictedNt, celltypePredictedNt), its synapses onto its Giant Fiber, and the superclass.
# READ-ONLY. NO TOKEN IS READ, TYPED OR WRITTEN HERE: the session's network proxy supplies the credential for neuprint.janelia.org (run on your own machine, set a token the way the Neuprint client does: this script has no option for one on purpose).
# Run: python3 tools/maleCnsVisualCircuit.py [--per-side-type 10] [--skeletons] --out vendor/male-cns/giant-fiber-visual-circuit.json
import argparse, datetime, json, sys, time
import requests
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
def skeleton(body):
    r = requests.get("%s/api/skeletons/skeleton/%s/%d?format=swc" % (SERVER, DATASET, body), timeout=180); r.raise_for_status()
    pts = [l.split() for l in r.text.splitlines() if l.strip() and not l.startswith("#")]
    idx = {int(p[0]): i for i, p in enumerate(pts)}
    return {"pointCount": len(pts), "xyz": [float(v) for p in pts for v in p[2:5]], "radius": [float(p[5]) for p in pts], "kind": [int(p[1]) for p in pts], "parent": [idx.get(int(p[6]), -1) if int(p[6]) > 0 else -1 for p in pts]}
def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--per-side-type", type=int, default=10); ap.add_argument("--skeletons", action="store_true"); ap.add_argument("--out", required=True); a = ap.parse_args()
    gf = cypher("MATCH (n:Neuron) WHERE n.type = 'DNp01' AND n.instance CONTAINS 'GF' RETURN n.bodyId AS bodyId, n.instance AS instance, n.somaSide AS side, n.pre AS pre, n.post AS post, n.superclass AS superclass, n.predictedNt AS nt, n.celltypePredictedNt AS ctnt ORDER BY bodyId")
    if len(gf) != 2: raise SystemExit("expected two Giant Fibers (DNp01 with GF in the instance), found %d" % len(gf))
    gids = [g["bodyId"] for g in gf]
    ins = cypher("MATCH (a:Neuron)-[c:ConnectsTo]->(b:Neuron) WHERE b.bodyId IN %s AND a.type IN ['LC4','LPLC2'] RETURN a.bodyId AS bodyId, a.type AS type, a.instance AS instance, a.somaSide AS side, a.pre AS pre, a.post AS post, a.superclass AS superclass, a.predictedNt AS nt, a.celltypePredictedNt AS ctnt, b.bodyId AS gf, c.weight AS w" % gids)
    chosen = {}
    for g in gids:
        for t in ("LC4", "LPLC2"):
            rows = sorted([r for r in ins if r["gf"] == g and r["type"] == t], key=lambda r: (-r["w"], r["bodyId"]))[:a.per_side_type]
            for r in rows: chosen.setdefault(r["bodyId"], {**r, "synOntoGF": r["w"], "gf": g})
    cells = [{**g, "type": "DNp01", "role": "giant-fiber"} for g in gf] + list(chosen.values())
    ids = [c["bodyId"] for c in cells]
    edges = cypher("MATCH (a:Neuron)-[c:ConnectsTo]->(b:Neuron) WHERE a.bodyId IN %s AND b.bodyId IN %s RETURN a.bodyId AS pre, b.bodyId AS post, c.weight AS w ORDER BY pre, post" % (ids, ids))
    neurons = []
    for c in cells:
        n = {"bodyId": c["bodyId"], "type": c["type"], "instance": c["instance"], "pre": c["pre"], "post": c["post"], "side": c["side"], "superclass": c["superclass"], "predictedNt": c["nt"], "celltypePredictedNt": c["ctnt"]}
        if c.get("role") == "giant-fiber": n["role"] = "giant-fiber"
        else: n["synOntoGF"] = c["synOntoGF"]; n["gfBodyId"] = c["gf"]
        if a.skeletons: n.update(skeleton(c["bodyId"]))
        neurons.append(n)
    out = {"dataset": DATASET, "server": SERVER, "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "license": "CC-BY-4.0 as declared by the Neuprint server for this dataset (not independently re-confirmed)", "citation": "Janelia FlyEM male-cns connectome, via Neuprint (neuprint.janelia.org)",
           "typePattern": "the two Giant Fibers (DNp01(GF)) and, for each, its %d strongest presynaptic LC4 and %d strongest presynaptic LPLC2 cells (by synapses onto it)" % (a.per_side_type, a.per_side_type), "selection": {"perSideType": a.per_side_type, "rule": "strongest by synapse count onto that Giant Fiber, bodyId ascending on a tie"},
           "neuronCount": len(neurons), "edgeCount": len(edges), "neurons": neurons, "edges": [[e["pre"], e["post"], e["w"]] for e in edges]}
    json.dump(out, open(a.out, "w")); print("neurons", len(neurons), "edges", len(edges), "synapses", sum(e["w"] for e in edges), "skeletons", a.skeletons)
if __name__ == "__main__": main()
