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
#   giants           python3 tools/fishCaveExport.py giants --datastack <name>     # the big-neuron finder: one pass over the whole synapse table counting the synapses each cell with a soma receives, then the top cells and their mirror pairs
#                    A PASS OVER ~30 MILLION ROWS TAKES ABOUT AN HOUR AND THE SERVER IS NOT ALWAYS UP FOR IT. Three things make that survivable:
#                    1. a page the server fails on (HTTP 500/502/503/504/429, a dropped connection, a timeout) is asked for again after a pause (--retries 6, waiting --retry-wait 5 s, then 15, 45, ... at most --retry-max-wait 300 s);
#                       the second failure in a row halves the page (down to --min-chunk-rows 50000). Nothing is counted from a page that did not arrive.
#                    2. when the tries run out it STOPS (exit 3), says the row it reached, and keeps giants_counts.partial.json in the output folder; Ctrl+C does the same (exit 130).
#                       --keep-trying N (default 0) makes it wait --cooldown seconds (600) and carry on from the saved counts by itself, up to N times, so a night's run needs no one at the keyboard.
#                    3. THE SAME COMMAND RUN AGAIN CARRIES ON: it looks for an unfinished pass of the same datastack, snapshot and tables (in --out, or in the fish1_giants_* folders here, the furthest wins) and continues in that folder.
#                       --fresh starts over; --pages N reads N pages and stops (run it again for the next N: a pass in pieces); --resume FILE picks a partial file from anywhere. Counts of another snapshot are never added to.
#                    Other options: --top N (60), --chunk-rows N (1000000; the server returns at most 500000 a page, which is fine), --soma-table (somas), --midline UM, --pair-tol UM (25), --sample N (one random sample instead of the pass).
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
import time
from collections import Counter

TOOL = "fishCaveExport"
VERSION = "4"
DEFAULT_SERVER = "https://global.brain-wire-test.org"
DEFAULT_MATCH = r"mauthner|\bm[- ]?cell\b"
DEFAULT_SCAN_MAX_ROWS = 300000
DEFAULT_MAX_PARTNERS = 40
DEFAULT_MAX_ROWS = 5000000
CITATION = "Petkova, M. D., Januszewski, M., et al. (2025). A connectomic resource for neural cataloguing and circuit dissection of the larval zebrafish brain. bioRxiv."
SAMPLE_ROWS = 5
PARTIAL_NAME = "giants_counts.partial.json"
GIANTS_FILES = ("giants_top.csv", "giants_pairs.csv", "soma_map.json", "giants_counts.json", "README.txt", "MANIFEST.json")
TRANSIENT_STATUS = (429, 500, 502, 503, 504)   # the server hiccuping, not the server saying no: a retry can fix these and cannot fix a 401, 403 or 404
TRANSIENT_NAMES = ("ConnectionError", "ConnectTimeout", "ReadTimeout", "Timeout", "ChunkedEncodingError", "RemoteDisconnected", "ProtocolError")   # the requests / urllib3 classes by name (they are not the builtin ones); the builtin connection and timeout errors are matched by type
DEFAULT_RETRIES = 6
DEFAULT_RETRY_WAIT = 5.0         # seconds before the first retry; each later wait is three times the one before, up to DEFAULT_RETRY_MAX_WAIT
DEFAULT_RETRY_MAX_WAIT = 300.0
DEFAULT_MIN_CHUNK_ROWS = 50000   # the smallest page a pass shrinks to after the server keeps failing on it
PRE_ROOT, POST_ROOT = "pre_pt_root_id", "post_pt_root_id"


class Refusal(Exception):
    """A reason to stop that the person running the script can act on; main() prints it and exits 2."""


class Stopped(Exception):
    """The server stopped answering (exit code 3), or the person pressed Ctrl+C (130), with everything done so far saved on disk; main() prints the message (which says how to carry on) and exits with the code."""

    def __init__(self, message, code=3):
        Exception.__init__(self, message)
        self.code = code


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


def kw_query_table_in(version, limit, column, ids):
    kw = kw_query_table(version, limit)
    kw["filter_in_dict"] = {column: [int(i) for i in ids]}
    return kw


def kw_query_table_page(version, limit, offset, columns):
    return {"select_columns": list(columns), "limit": int(limit), "offset": int(offset), "materialization_version": version, "metadata": False}


def kw_query_table_sample(version, n, columns):
    return {"select_columns": list(columns), "random_sample": int(n), "materialization_version": version, "metadata": False}


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
        ("caveclient.materializationengine.MaterializationClient", "query_table", dict(kw_query_table_in(1, 10, "pt_root_id", [1]), table="t")),
        ("caveclient.materializationengine.MaterializationClient", "query_table", dict(kw_query_table_page(1, 10, 0, ["a", "b"]), table="t")),
        ("caveclient.materializationengine.MaterializationClient", "query_table", dict(kw_query_table_sample(1, 10, ["a", "b"]), table="t")),
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


def transient_reason(e):
    """None for an error that trying again cannot fix (a refused token, a table that is not there, a bad argument); otherwise a few words for what the server did: the HTTP status, or the kind of connection failure."""
    status = getattr(getattr(e, "response", None), "status_code", None)
    if status is not None:
        return ("HTTP %s" % status) if status in TRANSIENT_STATUS else None
    name = type(e).__name__
    if name in TRANSIENT_NAMES or isinstance(e, (ConnectionError, TimeoutError)):
        return name
    text = str(e).lower()
    if "server closed the connection" in text or "connection reset" in text or "timed out" in text:
        return name
    return None


def brief(e):
    """The first line of an error, short: what the server said, for a message to the person at the keyboard (a message from the HTTP layer carries a URL and never a token)."""
    lines = [l.strip() for l in str(e).splitlines() if l.strip()]
    return (lines[0] if lines else type(e).__name__)[:100]


def call_with_retries(args, what, fn, on_retry=None, progress=None):
    """fn(), and when the server hiccups (a 500, 502, 503, 504 or 429, a dropped connection, a timeout) a pause and another try: --retries more tries, waiting --retry-wait seconds before the first and three times as long before each later one,
    never more than --retry-max-wait. An error a retry cannot fix is raised as it is. When the tries run out, or the person presses Ctrl+C, it raises Stopped whose message says where things stand (`progress()`, if given) and that running the same command again carries on.
    `on_retry(attempt, error)` may change what the next try asks for and returns a few words saying how."""
    tries = max(0, args.retries) + 1
    for attempt in range(1, tries + 1):
        try:
            return fn()
        except KeyboardInterrupt:
            raise Stopped("STOPPED by you (Ctrl+C) during %s. %s" % (what, progress() if progress else "Nothing was saved for this step; run the same command again."), 130)
        except Exception as e:
            why = transient_reason(e)
            if why is None:
                raise
            if attempt >= tries:
                raise Stopped("STOPPED: %s got no good answer from the server after %d tries (%s: %s). %s" % (what, tries, why, brief(e), progress() if progress else "Run the same command again later."))
            wait = min(args.retry_max_wait, args.retry_wait * 3 ** (attempt - 1))
            how = on_retry(attempt, e) if on_retry else ""
            say("%s: the server answered %s (%s); waiting %g s, then trying again%s (try %d of %d)" % (what, why, brief(e), wait, how or "", attempt + 1, tries))
            try:
                time.sleep(wait)
            except KeyboardInterrupt:
                raise Stopped("STOPPED by you (Ctrl+C) while waiting to retry %s. %s" % (what, progress() if progress else "Run the same command again."), 130)


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


def plain_int(v):
    """A number from the server as a python int (None stays None): caveclient hands back numpy integers, which the json module cannot write at all (the first real `giants` run died on one) and which a `default=str` dump turns into text ("737" for 737)."""
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return v


def as_int(v):
    try:
        i = int(v)
        return i if i != 0 else None
    except (TypeError, ValueError):
        return None


class Folder:
    """The output folder: writes CSV/JSON/text, remembers each file for the manifest, and refuses to write into a folder that already holds something."""

    def __init__(self, path, reuse=()):
        Folder.check(path, reuse)
        self.path = path
        os.makedirs(path, exist_ok=True)
        self.files = []
        self.warnings = []

    @staticmethod
    def check(path, reuse=()):
        """Refuse a folder that holds anything but the names in `reuse` (files of an unfinished run of the same command, which the new run replaces or continues); said before the network is touched."""
        blockers = sorted(n for n in os.listdir(path) if n not in reuse) if os.path.isdir(path) else []
        if blockers:
            raise Refusal("the output folder %r is not empty; give --out a new folder (this script never overwrites)" % path)

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
        rep["count"] = plain_int(mat.get_annotation_count(name, **kw_annotation_count(version)))
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
            version = plain_int(client.materialize.most_recent_version())
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


def lookup_labels(client, tables, synapse_table, members, args, version):
    """The rows that name the circuit's neurons, by root id, when the cells were GIVEN (--root-ids) and so no table was searched: for each table that is not the synapse table and is not over --scan-max-rows, the rows whose pt_root_id is one of `members`
    (a filtered query, so the 187,000-row soma table is not downloaded to find forty rows). A table without a pt_root_id column answers with an error and is listed as skipped. Returns (labels by root id, the report)."""
    labels, report = {}, {"looked": [], "skipped": []}
    want = set(members)
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
            df = client.materialize.query_table(t, **kw_query_table_in(version, args.scan_max_rows, "pt_root_id", members))
        except Exception as e:
            report["skipped"].append({"table": t, "why": "query failed: %s: %s" % (type(e).__name__, str(e)[:150])})
            continue
        rows = rows_of(df)
        report["looked"].append({"table": t, "rows": len(rows), "columns": columns_of(df)})
        for r in rows:
            texts = {c: v for c, v in r.items() if isinstance(v, str)}
            for i in ids_in_row(r):
                if i in want:
                    labels.setdefault(i, []).append({"table": t, "text": texts, "row": {c: fmt(v) for c, v in r.items()}})
    return labels, report


def position_columns(root_col):
    return [root_col.replace("root_id", "position_" + a) for a in "xyz"]


def cell_summary(cid, rows_out, rows_in, pre_c, post_c, labels, resolution):
    """What one cell looks like in the rows that were exported: how many synapses leave it and arrive on it, from how many partners, where they sit (the box and centre of the synapse positions, in voxels and, when the table's voxel size is known, in micrometres),
    and every row of a label table that names it. A cell with no synapse at all is said to be."""
    outs = [r for r in rows_out if as_int(r.get(pre_c)) == cid]
    ins = [r for r in rows_in if as_int(r.get(post_c)) == cid]
    pts = []
    for rows, col in ((outs, pre_c), (ins, post_c)):
        cx = position_columns(col)
        for r in rows:
            try:
                pts.append([float(r[c]) for c in cx])
            except (KeyError, TypeError, ValueError):
                pass
    box = None
    if pts:
        lo = [min(p[k] for p in pts) for k in range(3)]
        hi = [max(p[k] for p in pts) for k in range(3)]
        mid = [sum(p[k] for p in pts) / len(pts) for k in range(3)]
        box = {"points": len(pts), "min": lo, "max": hi, "centroid": mid, "extentVoxels": [hi[k] - lo[k] for k in range(3)]}
        if resolution and len(resolution) == 3:
            box["voxelNm"] = list(resolution)
            box["extentMicrometres"] = [round((hi[k] - lo[k]) * float(resolution[k]) / 1000.0, 2) for k in range(3)]
    return {"rootId": cid, "synapsesOut": len(outs), "synapsesIn": len(ins),
            "partnersOut": len({as_int(r.get(post_c)) for r in outs} - {None}), "partnersIn": len({as_int(r.get(pre_c)) for r in ins} - {None}),
            "noSynapses": not outs and not ins, "synapseBox": box,
            "labelRows": [{"table": e["table"], "row": e.get("row", e["text"])} for e in labels.get(cid, [])]}


def cmd_export(args):
    server = check_server(args.server)
    if not args.datastack:
        raise Refusal("export needs --datastack <name> (run `discover` first to see the names)")
    if args.hops not in (1, 2):
        raise Refusal("--hops must be 1 or 2")
    out = Folder(args.out or "fish1_mauthner_export_" + now_utc().strftime("%Y%m%dT%H%M%SZ"))
    client = make_client(args, args.datastack)
    mat = client.materialize
    version = args.version if args.version is not None else plain_int(mat.most_recent_version())
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
    size_real = bool(size_c) and any(as_int(r.get(size_c)) for r in circuit_rows)
    if size_c and not size_real:
        out.warnings.append("the synapse table's %s column is 0 in every row exported, so edges.csv leaves total_size blank (the sizes of this stack are in a separate table: synapses_axon_to_dendrite_size)" % size_c)
        say("WARNING: " + out.warnings[-1])
    out.csv("edges.csv", ["pre_root_id", "post_root_id", "synapses", "total_size"], [{"pre_root_id": k[0], "post_root_id": k[1], "synapses": v[0], "total_size": v[1] if size_real else ""} for k, v in sorted(agg.items())])
    label_report = None
    if not labels:
        labels, label_report = lookup_labels(client, tables, info.get("synapse_table"), members, args, version)
    lab_rows = []
    for i in members:
        for entry in labels.get(i, []):
            lab_rows.append({"root_id": i, "table": entry["table"], "text_columns": json.dumps(entry["text"], sort_keys=True), "row_json": json.dumps(entry.get("row", {}), sort_keys=True)})
    out.csv("labels.csv", ["root_id", "table", "text_columns", "row_json"], lab_rows)
    try:
        resolution = list(mat.get_table_metadata(info.get("synapse_table"), **kw_table_metadata(version)).get("voxel_resolution") or [])
    except Exception:
        resolution = []
    summary = {"datastack": args.datastack, "materializationVersion": version, "synapseTable": info.get("synapse_table"), "synapseVoxelNm": resolution or None,
               "cells": [cell_summary(c, rows_out, rows_in, pre_c, post_c, labels, resolution) for c in ids], "labelLookup": label_report}
    out.json("cells_summary.json", summary)
    for cs in summary["cells"]:
        tabs = sorted({e["table"] for e in cs["labelRows"]})
        say("cell %d: %d synapses out, %d in (%d / %d partners); named in: %s%s" % (cs["rootId"], cs["synapsesOut"], cs["synapsesIn"], cs["partnersOut"], cs["partnersIn"], ", ".join(tabs) if tabs else "no label table", "" if not cs["noSynapses"] else "  <-- NO SYNAPSES AT ALL at this version"))
        if cs["noSynapses"]:
            out.warnings.append("cell %d has no synapse in or out at version %s (a root id from the live viewer can be newer than the version; try --version, or it is not a cell with synapses in this table)" % (cs["rootId"], version))
    out.text("README.txt", "Fish1 Mauthner export (tools/fishCaveExport.py export) of datastack %s at materialization version %s (%s).\n"
             "mauthner_candidates.json: how the cells were found. synapses_out.csv / synapses_in.csv: every synapse of the cells, every column the server returned. partners.csv: the strongest partners. "
             "synapses_circuit.csv (hops 2): the synapses among the cells and their top partners. edges.csv: one row per pre->post pair. labels.csv: the rows of the label tables (somas and the like) that name the neurons in the circuit. cells_summary.json: for each cell its synapse counts, partners, the box its synapses sit in and every label row that names it. "
             "MANIFEST.json: sha256 of every file, the options and the caveclient version. NO TOKEN IS IN ANY OF THESE FILES.\nCite: %s\n" % (args.datastack, version, stamp, CITATION))
    import caveclient
    out.manifest({"command": "export", "datastack": args.datastack, "server": server, "materializationVersion": version, "timestamp": stamp, "caveclient": getattr(caveclient, "__version__", None),
                  "options": {"match": args.match, "rootIds": args.root_ids, "tables": args.tables, "scanMaxRows": args.scan_max_rows, "hops": args.hops, "maxPartners": args.max_partners, "maxRows": args.max_rows},
                  "cells": ids, "circuitNeurons": members, "truncated": truncated}, token_from_env())
    say("\nWrote %s/ (%d files). Upload the folder. If a WARNING above says TRUNCATED, say so." % (out.path, len(out.files) + 1))
    return 0



# ---- giants: the big-neuron finder ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
# WHY. fish1_full names no cell type but exc / inh / na, so the Mauthner cells cannot be searched for BY NAME. They can be searched for by what they ARE: one of the largest dendritic trees of the hindbrain, one on each side of the midline, mirror images of
# each other. This reads the soma table (a root id that has a soma is a cell and not a fragment), counts in one pass over the whole synapse table the synapses that arrive on and leave each of those cells, ranks them, looks at the top ones again with
# positions (how far apart their synapses sit), and lists the pairs of big cells that mirror each other across the midline. IT IS A HEURISTIC: it gives candidates to look at in the viewer, at coordinates it prints, and not an answer.
def column_ints(df, name):
    """One column of a query result as a list of python ints (None for 0 and for a missing value), without turning a million-row frame into a million dictionaries."""
    if hasattr(df, "columns") and hasattr(df, "__getitem__"):
        return [as_int(v) for v in df[name].tolist()]
    return [as_int(r.get(name)) for r in rows_of(df)]


def soma_points(rows, resolution):
    """The cells that have a soma: { root id: { id, cell_type, um: [x, y, z] in micrometres } } -- the first soma row of a root, the position scaled by the SOMA table's voxel size (not the synapse table's)."""
    cells = {}
    for r in rows:
        root = as_int(r.get("pt_root_id"))
        if root is None or root in cells:
            continue
        try:
            um = [float(r["pt_position_" + a]) * float(resolution[k]) / 1000.0 for k, a in enumerate("xyz")]
        except (KeyError, TypeError, ValueError, IndexError):
            continue
        cells[root] = {"id": r.get("id"), "cell_type": r.get("cell_type"), "um": um}
    return cells


def percentile(sorted_values, q):
    if not sorted_values:
        return None
    i = min(len(sorted_values) - 1, max(0, int(round(q * (len(sorted_values) - 1)))))
    return sorted_values[i]


def axis_roles(points):
    """Which axis is which, from the spread of the somas alone: the LONGEST is front-to-back, the MIDDLE one is left-to-right, the SHORTEST is the section axis (top-to-bottom). The spread is the 1st to the 99th percentile, so a stray cell does not move it. Returns (roles, report)."""
    spans = []
    for k in range(3):
        v = sorted(p[k] for p in points)
        lo, hi = percentile(v, 0.01), percentile(v, 0.99)
        spans.append({"axis": "xyz"[k], "lowUm": lo, "highUm": hi, "spanUm": hi - lo, "medianUm": percentile(v, 0.5)})
    order = sorted(range(3), key=lambda k: -spans[k]["spanUm"])
    roles = {"frontBack": order[0], "leftRight": order[1], "topBottom": order[2]}
    return roles, {"axes": spans, "frontBack": "xyz"[order[0]], "leftRight": "xyz"[order[1]], "topBottom": "xyz"[order[2]]}


def mirror_pairs(cands, roles, midline, tol):
    """The pairs among `cands` ({root, um, inDegree}) that are mirror images across the midline: on opposite sides of it, at the same front-to-back and top-to-bottom position within `tol` micrometres, and equally far from the midline within `tol`.
    Ranked by the smaller input count of the two (a pair is as big as its smaller cell), then by how well they mirror."""
    fb, lr, tb = roles["frontBack"], roles["leftRight"], roles["topBottom"]
    pairs = []
    for i in range(len(cands)):
        for j in range(i + 1, len(cands)):
            a, b = cands[i], cands[j]
            da, db = a["um"][lr] - midline, b["um"][lr] - midline
            if da * db >= 0:
                continue
            err = max(abs(a["um"][fb] - b["um"][fb]), abs(da + db), abs(a["um"][tb] - b["um"][tb]))
            if err > tol:
                continue
            lo, hi = sorted((a["inDegree"], b["inDegree"]))
            pairs.append({"rootA": a["root"], "rootB": b["root"], "minIn": lo, "maxIn": hi, "ratio": (lo / hi) if hi else 0.0, "mirrorErrorUm": round(err, 2)})
    pairs.sort(key=lambda p: (-p["minIn"], p["mirrorErrorUm"], p["rootA"], p["rootB"]))
    return pairs


def count_degrees(mat, table, version, args, wanted, state, folder):
    """One pass over the synapse table, a page of --chunk-rows rows at a time, only the two root-id columns, counting for each cell in `wanted` (the roots that have a soma) the synapses that arrive on it and leave it (autapses and root id 0 left out).
    `state` is { counts: { root: [in, out] }, offset, rows, done }. After every page the counts are written to giants_counts.partial.json in the output folder, so a pass that dies is picked up where it stopped by running the same command again.
    A page the server fails on is asked for again after a pause (call_with_retries), the second time at half the size and so on down to --min-chunk-rows; nothing is counted from a page that did not arrive, so a retry never counts a row twice or skips one."""
    t0, pages = time.time(), 0
    cols = [PRE_ROOT, POST_ROOT]
    where = os.path.join(folder.path, PARTIAL_NAME)

    def progress():
        of = ("of about %s (%.1f%%)" % (fmt(state["total"]), 100.0 * state["offset"] / state["total"])) if state.get("total") else "(the table's size is not known)"
        return "Stopped at row %d %s; the counts so far (%d cells) are saved in %s. Run the SAME command again and it carries on from this row." % (state["offset"], of, len(state["counts"]), where)

    def smaller(attempt, e):
        if attempt < 2:
            return ""   # the first failure is taken for a hiccup: the same page again; a second one in a row means the page is too heavy for the server just now
        now = min(args.chunk_rows, state.get("serverCap") or args.chunk_rows)
        new = max(args.min_chunk_rows, now // 2)
        if new >= now:   # never bigger: a floor above the page asked for changes nothing
            return ""
        args.chunk_rows, state["serverCap"] = new, None
        return ", asking for %d rows a page from now on" % new

    while True:
        if args.pages and pages >= args.pages:
            break
        if state.get("total") and state["offset"] >= state["total"]:   # a pass picked up after its last page was already counted (it stopped in the step after the pass)
            state["done"] = True
            break
        df = call_with_retries(args, "page %d (rows from %d)" % (pages + 1, state["offset"]), lambda: mat.query_table(table, **kw_query_table_page(version, args.chunk_rows, state["offset"], cols)), smaller, progress)
        pre, post = column_ints(df, PRE_ROOT), column_ints(df, POST_ROOT)
        n = len(pre)
        counts = state["counts"]
        for a, b in zip(pre, post):
            if a is None or b is None or a == b:
                continue
            if b in wanted:
                counts.setdefault(b, [0, 0])[0] += 1
            if a in wanted:
                counts.setdefault(a, [0, 0])[1] += 1
        state["offset"] += n
        state["rows"] += n
        pages += 1
        write_partial(folder, state, args, version)
        say("page %d: rows %d to %d of about %s (%.1f%%), %d cells counted, %.0f s" % (pages, state["offset"] - n, state["offset"], fmt(state["total"]), 100.0 * state["offset"] / state["total"] if state.get("total") else 0.0, len(counts), time.time() - t0))
        # the end of the table is known from its row count, not from a short page: a server that caps the rows it returns (500,000, say) sends short pages all the way through
        if n == 0 or (state.get("total") and state["offset"] >= state["total"]) or (not state.get("total") and n < args.chunk_rows):
            state["done"] = True
            break
        if n < args.chunk_rows and not state.get("capSaid"):
            state["capSaid"] = True
            state["serverCap"] = n
            say("the server returned %d rows for a page of %d: it caps a query; the pass goes on from the row it reached" % (n, args.chunk_rows))
    return state


def write_partial(folder, state, args, version):
    with open(os.path.join(folder.path, PARTIAL_NAME), "w", encoding="utf-8") as f:
        json.dump({"datastack": args.datastack, "version": version, "table": state["table"], "somaTable": args.soma_table, "offset": state["offset"], "rows": state["rows"], "counts": {str(k): v for k, v in state["counts"].items()}}, f)


def read_partial(path):
    """A giants_counts.partial.json as a dict, or None when it is not there or is not one."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            d = json.load(f)
        int(d["offset"])
        int(d["rows"])
        d["counts"].items()
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return None
    return d


def partial_mismatch(d, args, version, table):
    """Why counts in the partial file `d` cannot be added to this run's (another datastack, snapshot, synapse table or soma table), or None when they can."""
    if d.get("datastack") != args.datastack or d.get("version") != version or d.get("table") != table:
        return "datastack %r version %r table %r, not %r version %r table %r: counts from another snapshot cannot be added to" % (d.get("datastack"), d.get("version"), d.get("table"), args.datastack, version, table)
    if d.get("somaTable") is not None and d.get("somaTable") != args.soma_table:
        return "soma table %r, not %r: it counted another set of cells" % (d.get("somaTable"), args.soma_table)
    return None


def state_of(d, table):
    return {"counts": {int(k): list(v) for k, v in d["counts"].items()}, "offset": int(d["offset"]), "rows": int(d["rows"]), "done": False, "table": table}


def read_resume(path, args, version, table):
    d = read_partial(path)
    if d is None:
        raise Refusal("--resume could not read %s (it is not there, or it is not a giants_counts.partial.json)" % path)
    why = partial_mismatch(d, args, version, table)
    if why:
        raise Refusal("--resume file is for %s" % why)
    return state_of(d, table)


def giants_reusable(path):
    """The names a giants run may find already in its folder: its own partial counts file, and the files of an earlier run that did not finish (its MANIFEST says finished false), which the new run replaces. A finished run's files are never reusable."""
    names = {PARTIAL_NAME}
    try:
        with open(os.path.join(path, "MANIFEST.json"), "r", encoding="utf-8") as f:
            m = json.load(f)
        if m.get("command") == "giants" and m.get("finished") is False:
            names.update(GIANTS_FILES)
    except (OSError, ValueError, AttributeError):
        pass
    return names


def find_unfinished(args, version, table):
    """Where an earlier run of this same command stopped: (folder, state, notes), folder None when there is nothing to carry on. With --out, only that folder is looked at (and a partial file in it that cannot be added to is refused, not overwritten); without it, every
    fish1_giants_* folder here, and the one that got furthest wins. Folders whose counts are for another snapshot are named in `notes` and left alone."""
    notes, found = [], []
    if args.out:
        folders = [args.out] if os.path.isdir(args.out) else []
    else:
        folders = sorted(os.path.join(".", n) for n in os.listdir(".") if n.startswith("fish1_giants_") and os.path.isdir(n))
    for folder in folders:
        path = os.path.join(folder, PARTIAL_NAME)
        if not os.path.exists(path):
            continue
        d = read_partial(path)
        if d is None:
            if args.out:
                raise Refusal("%s is not a readable giants_counts.partial.json; move it away or use a new --out" % path)
            notes.append("%s holds a counts file that cannot be read: left alone" % folder)
            continue
        why = partial_mismatch(d, args, version, table)
        if why:
            if args.out:
                raise Refusal("the unfinished pass in %s is for %s; give --version %s to carry on with it, --fresh to start over, or a new --out" % (args.out, why, d.get("version")))
            notes.append("%s holds an unfinished pass for datastack %r version %r: left alone (--version %s carries it on)" % (folder, d.get("datastack"), d.get("version"), d.get("version")))
            continue
        found.append((int(d["offset"]), os.path.getmtime(path), folder, d))
    if not found:
        return None, None, notes
    found.sort(key=lambda t: (t[0], t[1]))
    _, _, folder, d = found[-1]
    return folder, state_of(d, table), notes


def cmd_giants(args):
    """giants, and with --keep-trying N: when the server gives up on us (Stopped, exit 3), wait --cooldown seconds and carry on from the saved counts, up to N times; a Ctrl+C (130), a refusal or any other error is not tried again."""
    rounds = 0
    while True:
        try:
            return cmd_giants_once(args)
        except Stopped as e:
            if e.code != 3 or rounds >= args.keep_trying:
                raise
            rounds += 1
            print("fishCaveExport: %s" % e, file=sys.stderr)
            say("--keep-trying: waiting %g s, then carrying on from the saved counts (round %d of %d; Ctrl+C stops)" % (args.cooldown, rounds, args.keep_trying))
            time.sleep(args.cooldown)


def cmd_giants_once(args):
    server = check_server(args.server)
    if not args.datastack:
        raise Refusal("giants needs --datastack <name> (run `discover` first to see the names)")
    if args.top < 2:
        raise Refusal("--top must be at least 2")
    if args.chunk_rows < 1:
        raise Refusal("--chunk-rows must be at least 1")
    if args.retries < 0 or args.retry_wait < 0 or args.retry_max_wait < 0 or args.min_chunk_rows < 1 or args.keep_trying < 0 or args.cooldown < 0:
        raise Refusal("--retries, --retry-wait, --retry-max-wait, --keep-trying and --cooldown cannot be negative, and --min-chunk-rows must be at least 1")
    if args.out:
        Folder.check(args.out, giants_reusable(args.out))   # before the network is touched
    client = make_client(args, args.datastack)
    mat = client.materialize
    version = args.version if args.version is not None else plain_int(mat.most_recent_version())
    stamp = fmt(mat.get_timestamp(version))
    info = client.info.get_datastack_info(datastack_name=args.datastack)
    syn_table = args.synapse_table or info.get("synapse_table")
    if not syn_table:
        raise Refusal("the datastack names no synapse table; give --synapse-table")
    say("datastack %s, materialization version %s (%s), synapse table %s" % (args.datastack, version, stamp, syn_table))
    # 1. the cells that have a soma
    n_soma = plain_int(mat.get_annotation_count(args.soma_table, **kw_annotation_count(version)))
    if n_soma is None:
        raise Refusal("the server did not say how many rows the soma table %s has (is the name right? `discover` lists the tables)" % args.soma_table)
    if n_soma > args.scan_max_rows:
        raise Refusal("the soma table %s has %s rows, over --scan-max-rows %d; raise it" % (args.soma_table, n_soma, args.scan_max_rows))
    resolution = None
    if args.soma_voxel_nm:
        resolution = [float(x) for x in args.soma_voxel_nm.split(",")]
    else:
        try:
            resolution = list(mat.get_table_metadata(args.soma_table, **kw_table_metadata(version)).get("voxel_resolution") or [])
        except Exception:
            resolution = None
    if not resolution or len(resolution) != 3:
        raise Refusal("the voxel size of the soma table %s is not known; give --soma-voxel-nm 8,8,30 (what its table description says)" % args.soma_table)
    soma_rows = rows_of(call_with_retries(args, "the soma table", lambda: mat.query_table(args.soma_table, **kw_query_table(version, args.scan_max_rows))))
    cells = soma_points(soma_rows, resolution)
    if len(cells) < 10:
        raise Refusal("only %d cells with a soma were read from %s (columns pt_root_id, pt_position_x/y/z are needed)" % (len(cells), args.soma_table))
    say("%d cells have a soma (%s, voxel %s nm)" % (len(cells), args.soma_table, "x".join(fmt(x) for x in resolution)))
    roles, geometry = axis_roles([c["um"] for c in cells.values()])
    lr = roles["leftRight"]
    midline = args.midline if args.midline is not None else geometry["axes"][lr]["medianUm"]
    geometry.update({"midlineUm": midline, "midlineSource": "--midline" if args.midline is not None else "the median of the somas along the left-right axis", "somas": len(cells),
                     "cellTypes": dict(Counter(str(c["cell_type"]) for c in cells.values())), "somaVoxelNm": resolution})
    say("axes from the somas: front-back %s, left-right %s (midline %.1f um), top-bottom %s" % (geometry["frontBack"], geometry["leftRight"], midline, geometry["topBottom"]))
    # 2. the pass over the synapse table
    total = plain_int(mat.get_annotation_count(syn_table, **kw_annotation_count(version)))
    wanted = set(cells)
    resumed, auto, folder = False, False, None
    if args.resume:
        state = read_resume(args.resume, args, version, syn_table)
        resumed = True
        say("resuming at row %d with %d cells already counted" % (state["offset"], len(state["counts"])))
    else:
        state = None
        if not (args.fresh or args.sample or args.start_offset):   # the same command run again carries on from where the last one stopped
            folder, state, notes = find_unfinished(args, version, syn_table)
            for n in notes:
                say("note: " + n)
            if state is not None:
                resumed = auto = True
                say("found an unfinished pass in %s: row %d of about %s (%s), %d cells counted -- carrying on from there (--fresh starts over)" % (
                    folder, state["offset"], fmt(total), ("%.1f%%" % (100.0 * state["offset"] / total)) if total else "size unknown", len(state["counts"])))
        if state is None:
            state = {"counts": {}, "offset": args.start_offset, "rows": 0, "done": False, "table": syn_table}
    where = folder or args.out or "fish1_giants_" + now_utc().strftime("%Y%m%dT%H%M%SZ")
    out = Folder(where, giants_reusable(where))
    state["total"] = total
    mode = "sample" if args.sample else "pages"
    if args.sample:
        df = mat.query_table(syn_table, **kw_query_table_sample(version, args.sample, [PRE_ROOT, POST_ROOT]))
        pre, post = column_ints(df, PRE_ROOT), column_ints(df, POST_ROOT)
        for a, b in zip(pre, post):
            if a is None or b is None or a == b:
                continue
            if b in wanted:
                state["counts"].setdefault(b, [0, 0])[0] += 1
            if a in wanted:
                state["counts"].setdefault(a, [0, 0])[1] += 1
        state["rows"] = state["offset"] = len(pre)
        state["done"] = True
    else:
        count_degrees(mat, syn_table, version, args, wanted, state, out)
    coverage = (100.0 * state["rows"] / total) if total else None
    if not state["done"]:
        out.warnings.append("THE PASS DID NOT FINISH: %d of about %s rows were read (--pages %d stopped it); the counts are of those rows only. Run the same command again to carry on from there (or --resume %s)" % (state["rows"], fmt(total), args.pages, os.path.join(out.path, "giants_counts.partial.json")))
        say("WARNING: " + out.warnings[-1])
    elif not args.sample and total and state["rows"] < 0.99 * total:
        out.warnings.append("only %d of %s rows were read (%.1f%%): the server paged fewer rows than the table holds; the counts are lower bounds" % (state["rows"], fmt(total), coverage))
        say("WARNING: " + out.warnings[-1])
    # 3. rank, then look at the top again with positions
    ranked = sorted((r for r in state["counts"] if r in cells), key=lambda r: (-state["counts"][r][0], r))
    top = ranked[:args.top]
    rows_in, rows_out, pre_c, post_c = [], [], None, None
    if top:
        def partial_note():
            return ("The counts of the pass are saved in %s. " % os.path.join(out.path, PARTIAL_NAME) if os.path.exists(os.path.join(out.path, PARTIAL_NAME)) else "") + "Run the SAME command again: it skips the pass and asks for these two queries again."
        q_in = call_with_retries(args, "the synapses into the top cells", lambda: mat.synapse_query(**kw_synapse_query(version, args.max_rows, post_ids=top)), None, partial_note)
        q_out = call_with_retries(args, "the synapses out of the top cells", lambda: mat.synapse_query(**kw_synapse_query(version, args.max_rows, pre_ids=top)), None, partial_note)
        rows_in, rows_out = rows_of(q_in), rows_of(q_out)
        for q, label in ((rows_in, "synapses into the top cells"), (rows_out, "synapses out of the top cells")):
            if len(q) >= args.max_rows:
                out.warnings.append("TRUNCATED: %s returned the --max-rows limit of %d; raise --max-rows" % (label, args.max_rows))
                say("WARNING: " + out.warnings[-1])
        pre_c, post_c = pre_post_columns(columns_of(q_in) or columns_of(q_out))
    try:
        syn_res = list(mat.get_table_metadata(syn_table, **kw_table_metadata(version)).get("voxel_resolution") or [])
    except Exception:
        syn_res = []
    cands = []
    for rank, root in enumerate(top, 1):
        c = cells[root]
        summ = cell_summary(root, rows_out, rows_in, pre_c, post_c, {}, syn_res) if top else None
        box = (summ or {}).get("synapseBox") or {}
        cands.append({"rank": rank, "root": root, "soma": c, "um": c["um"], "inDegree": state["counts"][root][0], "outDegree": state["counts"][root][1], "exactIn": summ["synapsesIn"], "exactOut": summ["synapsesOut"],
                      "partnersIn": summ["partnersIn"], "extentUm": box.get("extentMicrometres"), "side": "below-midline" if c["um"][lr] < midline else "above-midline"})
    pairs = mirror_pairs(cands, roles, midline, args.pair_tol)
    mate = {}
    for pr in pairs:
        mate.setdefault(pr["rootA"], pr["rootB"])
        mate.setdefault(pr["rootB"], pr["rootA"])
    vr = [info.get("viewer_resolution_" + a) for a in "xyz"]
    def viewer(um):
        return [round(um[k] * 1000.0 / float(vr[k])) if vr[k] else "" for k in range(3)]
    top_rows = []
    for c in cands:
        ext = c["extentUm"] or ["", "", ""]
        v = viewer(c["um"])
        top_rows.append({"rank": c["rank"], "root_id": c["root"], "soma_id": c["soma"]["id"], "cell_type": c["soma"]["cell_type"], "soma_x_um": round(c["um"][0], 1), "soma_y_um": round(c["um"][1], 1), "soma_z_um": round(c["um"][2], 1),
                         "viewer_x": v[0], "viewer_y": v[1], "viewer_z": v[2], "in_degree": c["inDegree"], "out_degree": c["outDegree"], "partners_in": c["partnersIn"], "extent_x_um": ext[0], "extent_y_um": ext[1], "extent_z_um": ext[2],
                         "side_of_midline": c["side"], "mirror_partner": mate.get(c["root"], "")})
    out.csv("giants_top.csv", ["rank", "root_id", "soma_id", "cell_type", "soma_x_um", "soma_y_um", "soma_z_um", "viewer_x", "viewer_y", "viewer_z", "in_degree", "out_degree", "partners_in", "extent_x_um", "extent_y_um", "extent_z_um", "side_of_midline", "mirror_partner"], top_rows)
    out.csv("giants_pairs.csv", ["rootA", "rootB", "minIn", "maxIn", "ratio", "mirrorErrorUm"], pairs)
    out.json("soma_map.json", geometry)
    if state["done"] and os.path.exists(os.path.join(out.path, "giants_counts.partial.json")):   # a finished pass has its counts in giants_counts.json; a stopped one keeps the partial file for --resume
        os.remove(os.path.join(out.path, "giants_counts.partial.json"))
    out.json("giants_counts.json", {"datastack": args.datastack, "version": version, "table": syn_table, "mode": mode, "rowsRead": state["rows"], "tableRows": total, "counts": [[r, v[0], v[1]] for r, v in sorted(state["counts"].items())]})
    out.text("README.txt", "Fish1 big-neuron finder (tools/fishCaveExport.py giants) of datastack %s at materialization version %s (%s).\n"
             "giants_top.csv: the %d cells with a soma that receive the most synapses, with the soma position in micrometres and in viewer voxels (paste viewer_x, viewer_y, viewer_z into the viewer's position box), the synapses in and out counted over the synapse table, "
             "the box their synapses sit in, and the mirror partner if there is one. giants_pairs.csv: pairs of those cells that mirror each other across the midline (ranked by the smaller input count). soma_map.json: how the axes and the midline were chosen. "
             "giants_counts.json: every cell's counts. MANIFEST.json: sha256 of every file and the options. THIS IS A HEURISTIC: it lists candidates to look at in the viewer, it does not name the Mauthner cells. NO TOKEN IS IN ANY OF THESE FILES.\nCite: %s\n" % (args.datastack, version, stamp, len(top_rows), CITATION))
    import caveclient
    out.manifest({"command": "giants", "datastack": args.datastack, "server": server, "materializationVersion": version, "timestamp": stamp, "caveclient": getattr(caveclient, "__version__", None), "mode": mode,
                  "options": {"top": args.top, "chunkRows": args.chunk_rows, "pages": args.pages, "sample": args.sample, "midline": args.midline, "pairTol": args.pair_tol, "somaTable": args.soma_table, "synapseTable": syn_table, "resume": resumed, "autoResume": auto, "fresh": bool(args.fresh), "keepTrying": args.keep_trying, "retries": args.retries, "retryWait": args.retry_wait, "retryMaxWait": args.retry_max_wait, "minChunkRows": args.min_chunk_rows, "maxRows": args.max_rows},
                  "rowsRead": state["rows"], "tableRows": total, "coveragePercent": coverage, "finished": state["done"]}, token_from_env())
    say("\nTop cells by synapses received:")
    for r in top_rows[:15]:
        say("  %2d  root %s  in %5d  out %4d  soma (%.0f, %.0f, %.0f) um  viewer %s %s %s%s" % (r["rank"], r["root_id"], r["in_degree"], r["out_degree"], r["soma_x_um"], r["soma_y_um"], r["soma_z_um"], r["viewer_x"], r["viewer_y"], r["viewer_z"], ("  mirrors " + str(r["mirror_partner"])) if r["mirror_partner"] else ""))
    say("\nMirror pairs (%d), biggest first:" % len(pairs))
    for pr in pairs[:5]:
        say("  %s and %s: %d and %d synapses in, mirror error %.1f um" % (pr["rootA"], pr["rootB"], pr["minIn"], pr["maxIn"], pr["mirrorErrorUm"]))
    say("\nWrote %s/ (%d files). Upload giants_top.csv, giants_pairs.csv, soma_map.json and MANIFEST.json (giants_counts.json is large and not needed)." % (out.path, len(out.files) + 1))
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
    p.add_argument("command", choices=["token-help", "save-token", "discover", "export", "giants", "selftest-signatures"])
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
    p.add_argument("--soma-table", dest="soma_table", default="somas")
    p.add_argument("--synapse-table", dest="synapse_table")
    p.add_argument("--soma-voxel-nm", dest="soma_voxel_nm")
    p.add_argument("--top", type=int, default=60)
    p.add_argument("--chunk-rows", dest="chunk_rows", type=int, default=1000000)
    p.add_argument("--pages", type=int, default=0)
    p.add_argument("--start-offset", dest="start_offset", type=int, default=0)
    p.add_argument("--sample", type=int, default=0)
    p.add_argument("--resume")
    p.add_argument("--fresh", action="store_true")
    p.add_argument("--keep-trying", dest="keep_trying", type=int, default=0)
    p.add_argument("--cooldown", type=float, default=600.0)
    p.add_argument("--retries", type=int, default=DEFAULT_RETRIES)
    p.add_argument("--retry-wait", dest="retry_wait", type=float, default=DEFAULT_RETRY_WAIT)
    p.add_argument("--retry-max-wait", dest="retry_max_wait", type=float, default=DEFAULT_RETRY_MAX_WAIT)
    p.add_argument("--min-chunk-rows", dest="min_chunk_rows", type=int, default=DEFAULT_MIN_CHUNK_ROWS)
    p.add_argument("--midline", type=float)
    p.add_argument("--pair-tol", dest="pair_tol", type=float, default=25.0)
    return p


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    for a in argv:   # a token on a command line lands in shell history and in `ps`; refuse it by name, before anything else happens
        if a == "--token" or a.startswith("--token=") or a == "--auth-token" or a.startswith("--auth-token="):
            print("fishCaveExport: refusing %s -- a token on a command line is saved in your shell history and shown by `ps`. Use `save-token` (hidden prompt) or the CAVE_TOKEN environment variable." % a.split("=")[0], file=sys.stderr)
            return 2
    args = build_parser().parse_args(argv)
    try:
        if args.command in ("token-help", "save-token", "discover", "export", "giants"):
            args.server = check_server(args.server)   # once, here: every client below is built from the CHECKED address (no trailing slash, https)
        return {"token-help": cmd_token_help, "save-token": cmd_save_token, "discover": cmd_discover, "export": cmd_export, "giants": cmd_giants, "selftest-signatures": cmd_selftest_signatures}[args.command](args)
    except Refusal as e:
        print("fishCaveExport: %s" % e, file=sys.stderr)
        return 2
    except Stopped as e:   # the server gave up on us, or the person did: what was done is saved, and the message says how to carry on
        print("fishCaveExport: %s" % e, file=sys.stderr)
        return e.code
    except KeyboardInterrupt:
        print("fishCaveExport: stopped by you (Ctrl+C).", file=sys.stderr)
        return 130
    except Exception as e:   # a network or server error: say what, and what to check, without a traceback (a message from the HTTP layer carries a URL and never a token)
        print("fishCaveExport: %s: %s\nCheck the network (a VPN or proxy that blocks %s answers like this), the --server address and the token (python3 %s save-token)." % (type(e).__name__, str(e)[:300], args.server, sys.argv[0]), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
