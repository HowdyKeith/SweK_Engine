#!/usr/bin/env python3
# WebGLEngine/tools/fishCaveExport.py -- UNNUMBERED (the version is chosen at ship time)
#
# EXPORT THE FISH'S MAUTHNER (ESCAPE) CIRCUIT FROM THE FISH1 CAVE SERVER, ON YOUR MACHINE, WITH YOUR TOKEN -- AND WRITE CSV FILES THAT CONTAIN NO TOKEN.
#
# WHY THIS EXISTS. The Fish1 larval-zebrafish connectome (Petkova, Januszewski et al., 2025) keeps its synapse tables behind a CAVE server (https://global.brain-wire-test.org) that needs a personal token. The tree's fish circuit
# (vendor/zebrafish/fish1-ten-core.json) came from an OPEN package instead, and it is the wrong circuit for a fish: mostly inputs to the dorsal motor nucleus of the vagus. The Mauthner cells are the fish's escape reflex, the
# analogue of the fly's giant fiber, and their wiring is in the CAVE tables. THIS SCRIPT RUNS WHERE YOUR TOKEN IS. The sandbox this tree is built in cannot reach that server, and the token is never handed to anyone: you run the
# script, look at the folder it writes, and upload the folder (CSV and JSON only).
#
# WHAT IT NEEDS: Python 3.9+, `pip install caveclient` (that brings pandas), and a Fish1 CAVE token. THE TOKEN IS NEVER PUT ON A COMMAND LINE (a command line lands in shell history and in `ps`): this script refuses a --token
# option. It reads the token caveclient has saved (the same file `CAVEclient` reads), or the environment variable CAVE_TOKEN for one run. To save one without typing it into a history:
#
#     python3 tools/fishCaveExport.py token-help          # prints where to make a token (a web page; the server does not hand one out programmatically)
#     python3 tools/fishCaveExport.py save-token          # asks for the token with the keystrokes hidden, and saves it where caveclient looks
#
# THEN, IN THIS ORDER (each step is read-only; nothing here writes to the server):
#
#     python3 tools/fishCaveExport.py discover                                  # which datastacks you can reach and which tables each has: writes ./fish1_discover/ (a few KB; safe to upload)
#     python3 tools/fishCaveExport.py export --datastack <name from discover>   # finds the Mauthner cells (a regexp over the cell-type tables), then their synapses, their top partners, and the circuit among them
#
#   export OPTIONS   --server URL            (default https://global.brain-wire-test.org; https only)
#                    --out DIR               (default ./fish1_mauthner_export_<UTC time>; refuses a folder that is not empty)
#                    --match REGEXP          (default "mauthner|\bm[- ]?cell\b", case-insensitive; searched in every text column of the cell-type tables)
#                    --root-ids 1,2,...      (skip the search: these root ids ARE the Mauthner cells; use this if the search finds the wrong cells or none)
#                    --tables T1,T2          (search only these tables; default every table except the synapse table, with at most --scan-max-rows rows)
#                    --scan-max-rows N       (default 300000: a table with more rows than this is not downloaded to be searched)
#                    --hops 1|2              (1: the cells' synapses out and in, and their partners; 2 (default): also the synapses AMONG the cells and their --max-partners strongest partners)
#                    --max-partners N        (default 40)
#                    --max-rows N            (default 5000000: the most rows any one synapse query may return; a query that hits it is flagged TRUNCATED in the manifest)
#                    --version N             (a materialization version; default the most recent one. ROOT IDS CHANGE WITH PROOFREADING: every query uses this one version, and the manifest records it)
#
# WHAT IT WRITES (export): mauthner_candidates.json (what was searched and what matched), synapses_out.csv and synapses_in.csv (every column the server returns, positions split into x/y/z), edges.csv (one row per pre->post pair: the
# synapse count and the summed size), partners.csv (the strongest partners), synapses_circuit.csv (hops 2), labels.csv (the cell-type rows of every neuron in the circuit), MANIFEST.json (sha256 of every file, the materialization version
# and its timestamp, the caveclient version, every option -- and no token) and README.txt. THE SCHEMA IS WHATEVER THE SERVER RETURNS: this script was written without access to the server, against caveclient's documented API (the
# calls it makes are held to the installed library's signatures by `selftest-signatures`, and to a stand-in server by tools/fishCaveExport-selfcheck.mjs), so `discover` comes first and its output tells us what the tables are called.
#
# DATA TERMS: the Fish1 data policy is open access with a request to cite the resource paper (Petkova, Januszewski et al., 2025, bioRxiv); an account on the CAVE server is a separate agreement with whoever runs it. The manifest repeats
# the citation. Nothing in this folder should be posted anywhere public until you have read the terms attached to your account.
import argparse
import csv
import datetime
import getpass
import hashlib
import json
import os
import re
import sys
from collections import Counter

TOOL = "fishCaveExport"
VERSION = "1"
DEFAULT_SERVER = "https://global.brain-wire-test.org"
DEFAULT_MATCH = r"mauthner|\bm[- ]?cell\b"
DEFAULT_SCAN_MAX_ROWS = 300000
DEFAULT_MAX_PARTNERS = 40
DEFAULT_MAX_ROWS = 5000000
CITATION = "Petkova, M. D., Januszewski, M., et al. (2025). A connectomic resource for neural cataloguing and circuit dissection of the larval zebrafish brain. bioRxiv."
SAMPLE_ROWS = 5


class Refusal(Exception):
    """A reason to stop that the person running the script can act on; main() prints it and exits 2."""


# ---- the calls made to caveclient, as keyword dictionaries built in ONE place, so that `selftest-signatures` binds exactly what the real calls pass --------------------------------------------------------------
def kw_client(server, datastack, token):
    kw = {"server_address": server, "max_retries": 3}
    if datastack:
        kw["datastack_name"] = datastack
    if token:
        kw["auth_token"] = token
    return kw


def kw_synapse_query(version, limit, pre_ids=None, post_ids=None):
    kw = {"materialization_version": version, "remove_autapses": True, "include_zeros": False, "limit": limit, "split_positions": True, "metadata": False}
    if pre_ids is not None:
        kw["pre_ids"] = list(pre_ids)
    if post_ids is not None:
        kw["post_ids"] = list(post_ids)
    return kw


def kw_query_table(version, limit):
    return {"limit": limit, "split_positions": True, "materialization_version": version, "metadata": False}


def kw_get_tables(version):
    return {"version": version}


def kw_table_metadata(version):
    return {"version": version}


def kw_annotation_count(version):
    return {"version": version}


# the (class path, method, keyword dictionary) triples `selftest-signatures` binds against the installed library
def signature_probes():
    return [
        ("caveclient.CAVEclient", None, kw_client(DEFAULT_SERVER, "ds", "tok")),
        ("caveclient.CAVEclient", None, kw_client(DEFAULT_SERVER, None, None)),
        ("caveclient.materializationengine.MaterializationClient", "synapse_query", kw_synapse_query(1, 10, pre_ids=[1], post_ids=[2])),
        ("caveclient.materializationengine.MaterializationClient", "query_table", dict(kw_query_table(1, 10), table="t")),
        ("caveclient.materializationengine.MaterializationClient", "get_tables", kw_get_tables(1)),
        ("caveclient.materializationengine.MaterializationClient", "get_table_metadata", dict(kw_table_metadata(1), table_name="t")),
        ("caveclient.materializationengine.MaterializationClient", "get_annotation_count", dict(kw_annotation_count(1), table_name="t")),
        ("caveclient.materializationengine.MaterializationClient", "most_recent_version", {}),
        ("caveclient.materializationengine.MaterializationClient", "get_timestamp", {"version": 1}),
        ("caveclient.infoservice.InfoServiceClient", "get_datastacks", {}),
        ("caveclient.infoservice.InfoServiceClient", "get_datastack_info", {"datastack_name": "ds"}),
        ("caveclient.auth.AuthClient", "get_new_token", {"open": False}),
        ("caveclient.auth.AuthClient", "save_token", {"token": "tok"}),
    ]


# ---- small helpers -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
def now_utc():
    return datetime.datetime.now(datetime.timezone.utc)


def say(msg):
    print(msg, flush=True)


def check_server(url):
    m = re.match(r"^(https?)://([^/:]+)", url or "")
    if not m:
        raise Refusal("--server must be a URL such as %s, got %r" % (DEFAULT_SERVER, url))
    if m.group(1) != "https" and m.group(2) not in ("localhost", "127.0.0.1"):
        raise Refusal("--server must be https (a token must not cross the network in the clear), got %r" % url)
    return url.rstrip("/")


def import_caveclient():
    try:
        import caveclient  # noqa: F401
        return caveclient
    except ImportError:
        raise Refusal("caveclient is not installed in this Python. Install it with:  python3 -m pip install caveclient   (it brings pandas), then run this again.")


def token_from_env():
    t = os.environ.get("CAVE_TOKEN")
    return t.strip() if t and t.strip() else None


def make_client(args, datastack=None):
    cc = import_caveclient()
    return cc.CAVEclient(**kw_client(args.server, datastack, token_from_env()))


def rows_of(df):
    if df is None:
        return []
    if hasattr(df, "to_dict"):
        return df.to_dict("records")
    return list(df)


def columns_of(df):
    if hasattr(df, "columns"):
        return [str(c) for c in list(df.columns)]
    rows = rows_of(df)
    return list(rows[0].keys()) if rows else []


def fmt(v):
    if v is None:
        return ""
    if hasattr(v, "item") and not isinstance(v, (list, tuple, dict, str, bytes)):
        try:
            v = v.item()
        except Exception:
            pass
    if isinstance(v, float) and v != v:
        return ""
    if isinstance(v, (list, tuple)):
        return ";".join(fmt(x) for x in v)
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def as_int(v):
    try:
        i = int(v)
        return i if i != 0 else None
    except (TypeError, ValueError):
        return None


class Folder:
    """The output folder: writes CSV/JSON/text, remembers each file for the manifest, and refuses to write into a folder that already holds something."""

    def __init__(self, path):
        self.path = path
        if os.path.exists(path) and os.listdir(path):
            raise Refusal("the output folder %r is not empty; give --out a new folder (this script never overwrites)" % path)
        os.makedirs(path, exist_ok=True)
        self.files = []
        self.warnings = []

    def csv(self, name, columns, rows):
        p = os.path.join(self.path, name)
        with open(p, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(columns)
            n = 0
            for r in rows:
                w.writerow([fmt(r.get(c)) for c in columns] if isinstance(r, dict) else [fmt(x) for x in r])
                n += 1
        self.files.append({"name": name, "rows": n})
        return n

    def json(self, name, obj):
        p = os.path.join(self.path, name)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=1, sort_keys=True, default=str)
            f.write("\n")
        self.files.append({"name": name})

    def text(self, name, body):
        with open(os.path.join(self.path, name), "w", encoding="utf-8") as f:
            f.write(body)
        self.files.append({"name": name})

    def manifest(self, extra, token):
        for fe in self.files:
            p = os.path.join(self.path, fe["name"])
            fe["bytes"] = os.path.getsize(p)
            fe["sha256"] = sha256_file(p)
        body = dict(extra)
        body.update({"tool": TOOL, "toolVersion": VERSION, "written": now_utc().isoformat(), "citation": CITATION, "warnings": self.warnings, "files": self.files})
        p = os.path.join(self.path, "MANIFEST.json")
        with open(p, "w", encoding="utf-8") as f:
            json.dump(body, f, indent=1, sort_keys=True, default=str)
            f.write("\n")
        if token and len(token) >= 8:   # the last thing done: no file written here may contain the token
            for name in sorted(os.listdir(self.path)):
                with open(os.path.join(self.path, name), "rb") as f:
                    if token.encode("utf-8") in f.read():
                        raise Refusal("INTERNAL: the token appears in %s -- the folder must not be shared (this should not be possible; tell whoever wrote the script)" % name)
        return p


# ---- token-help and save-token -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
def cmd_token_help(args):
    server = check_server(args.server)
    cc = import_caveclient()
    cc.CAVEclient(server_address=server).auth.get_new_token(open=False)
    say("\nWhen you have the token, save it WITHOUT typing it into a command line:\n    python3 %s save-token\n(or, for one run only:  CAVE_TOKEN=... python3 %s discover   -- on Windows, set it in the same window first)" % (sys.argv[0], sys.argv[0]))
    return 0


def cmd_save_token(args):
    server = check_server(args.server)
    cc = import_caveclient()
    tok = getpass.getpass("Paste the token (nothing is shown as you type): ").strip()
    if not tok:
        raise Refusal("no token entered")
    cc.CAVEclient(server_address=server).auth.save_token(token=tok)
    say("Saved where caveclient looks for it. (It was not printed.) Next:  python3 %s discover" % sys.argv[0])
    return 0


# ---- discover -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
def table_report(client, name, version, synapse_table):
    mat = client.materialize
    rep = {"table": name}
    try:
        rep["count"] = mat.get_annotation_count(name, **kw_annotation_count(version))
    except Exception as e:
        rep["count"] = None
        rep["countError"] = "%s: %s" % (type(e).__name__, str(e)[:200])
    try:
        md = mat.get_table_metadata(name, **kw_table_metadata(version))
        rep["metadata"] = md
    except Exception as e:
        rep["metadataError"] = "%s: %s" % (type(e).__name__, str(e)[:200])
    try:
        df = mat.query_table(name, **kw_query_table(version, SAMPLE_ROWS))
        rep["columns"] = columns_of(df)
        rep["sample"] = [{c: fmt(v) for c, v in r.items()} for r in rows_of(df)[:SAMPLE_ROWS]]
    except Exception as e:
        rep["sampleError"] = "%s: %s" % (type(e).__name__, str(e)[:200])
    rep["isSynapseTable"] = name == synapse_table
    return rep


def cmd_discover(args):
    server = check_server(args.server)
    out = Folder(args.out or "fish1_discover")
    glob = make_client(args)
    try:
        stacks = list(glob.info.get_datastacks())
    except Exception as e:
        raise Refusal("could not list the datastacks on %s (%s: %s). Is the token saved (python3 %s save-token)? Is the server address right?" % (server, type(e).__name__, str(e)[:200], sys.argv[0]))
    say("datastacks on %s: %s" % (server, ", ".join(stacks) if stacks else "(none)"))
    wanted = [args.datastack] if args.datastack else stacks
    report = {"server": server, "datastacks": stacks, "details": {}}
    for ds in wanted:
        say("-- %s" % ds)
        entry = {}
        try:
            client = make_client(args, ds)
            version = client.materialize.most_recent_version()
            info = client.info.get_datastack_info(datastack_name=ds)
            entry["materializationVersion"] = version
            entry["timestamp"] = fmt(client.materialize.get_timestamp(version))
            entry["datastackInfo"] = {k: info[k] for k in sorted(info) if isinstance(info[k], (str, int, float, bool, type(None)))}
            synapse_table = info.get("synapse_table")
            tables = list(client.materialize.get_tables(**kw_get_tables(version)))
            entry["tables"] = []
            for t in tables:
                rep = table_report(client, t, version, synapse_table)
                entry["tables"].append(rep)
                say("   %-40s %s rows%s" % (t, rep.get("count"), "  (the synapse table)" if rep["isSynapseTable"] else ""))
        except Exception as e:
            entry["error"] = "%s: %s" % (type(e).__name__, str(e)[:300])
            say("   FAILED: %s" % entry["error"])
        report["details"][ds] = entry
    out.json("discover.json", report)
    rows = []
    for ds, entry in report["details"].items():
        for t in entry.get("tables", []):
            md = t.get("metadata") or {}
            rows.append({"datastack": ds, "table": t["table"], "count": t.get("count"), "synapse_table": t["isSynapseTable"], "schema": md.get("schema"), "description": str(md.get("description", ""))[:300], "columns": " ".join(t.get("columns", []))})
    out.csv("tables.csv", ["datastack", "table", "count", "synapse_table", "schema", "description", "columns"], rows)
    out.text("README.txt", "Fish1 CAVE discovery (tools/fishCaveExport.py discover). discover.json: the datastacks, and for each table its row count, metadata, columns and %d sample rows. tables.csv: the same, one row a table. No token is in these files.\n" % SAMPLE_ROWS)
    p = out.manifest({"command": "discover", "server": server, "datastack": args.datastack}, token_from_env())
    say("\nWrote %s/ (%d files). Upload the folder; it holds table names, counts and a few sample rows, and no token." % (out.path, len(out.files) + 1))
    return 0


# ---- export ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
ID_COLUMN = re.compile(r"(^|_)root_id$")


def ids_in_row(row):
    ids = []
    for c, v in row.items():
        if ID_COLUMN.search(str(c)):
            i = as_int(v)
            if i is not None:
                ids.append(i)
    return ids


def pre_post_columns(columns):
    pre = [c for c in columns if "pre" in c and ID_COLUMN.search(c)]
    post = [c for c in columns if "post" in c and ID_COLUMN.search(c)]
    if not pre or not post:
        raise Refusal("the synapse rows have no pre/post root-id columns (columns: %s); run `discover` and send tables.csv" % ", ".join(columns))
    return pre[0], post[0]


def scan_for_cells(client, info, tables, args, version, folder):
    """Search the cell-type-like tables for the Mauthner cells. Returns (root ids, labels by id, the report)."""
    pat = re.compile(args.match, re.IGNORECASE)
    synapse_table = info.get("synapse_table")
    report = {"match": args.match, "scanned": [], "skipped": [], "matches": []}
    labels = {}
    found = []
    for t in tables:
        if t == synapse_table:
            report["skipped"].append({"table": t, "why": "the synapse table"})
            continue
        try:
            n = client.materialize.get_annotation_count(t, **kw_annotation_count(version))
        except Exception as e:
            report["skipped"].append({"table": t, "why": "count failed: %s" % type(e).__name__})
            continue
        if n is None or n > args.scan_max_rows:
            report["skipped"].append({"table": t, "why": "%s rows is over --scan-max-rows %d" % (n, args.scan_max_rows)})
            continue
        try:
            df = client.materialize.query_table(t, **kw_query_table(version, args.scan_max_rows))
        except Exception as e:
            report["skipped"].append({"table": t, "why": "query failed: %s: %s" % (type(e).__name__, str(e)[:150])})
            continue
        rows = rows_of(df)
        report["scanned"].append({"table": t, "rows": len(rows), "columns": columns_of(df)})
        for r in rows:
            texts = {c: v for c, v in r.items() if isinstance(v, str)}
            for i in ids_in_row(r):
                labels.setdefault(i, []).append({"table": t, "text": texts})
            hit = [(c, v) for c, v in texts.items() if pat.search(v)]
            if hit:
                ids = ids_in_row(r)
                report["matches"].append({"table": t, "column": hit[0][0], "value": hit[0][1], "ids": ids})
                found.extend(ids)
    ids = sorted(set(found))
    report["ids"] = ids
    return ids, labels, report


def cmd_export(args):
    server = check_server(args.server)
    if not args.datastack:
        raise Refusal("export needs --datastack <name> (run `discover` first to see the names)")
    if args.hops not in (1, 2):
        raise Refusal("--hops must be 1 or 2")
    out = Folder(args.out or "fish1_mauthner_export_" + now_utc().strftime("%Y%m%dT%H%M%SZ"))
    client = make_client(args, args.datastack)
    mat = client.materialize
    version = args.version if args.version is not None else mat.most_recent_version()
    stamp = fmt(mat.get_timestamp(version))
    info = client.info.get_datastack_info(datastack_name=args.datastack)
    say("datastack %s, materialization version %s (%s)" % (args.datastack, version, stamp))
    tables = args.tables.split(",") if args.tables else list(mat.get_tables(**kw_get_tables(version)))
    labels = {}
    if args.root_ids:
        ids = sorted(set(int(x) for x in args.root_ids.split(",") if x.strip()))
        cand = {"match": None, "scanned": [], "skipped": [], "matches": [], "ids": ids, "note": "ids given with --root-ids; no search was made"}
    else:
        ids, labels, cand = scan_for_cells(client, info, tables, args, version, out)
    out.json("mauthner_candidates.json", cand)
    say("cells: %s" % (ids if ids else "none found"))
    if not ids:
        out.text("README.txt", "No cell matched %r in the %d tables searched (see mauthner_candidates.json). Send this folder; or re-run with --root-ids, or --match.\n" % (args.match, len(cand["scanned"])))
        out.manifest({"command": "export", "datastack": args.datastack, "server": server, "materializationVersion": version, "timestamp": stamp, "result": "no cells"}, token_from_env())
        raise Refusal("no cell matched %r in %d tables (see %s/mauthner_candidates.json). Send that folder, or run again with --root-ids <ids> or a different --match." % (args.match, len(cand["scanned"]), out.path))
    synapse_cols = None
    truncated = []

    def run(label, **q):
        df = mat.synapse_query(**kw_synapse_query(version, args.max_rows, **q))
        rows = rows_of(df)
        if len(rows) >= args.max_rows:
            truncated.append(label)
            out.warnings.append("TRUNCATED: %s returned the --max-rows limit of %d; raise --max-rows" % (label, args.max_rows))
            say("WARNING: " + out.warnings[-1])
        return columns_of(df), rows

    cols_out, rows_out = run("synapses out of the cells", pre_ids=ids)
    cols_in, rows_in = run("synapses into the cells", post_ids=ids)
    synapse_cols = cols_out or cols_in
    if not synapse_cols:
        raise Refusal("the cells have no synapses at version %s (root ids can be stale; try --version with an earlier one)" % version)
    pre_c, post_c = pre_post_columns(synapse_cols)
    out.csv("synapses_out.csv", cols_out, rows_out)
    out.csv("synapses_in.csv", cols_in, rows_in)
    say("synapses: %d out, %d in" % (len(rows_out), len(rows_in)))
    partner = Counter()
    for r in rows_out:
        p = as_int(r.get(post_c))
        if p is not None and p not in ids:
            partner[p] += 1
    for r in rows_in:
        p = as_int(r.get(pre_c))
        if p is not None and p not in ids:
            partner[p] += 1
    top = [p for p, _ in sorted(partner.items(), key=lambda kv: (-kv[1], kv[0]))[:args.max_partners]]
    outc, inc = Counter(), Counter()
    for r in rows_out:
        outc[as_int(r.get(post_c))] += 1
    for r in rows_in:
        inc[as_int(r.get(pre_c))] += 1
    out.csv("partners.csv", ["partner_root_id", "synapses_from_cells", "synapses_to_cells", "total"], [{"partner_root_id": p, "synapses_from_cells": inc.get(p, 0), "synapses_to_cells": outc.get(p, 0), "total": partner[p]} for p in top])
    edge_rows = rows_out + rows_in
    circuit_rows = edge_rows
    if args.hops == 2:
        members = sorted(set(ids) | set(top))
        _, circuit_rows = run("synapses among the cells and their top partners", pre_ids=members, post_ids=members)
        out.csv("synapses_circuit.csv", synapse_cols, circuit_rows)
        say("circuit: %d synapses among %d neurons" % (len(circuit_rows), len(members)))
    else:
        members = sorted(set(ids) | set(top))
    size_c = "size" if "size" in synapse_cols else None
    agg = {}
    seen = set()
    for r in circuit_rows:
        key = (as_int(r.get(pre_c)), as_int(r.get(post_c)))
        if key[0] is None or key[1] is None:
            continue
        sid = r.get("id")
        if sid is not None and (sid, key) in seen:
            continue
        if sid is not None:
            seen.add((sid, key))
        a = agg.setdefault(key, [0, 0])
        a[0] += 1
        try:
            a[1] += int(r.get(size_c)) if size_c else 0
        except (TypeError, ValueError):
            pass
    out.csv("edges.csv", ["pre_root_id", "post_root_id", "synapses", "total_size"], [{"pre_root_id": k[0], "post_root_id": k[1], "synapses": v[0], "total_size": v[1] if size_c else ""} for k, v in sorted(agg.items())])
    lab_rows = []
    for i in members:
        for entry in labels.get(i, []):
            lab_rows.append({"root_id": i, "table": entry["table"], "text_columns": json.dumps(entry["text"], sort_keys=True)})
    out.csv("labels.csv", ["root_id", "table", "text_columns"], lab_rows)
    out.text("README.txt", "Fish1 Mauthner export (tools/fishCaveExport.py export) of datastack %s at materialization version %s (%s).\n"
             "mauthner_candidates.json: how the cells were found. synapses_out.csv / synapses_in.csv: every synapse of the cells, every column the server returned. partners.csv: the strongest partners. "
             "synapses_circuit.csv (hops 2): the synapses among the cells and their top partners. edges.csv: one row per pre->post pair. labels.csv: the cell-type rows of the neurons in the circuit. "
             "MANIFEST.json: sha256 of every file, the options and the caveclient version. NO TOKEN IS IN ANY OF THESE FILES.\nCite: %s\n" % (args.datastack, version, stamp, CITATION))
    import caveclient
    out.manifest({"command": "export", "datastack": args.datastack, "server": server, "materializationVersion": version, "timestamp": stamp, "caveclient": getattr(caveclient, "__version__", None),
                  "options": {"match": args.match, "rootIds": args.root_ids, "tables": args.tables, "scanMaxRows": args.scan_max_rows, "hops": args.hops, "maxPartners": args.max_partners, "maxRows": args.max_rows},
                  "cells": ids, "circuitNeurons": members, "truncated": truncated}, token_from_env())
    say("\nWrote %s/ (%d files). Upload the folder. If a WARNING above says TRUNCATED, say so." % (out.path, len(out.files) + 1))
    return 0


# ---- selftest-signatures --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
def cmd_selftest_signatures(args):
    import importlib
    import inspect
    bad = 0
    for path, method, kw in signature_probes():
        mod_path, _, cls_name = path.rpartition(".")
        try:
            cls = getattr(importlib.import_module(mod_path), cls_name)
            fn = cls if method is None else getattr(cls, method)
            sig = inspect.signature(fn)
            sig.bind(*([] if method is None else [None]), **kw)
            say("ok    %s%s(%s)" % (cls_name, "" if method is None else "." + method, ", ".join(sorted(kw))))
        except Exception as e:
            bad += 1
            say("FAIL  %s%s(%s): %s: %s" % (cls_name, "" if method is None else "." + method, ", ".join(sorted(kw)), type(e).__name__, e))
    return 1 if bad else 0


def build_parser():
    p = argparse.ArgumentParser(prog="fishCaveExport.py", description="Export the Fish1 Mauthner circuit from the CAVE server. No token on the command line, ever.", add_help=True)
    p.add_argument("command", choices=["token-help", "save-token", "discover", "export", "selftest-signatures"])
    p.add_argument("--server", default=DEFAULT_SERVER)
    p.add_argument("--datastack")
    p.add_argument("--out")
    p.add_argument("--match", default=DEFAULT_MATCH)
    p.add_argument("--root-ids", dest="root_ids")
    p.add_argument("--tables")
    p.add_argument("--scan-max-rows", dest="scan_max_rows", type=int, default=DEFAULT_SCAN_MAX_ROWS)
    p.add_argument("--hops", type=int, default=2)
    p.add_argument("--max-partners", dest="max_partners", type=int, default=DEFAULT_MAX_PARTNERS)
    p.add_argument("--max-rows", dest="max_rows", type=int, default=DEFAULT_MAX_ROWS)
    p.add_argument("--version", type=int)
    return p


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    for a in argv:   # a token on a command line lands in shell history and in `ps`; refuse it by name, before anything else happens
        if a == "--token" or a.startswith("--token=") or a == "--auth-token" or a.startswith("--auth-token="):
            print("fishCaveExport: refusing %s -- a token on a command line is saved in your shell history and shown by `ps`. Use `save-token` (hidden prompt) or the CAVE_TOKEN environment variable." % a.split("=")[0], file=sys.stderr)
            return 2
    args = build_parser().parse_args(argv)
    try:
        if args.command in ("token-help", "save-token", "discover", "export"):
            args.server = check_server(args.server)   # once, here: every client below is built from the CHECKED address (no trailing slash, https)
        return {"token-help": cmd_token_help, "save-token": cmd_save_token, "discover": cmd_discover, "export": cmd_export, "selftest-signatures": cmd_selftest_signatures}[args.command](args)
    except Refusal as e:
        print("fishCaveExport: %s" % e, file=sys.stderr)
        return 2
    except Exception as e:   # a network or server error: say what, and what to check, without a traceback (a message from the HTTP layer carries a URL and never a token)
        print("fishCaveExport: %s: %s\nCheck the network (a VPN or proxy that blocks %s answers like this), the --server address and the token (python3 %s save-token)." % (type(e).__name__, str(e)[:300], args.server, sys.argv[0]), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
