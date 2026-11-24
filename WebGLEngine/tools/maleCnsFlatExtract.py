#!/usr/bin/env python3
# WebGLEngine/tools/maleCnsFlatExtract.py -- UNNUMBERED (the version is chosen at ship time)
#
# A CIRCUIT OUT OF THE MALE-CNS RELEASE BUCKET, WITH NO TOKEN. vendor/male-cns/ has held two circuits fetched from Neuprint by the maintainer with a personal token, because the sandbox cannot reach neuprint.janelia.org. The same dataset is also published as flat files in a public bucket that the sandbox CAN reach
# (https://storage.googleapis.com/flyem-male-cns/, listed 2026-11-15): v1.0/connectome-data/flat-connectome/ holds the neurons' annotations and the neuron-to-neuron weights as Apache Arrow Feather files. This reads those two files and writes the neurons of the cell types asked for and every connection AMONG them, in the
# shape vendor/male-cns/*.json already has (without the skeletons: the flat connectome has none), so tools/bakeConnectomeTopology.mjs bakes it as it bakes the others.
#
#   python3 tools/maleCnsFlatExtract.py --annotations <body-annotations-...feather> --weights <connectome-weights-...feather> --types PFL2,PFL3,DNa02,DNa03 --name "..." --out vendor/male-cns/<file>.json
#   ... --neurotransmitters <body-neurotransmitters-...feather>     # also write each neuron's PREDICTED transmitter (`nt`, the release's consensus_nt) and the cell type's confidence (`ntConfidence`)
#   ... --check vendor/male-cns/giant-fiber-circuit.json     # instead of --out: extract the types that file holds and say whether the neurons and the edges are the same (the cross-check against the Neuprint fetch)
#
# Needs pyarrow (pip install pyarrow). It reads the weights a record batch at a time (the file is 25 million rows), keeps only rows whose two ends are both in the set, and holds nothing else. The neurons come out sorted by type (in the order given) and then by bodyId; the edges sorted by (from, to).
# WHAT IT DOES NOT DO: download anything (the two files are fetched by hand: their URLs and sha256 go in vendor/male-cns/PROVENANCE.md), choose a circuit (the types are the caller's), or judge the licence (PROVENANCE.md says what is known).
import argparse, hashlib, json, sys, datetime

def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--annotations", required=True); ap.add_argument("--weights", required=True)
    ap.add_argument("--types"); ap.add_argument("--name", default=""); ap.add_argument("--out"); ap.add_argument("--check"); ap.add_argument("--neurotransmitters")
    a = ap.parse_args()
    import pyarrow as pa, pyarrow.compute as pc, pyarrow.feather as pf
    ref = json.load(open(a.check)) if a.check else None
    types = sorted({n["type"] for n in ref["neurons"]}) if ref else [t for t in (a.types or "").split(",") if t]
    if not types: sys.exit("maleCnsFlatExtract: --types TYPE1,TYPE2,... (or --check <a vendored circuit>)")
    ann = pf.read_table(a.annotations, columns=["bodyId", "type", "instance", "somaSide", "statusLabel"]).to_pydict()
    rows = [(types.index(t), b, t, i, s) for b, t, i, s in zip(ann["bodyId"], ann["type"], ann["instance"], ann["somaSide"]) if t in types]
    rows.sort()
    missing = [t for t in types if not any(r[2] == t for r in rows)]
    if missing: sys.exit(f"maleCnsFlatExtract: no neuron of type {', '.join(missing)} in the annotations")
    ids = [r[1] for r in rows]; idset = pa.array(ids, type=pa.int64())
    nts = {}
    if a.neurotransmitters:   # the release's PREDICTED transmitter for each neuron (a classifier's call from the EM images, pooled over the cell type: `consensus_nt`), and how sure the cell type's call is
        nt = pf.read_table(a.neurotransmitters, columns=["body", "consensus_nt", "celltype_predicted_nt_confidence"]); nt = nt.filter(pc.is_in(nt.column("body"), value_set=idset)).to_pydict()
        nts = {b: (c, None if q is None else round(q, 3)) for b, c, q in zip(nt["body"], nt["consensus_nt"], nt["celltype_predicted_nt_confidence"])}
    reader = pa.ipc.open_file(pa.memory_map(a.weights)); edges = []; seen = 0
    for k in range(reader.num_record_batches):
        b = reader.get_batch(k); seen += b.num_rows
        m = pc.and_(pc.is_in(b.column("body_pre"), value_set=idset), pc.is_in(b.column("body_post"), value_set=idset))
        f = b.filter(m)
        for pre, post, w in zip(f.column("body_pre").to_pylist(), f.column("body_post").to_pylist(), f.column("weight").to_pylist()): edges.append([pre, post, w])
    edges.sort()
    if ref:
        rid = sorted(n["bodyId"] for n in ref["neurons"]); re_ = sorted([e[0], e[1], e[2]] for e in ref["edges"]); mine = {(e[0], e[1]): e[2] for e in edges}; theirs = {(e[0], e[1]): e[2] for e in re_}
        both = set(mine) & set(theirs)
        print(f"[maleCnsFlatExtract --check] {a.check}: types {', '.join(types)}")
        print(f"  neurons: {len(ids)} in the flat annotations, {len(rid)} in the vendored file, the same ids: {sorted(ids) == rid}")
        print(f"  edges among them: {len(edges)} in the flat weights ({seen} rows read), {len(re_)} in the vendored file; in both {len(both)}, only flat {len(set(mine) - set(theirs))}, only vendored {len(set(theirs) - set(mine))}; of those in both, {sum(1 for k in both if mine[k] == theirs[k])} have the same weight")
        only_v = sorted(theirs[k] for k in set(theirs) - set(mine)); only_f = sorted(mine[k] for k in set(mine) - set(theirs))
        if only_v: print(f"  the vendored-only edges have weights {only_v[:12]}{' ...' if len(only_v) > 12 else ''} (max {only_v[-1]})")
        if only_f: print(f"  the flat-only edges have weights {only_f[:12]}{' ...' if len(only_f) > 12 else ''} (max {only_f[-1]})")
        return
    out = {
        "dataset": "male-cns:v1.0", "server": "https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/", "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "license": "CC-BY-4.0 (as vendor/male-cns/PROVENANCE.md records for this dataset from the Neuprint server; the release bucket's README states none; not re-confirmed)",
        "citation": "Janelia FlyEM male-cns connectome v1.0, flat-connectome release files (gs://flyem-male-cns)", "name": a.name, "types": types,
        "sources": {"annotations": {"file": a.annotations.split("/")[-1], "sha256": sha256(a.annotations)}, "weights": {"file": a.weights.split("/")[-1], "sha256": sha256(a.weights), "rows": seen}, **({"neurotransmitters": {"file": a.neurotransmitters.split("/")[-1], "sha256": sha256(a.neurotransmitters)}} if a.neurotransmitters else {})},
        "neuronCount": len(ids), "edgeCount": len(edges),
        "neurons": [{"bodyId": b, "type": t, "instance": i, "somaSide": s, **({"nt": nts.get(b, (None, None))[0], "ntConfidence": nts.get(b, (None, None))[1]} if a.neurotransmitters else {})} for _, b, t, i, s in rows], "edges": edges,
    }
    json.dump(out, open(a.out, "w"), separators=(",", ":")); open(a.out, "a").write("\n")
    print(f"[maleCnsFlatExtract] {a.out}: {len(ids)} neurons ({', '.join(f'{t} {sum(1 for r in rows if r[2] == t)}' for t in types)}), {len(edges)} edges among them, of {seen} rows read")

main()
