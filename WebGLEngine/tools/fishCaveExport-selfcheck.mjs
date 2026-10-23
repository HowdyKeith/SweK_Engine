// WebGLEngine/tools/fishCaveExport-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/fishCaveExport-selfcheck.mjs      (~15 s; needs `python3`)
//
// THE GATE OF tools/fishCaveExport.py, THE SCRIPT KEITH RUNS ON HIS OWN MACHINE WITH HIS OWN TOKEN. The sandbox this tree is built in cannot reach the Fish1 CAVE server (global.brain-wire-test.org answers 403 to its proxy), so the script
// was written against caveclient's documented API and has NEVER TALKED TO THE REAL SERVER. This gate holds everything that can be held without it, and says in row 12 what it cannot:
//
//   1b token-help and save-token: the token comes from a hidden prompt, goes to save_token, and is printed nowhere; an empty one is refused
//   1  THE REFUSALS         a token on the command line (--token, --token=x, --auth-token) is refused by name before anything runs; a non-https server, an unknown hop count, an export without a datastack, a folder that is not empty, and a Python without
//                           caveclient (the install line is printed) are each refused with the reason and exit 2
//   2  DISCOVER             against a STAND-IN caveclient (a package this gate writes into a temp folder: the datastacks, a datastack info, five tables with counts, metadata and rows, a synapse table that filters like the real one): discover.json lists the
//                           datastacks and every table with its count, columns and at most five sample rows, flags the synapse table; tables.csv has a row a table; the client was built with https, max_retries 3 and the token the ENVIRONMENT held
//   3  THE SEARCH           export finds the two Mauthner cells by the default regexp in the cell-type table (both branches of it: "Mauthner" and "M-cell"), reports each match with its table and column, and DOWNLOADS NEITHER the synapse table NOR a table over
//                           --scan-max-rows (the stand-in's log shows no query_table for them); decoys that look like the pattern but are not it ("somatic cell", "mitral cell") do not match
//   4  THE SYNAPSES         synapses_out.csv and synapses_in.csv hold exactly the synapses the fixture says (autapses and root-id-0 rows left out, as the real query's flags ask), partners.csv ranks the strongest partners with ties by id, edges.csv holds the pair
//                           counts and summed sizes worked out by hand, synapses_circuit.csv (hops 2) holds the synapses AMONG the cells and their top partners and nothing else; --hops 1 writes no circuit file; labels.csv has the cell-type rows
//   5  THE OPTIONS          --root-ids skips the search (no query_table at all); --max-rows flags a query that hit the limit as TRUNCATED in the warnings and the manifest; --version reaches every call; --tables searches only those; no match writes
//                           mauthner_candidates.json and the manifest and exits 2 without a synapse query
//   6  THE MANIFEST         lists every file with its bytes and sha256 (recomputed here), the materialization version and timestamp, the options, the citation -- and a planted token in a text column of a table STOPS THE SCRIPT (the folder is checked for the token last)
//   7  NO TOKEN ANYWHERE    the environment token appears in no file the script wrote, nor in its stdout or stderr, on any path above
//   8  THE LIBRARY          `selftest-signatures` binds every keyword the script passes to the signature of the INSTALLED caveclient. THAT IS THE ONLY CONTACT WITH THE REAL LIBRARY: it runs when a Python with caveclient is found (FISH_CAVE_PYTHON, or python3),
//                           and says NOT CHECKED HERE when none is
//   9  A REAL DATAFRAME     when that Python also has pandas, the stand-in returns real pandas DataFrames and the whole export is run again: numpy integers, NaN and the column types the real library returns reach the CSV as plain text
//
// WHAT THIS CANNOT HOLD (SAID PLAINLY): that the server's tables are named what the script expects (it searches EVERY table, so the names do not matter, but the id columns must end in `root_id`, as the CAVE materialization's do); that `synapse_query`'s
// columns are `pre_pt_root_id`/`post_pt_root_id`/`size` (the script finds the pre/post columns by their names and refuses with the column list if it cannot); that the account's token reaches the datastack; that a 5,000,000-row query finishes. `discover` is the
// first thing to run for exactly this reason, and what it writes tells us which of these held.
//
// SABOTAGE LOG (70 mutants of tools/fishCaveExport.py, each applied in a scratch tree and the gate run on it with FISH_CAVE_PYTHON set to a Python that has caveclient 8.2.1 and pandas, so that sections 8 and 9 can go red; the number is how many rows
//   went red): C01 --token allowed 2; C02 --auth-token allowed 2; C03 --token= (with an equals sign) allowed 2; C04 a non-https server allowed 1; C05 localhost refused as well 1; C06 a string that is not a URL accepted 1; C07 the trailing slash kept 1; C08 the checked server not used 1; C09 the token not handed to the client 1; C10 max_retries 0 1; C11 the datastack not handed to the client 1; C12 a non-empty folder written into 1; C13 the manifest has no digests 1; C14 the manifest has no byte counts 1; C15 the token scan dropped 1; C16 the token scan skips a short token (threshold 99) 1; C17 the manifest leaves its files out 1; C18 the manifest leaves the citation out 1; C19 the search is case-sensitive 5; C20 the default pattern has no M-cell branch 10; C21 the default pattern matches any cell 11; C22 the synapse table is searched 1; C23 the scan limit ignored 8; C24 the scan limit one too strict 1; C25 any column ending in id is an id 6; C26 a zero id is an id 1; C27 partners tie to the larger id 6; C28 the cells are partners of themselves (out) 5; C29 the cells are partners of themselves (in) 5; C30 --max-partners ignored 6; C31 hops 1 writes a circuit as well 1; C32 the circuit query asks for pre only 2; C33 a synapse in both queries counted twice 1; C34 the edge sizes are not summed 1; C35 a query at the row limit not flagged 1; C36 the truncation not said on screen 1; C37 the row limit not passed 2; C38 zero ids asked for 2; C39 autapses kept 5; C40 positions not split 1; C41 metadata asked for in synapse queries 1; C42 the version not passed to synapse queries 2; C43 the version not passed to table queries 1; C44 the version not passed to the table list 1; C45 the version not passed to the counts 1; C46 --version ignored 1; C47 the sample is fifty rows 1; C48 discover forgets the datastack info 1; C49 discover forgets the timestamp 1; C50 the synapse table never flagged 2; C51 --datastack ignored by discover 1; C52 no candidates file when nothing matches 2; C53 --root-ids reads only the first id 1; C54 labels for every scanned neuron 1; C55 the manifest swaps cells and circuit 2; C56 --tables ignored 1; C57 hops not validated 1; C58 the datastack not required 1; C59 a blank CAVE_TOKEN is a token 1; C60 save-token does not trim 2; C61 an empty token saved 1; C62 save-token echoes the token 2; C63 token-help opens a browser 1; C64 a network error is a clean exit 1; C65 a refusal exits 1 8; C66 the error message carries the whole exception text 1; C67 selftest-signatures always passes 1; C68 a probe keyword dropped from the client call 1; C69 an id written as a float 8; C70 a NaN written as the text nan 1.
//   THREE WENT 0 RED THE FIRST TIME AND EACH GOT A ROW: C53 (--root-ids reading only its first id: the one row that used --root-ids gave one id), C66 (the error text not cut: no test had a long one), C70 (a NaN written as the text 'nan': no fixture had a NaN).
//   C20 (the default pattern without its M-cell branch) went 10 red, one of them the zero-id row, because the fixture's second cell is called "M-cell right". C67 and C68 are red ONLY with the real library found (section 8); without one the gate says NOT CHECKED HERE for it.
//   THE GATE FOUND TWO DEFECTS IN THE SCRIPT BEFORE THE MUTANTS: the checked server address (trailing slash dropped, https enforced) was computed and then not used to build the clients; and a synapse that joins two of the cells is in BOTH the synapses
//   out of them and the synapses into them, which edges.csv counted twice in the --hops 1 case (the fixture has such a synapse now). A THIRD CAME FROM RUNNING THE SCRIPT'S CONSTRUCTOR AGAINST THE REAL LIBRARY IN THE SANDBOX: caveclient talks to the server
//   when the client is built, which the sandbox's proxy refuses, and the script died with a traceback; it now says what failed and what to check.
//   ONCE, BY HAND, AGAINST THE REAL LIBRARY (not in the mutant runs): `selftest-signatures` on caveclient 8.2.1 in a scratch venv: 13 of 13 probes bind. The script has never talked to the real server.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ENG, "tools", "fishCaveExport.py");
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const note = (t) => console.log("  ----  " + t);

console.log("fishCaveExport-selfcheck -- the script that exports the Mauthner circuit, held against a stand-in server\n");

const PY = process.env.PYTHON || "python3";
const probe = spawnSync(PY, ["--version"], { encoding: "utf8" });
if (probe.status !== 0) {
    note("NOT CHECKED HERE: no `" + PY + "` on this machine, so none of tools/fishCaveExport.py was run. Set PYTHON to a Python 3.9+.");
    finished = true; console.log("\nfishCaveExport-selfcheck: all checks pass (nothing was run)"); process.exit(0);
}
const REAL = process.env.FISH_CAVE_PYTHON || PY;
const hasMod = (py, m) => spawnSync(py, ["-c", "import " + m], { encoding: "utf8" }).status === 0;

// ---- the stand-in caveclient --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const TOKEN = "tok_SECRET_9f3c1a77e2";
const FIXTURE = {
    datastacks: ["fish1_test", "fish1_other"], version: 42, timestamp: "2026-09-15T00:00:00+00:00", datastack_info: { synapse_table: "synapses", soma_table: "soma", aligned_volume: "fish1" },
    tables: {
        synapses: { count: 31000000, schema: "synapse", rows: [] },
        soma: { count: 4, schema: "nucleus_detection", rows: [{ id: 1, pt_root_id: 1001, label: "soma" }, { id: 2, pt_root_id: 1002, label: "soma" }, { id: 3, pt_root_id: 2001, label: "soma" }, { id: 4, pt_root_id: 2002, label: "soma" }] },
        cell_types: { count: 5, schema: "cell_type_local", rows: [
            { id: 1, pt_root_id: 1001, cell_type: "Mauthner cell, left", status: "proofread" }, { id: 2, pt_root_id: 1002, cell_type: "M-cell right", status: "proofread" },
            { id: 3, pt_root_id: 2001, cell_type: "reticulospinal", status: "draft" }, { id: 4, pt_root_id: 2002, cell_type: "somatic cell", status: "draft" }, { id: 5, pt_root_id: 2003, cell_type: "mitral cell", status: "draft" }] },
        big_table: { count: 10000000, schema: "big", rows: [{ id: 1, pt_root_id: 9999, note: "Mauthner" }] },
        notes: { count: 7, schema: "note", rows: [{ id: 1, pt_root_id: 2004, note: "a note" }, { id: 2, pt_root_id: 2005, note: "another" }, { id: 3, pt_root_id: 2006, note: "n3" }, { id: 4, pt_root_id: 2007, note: "n4" }, { id: 5, pt_root_id: 2008, note: "n5" }, { id: 6, pt_root_id: 2009, note: "n6" }, { id: 7, pt_root_id: 2010, note: "n7" }] },
    },
};
// synapses: [pre, post, size]
const S = [];
const add = (pre, post, sizes) => sizes.forEach((s) => S.push([pre, post, s]));
add(1001, 2001, [100, 200, 300]); add(1001, 2002, [50]); add(1002, 2001, [10, 20]); add(1002, 2003, [500]);
add(2004, 1001, [10, 10, 10, 10]); add(2001, 1001, [7]); add(2004, 1002, [10, 10]); add(2005, 1002, [5]);
add(2001, 2002, [3, 5]); add(2004, 2001, [9]); add(3001, 2001, [1, 1, 1, 1, 1]);
add(1001, 1002, [33]);   // one cell onto the other: it is in BOTH the synapses out of the cells and the synapses into them, and must count once
add(1001, 1001, [77]);   // an autapse: the real query leaves it out when remove_autapses is true
add(1001, 0, [4, 4]);    // an unproofread partner (root id 0): left out when include_zeros is false
FIXTURE.synapses = S;

const STUB = String.raw`
import json, os
_fix = json.load(open(os.environ["FAKE_CAVE_FIXTURE"]))
_log = os.environ["FAKE_CAVE_LOG"]
try:
    import pandas as _pd
except ImportError:
    _pd = None
__version__ = "0.0-standin"

def _write(entry):
    with open(_log, "a") as f:
        f.write(json.dumps(entry, default=str) + "\n")

class _MiniDF:
    def __init__(self, rows, columns):
        self._rows, self.columns = rows, columns
    def to_dict(self, orient):
        assert orient == "records"
        return [dict(r) for r in self._rows]
    def __len__(self):
        return len(self._rows)

def _df(rows, columns):
    if _pd is not None and os.environ.get("FAKE_CAVE_PANDAS") == "1":
        return _pd.DataFrame(rows, columns=columns)
    return _MiniDF(rows, columns)

class _Info:
    def get_datastacks(self):
        _write({"call": "get_datastacks"}); return list(_fix["datastacks"])
    def get_datastack_info(self, datastack_name=None):
        _write({"call": "get_datastack_info", "datastack_name": datastack_name}); return dict(_fix["datastack_info"])

class _Mat:
    def most_recent_version(self):
        _write({"call": "most_recent_version"}); return _fix["version"]
    def get_timestamp(self, version=None, datastack_name=None):
        _write({"call": "get_timestamp", "version": version}); return _fix["timestamp"]
    def get_tables(self, datastack_name=None, version=None):
        _write({"call": "get_tables", "version": version}); return list(_fix["tables"])
    def get_annotation_count(self, table_name, datastack_name=None, version=None):
        _write({"call": "get_annotation_count", "table": table_name, "version": version}); return _fix["tables"][table_name]["count"]
    def get_table_metadata(self, table_name, datastack_name=None, version=None, log_warning=True):
        _write({"call": "get_table_metadata", "table": table_name, "version": version}); t = _fix["tables"][table_name]
        return {"schema": t["schema"], "description": "stand-in table " + table_name, "voxel_resolution": [8, 8, 30]}
    def query_table(self, table, limit=None, split_positions=False, materialization_version=None, metadata=True, **kw):
        _write({"call": "query_table", "table": table, "limit": limit, "split_positions": split_positions, "version": materialization_version, "metadata": metadata})
        rows = list(_fix["tables"][table]["rows"])
        if limit is not None: rows = rows[:limit]
        cols = list(rows[0].keys()) if rows else []
        return _df(rows, cols)
    def synapse_query(self, pre_ids=None, post_ids=None, materialization_version=None, remove_autapses=True, include_zeros=True, limit=None, split_positions=False, metadata=True, **kw):
        _write({"call": "synapse_query", "pre_ids": pre_ids, "post_ids": post_ids, "version": materialization_version, "remove_autapses": remove_autapses, "include_zeros": include_zeros, "limit": limit, "split_positions": split_positions, "metadata": metadata})
        pre = set(pre_ids) if pre_ids is not None else None; post = set(post_ids) if post_ids is not None else None
        rows = []
        for i, (a, b, size) in enumerate(_fix["synapses"]):
            if pre is not None and a not in pre: continue
            if post is not None and b not in post: continue
            if remove_autapses and a == b: continue
            if not include_zeros and not _fix.get("leak_zero") and (a == 0 or b == 0): continue
            rows.append({"id": 100000 + i, "pre_pt_root_id": a, "post_pt_root_id": b, "size": (float("nan") if _fix.get("nan_size") and i == 0 else size), "ctr_pt_position_x": 10 * i, "ctr_pt_position_y": 20 * i, "ctr_pt_position_z": 3 * i})
        if limit is not None: rows = rows[:limit]
        return _df(rows, ["id", "pre_pt_root_id", "post_pt_root_id", "size", "ctr_pt_position_x", "ctr_pt_position_y", "ctr_pt_position_z"])

class _Auth:
    def get_new_token(self, open=False, no_text=False):
        _write({"call": "get_new_token", "open": open}); print("Go to https://example.invalid/token to make a token")
    def save_token(self, token=None, **kw):
        _write({"call": "save_token", "token_len": len(token or "")})

class CAVEclient:
    def __init__(self, datastack_name=None, server_address=None, auth_token=None, max_retries=None, **kw):
        _write({"call": "CAVEclient", "datastack_name": datastack_name, "server_address": server_address, "auth_token": "<present>" if auth_token else None, "max_retries": max_retries, "extra": sorted(kw)})
        if _fix.get("fail_construct"): raise ConnectionError("HTTPSConnectionPool(host='global.brain-wire-test.org', port=443): Max retries exceeded with url: /info/version" + ("; " + "x" * 1000 if _fix.get("long_message") else ""))
        self.info, self.materialize, self.auth = _Info(), _Mat(), _Auth()
`;

const work = fs.mkdtempSync(path.join(os.tmpdir(), "fishcave_"));
const stubDir = path.join(work, "stub"); fs.mkdirSync(path.join(stubDir, "caveclient"), { recursive: true });
fs.writeFileSync(path.join(stubDir, "caveclient", "__init__.py"), STUB);
const fixFile = path.join(work, "fixture.json");
const writeFixture = (f) => fs.writeFileSync(fixFile, JSON.stringify(f));
writeFixture(FIXTURE);
let runNo = 0;
/** Run the script with the stand-in on PYTHONPATH (unless `stub` is false) and a clean log; returns { status, stdout, stderr, log, out }. */
function run(args, { stub = true, env = {}, cwd = work, py = PY, input = undefined, pandas = false } = {}) {
    const log = path.join(work, `log${++runNo}.jsonl`);
    const e = { ...process.env, ...env, FAKE_CAVE_FIXTURE: fixFile, FAKE_CAVE_LOG: log, FAKE_CAVE_PANDAS: pandas ? "1" : "0" };
    if (stub) e.PYTHONPATH = stubDir; else delete e.PYTHONPATH;
    const r = spawnSync(py, [SCRIPT, ...args], { encoding: "utf8", env: e, cwd, input, timeout: 120000 });
    const lines = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "", log: lines };
}
const outDir = (n) => path.join(work, n);
const rd = (d, f) => fs.readFileSync(path.join(d, f), "utf8");
const parseCsv = (t) => { const rows = []; let row = [], cur = "", q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; } else cur += c; } if (cur !== "" || row.length) { row.push(cur); rows.push(row); } return rows; };
const csvRows = (d, f) => { const [h, ...rs] = parseCsv(rd(d, f)); return rs.map((r) => Object.fromEntries(h.map((c, i) => [c, r[i]]))); };
const allText = (d) => fs.readdirSync(d).map((f) => rd(d, f)).join("\n");
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const E = { CAVE_TOKEN: TOKEN };
let leaks = [];   // every stdout/stderr/folder checked for the token, for row 7
const watch = (r, d) => { leaks.push(r.stdout + r.stderr); if (d && fs.existsSync(d)) leaks.push(allText(d)); };

sec("1. the refusals");
{
    const r1 = run(["--token", "abc", "discover"], { env: E }), r2 = run(["discover", "--token=abc"], { env: E }), r3 = run(["export", "--auth-token", "abc"], { env: E });
    ok("!! A TOKEN ON THE COMMAND LINE IS REFUSED BY NAME, before the script does anything: --token, --token=x and --auth-token each exit 2, name the reason (shell history, ps) and the safe routes, and the stand-in client was never built", [r1, r2, r3].every((r) => r.status === 2 && /command line/.test(r.stderr) && /save-token/.test(r.stderr) && /CAVE_TOKEN/.test(r.stderr) && r.log.length === 0));
    const r4 = run(["discover", "--server", "http://global.example.org"], { env: E }), r5 = run(["discover", "--server", "ftp://x"], { env: E }), r5b = run(["discover", "--server", "http://localhost:8080", "--out", outDir("ok_local")], { env: E });
    ok("!! A SERVER THAT IS NOT HTTPS IS REFUSED (a token must not cross the network in the clear) -- except localhost, which is how a test server is reached; a string that is not a URL is refused too", r4.status === 2 && /https/.test(r4.stderr) && r4.log.length === 0 && r5.status === 2 && r5b.status === 0);
    const r6 = run(["export", "--out", outDir("e0")], { env: E }), r7 = run(["export", "--datastack", "fish1_test", "--hops", "3", "--out", outDir("e0b")], { env: E });
    ok("export without --datastack, and --hops other than 1 or 2, are refused with the reason and exit 2", r6.status === 2 && /--datastack/.test(r6.stderr) && r7.status === 2 && /--hops/.test(r7.stderr));
    fs.mkdirSync(outDir("full"), { recursive: true }); fs.writeFileSync(path.join(outDir("full"), "x.txt"), "x");
    const r8 = run(["discover", "--out", outDir("full")], { env: E });
    ok("!! AN OUTPUT FOLDER THAT IS NOT EMPTY IS REFUSED (the script never overwrites), and the file in it is untouched", r8.status === 2 && /not empty/.test(r8.stderr) && rd(outDir("full"), "x.txt") === "x" && fs.readdirSync(outDir("full")).length === 1);
    const nocave = hasMod(PY, "caveclient");
    if (nocave) note("NOT CHECKED HERE: " + PY + " has caveclient installed, so 'no caveclient' cannot be shown on this machine");
    else { const r9 = run(["discover", "--out", outDir("nocave")], { stub: false, env: E }); ok("!! A PYTHON WITHOUT caveclient SAYS HOW TO INSTALL IT (python3 -m pip install caveclient) and exits 2, and writes no folder of results", r9.status === 2 && /pip install caveclient/.test(r9.stderr) && !fs.existsSync(path.join(outDir("nocave"), "MANIFEST.json"))); }
    const long = JSON.parse(JSON.stringify(FIXTURE)); long.fail_construct = true; long.long_message = true; writeFixture(long);
    const r11 = run(["discover", "--out", outDir("dead2")], { env: E });
    ok("a very long error text is cut (300 characters of it), so a page of HTML from a proxy does not flood the screen", r11.status === 1 && /ConnectionError/.test(r11.stderr) && !r11.stderr.includes("x".repeat(400)) && r11.stderr.length < 900);
    const dead = JSON.parse(JSON.stringify(FIXTURE)); dead.fail_construct = true; writeFixture(dead);
    const r10 = run(["discover", "--out", outDir("dead")], { env: E }); writeFixture(FIXTURE);
    ok("!! A SERVER THAT CANNOT BE REACHED (a proxy that blocks the host answers like this) IS A MESSAGE AND NOT A TRACEBACK: exit 1, the error's type and text, and what to check (the network, --server, the token), and no output folder with results", r10.status === 1 && /ConnectionError/.test(r10.stderr) && /Check the network/.test(r10.stderr) && !/Traceback/.test(r10.stderr) && !fs.existsSync(path.join(outDir("dead"), "discover.json")) && !r10.stderr.includes(TOKEN));
    [r1, r2, r3, r4, r5, r5b, r6, r7, r8, r10, r11].forEach((r) => watch(r));
}

sec("1b. token-help and save-token");
{
    const th = run(["token-help"], { env: E }); watch(th);
    ok("token-help asks the library for the instructions (without opening a browser) and then points at `save-token` and the CAVE_TOKEN variable -- it prints no token", th.status === 0 && th.log.some((c) => c.call === "get_new_token" && c.open === false) && /example\.invalid\/token/.test(th.stdout) && /save-token/.test(th.stdout) && /CAVE_TOKEN/.test(th.stdout));
    // getpass would open /dev/tty on a machine that has one and wait for a person: the prompt is replaced by a function that returns a known string, in a Python that imports the script as a module
    const harness = (reply) => ["-c", "import sys, getpass; sys.path.insert(0, " + JSON.stringify(path.join(ENG, "tools")) + "); getpass.getpass = lambda p='': " + JSON.stringify(reply) + "; import fishCaveExport as m; sys.exit(m.main(['save-token']))"];
    const logS = path.join(work, "log_save.jsonl"), envS = { ...process.env, PYTHONPATH: stubDir, FAKE_CAVE_FIXTURE: fixFile, FAKE_CAVE_LOG: logS, FAKE_CAVE_PANDAS: "0" };
    const sv = spawnSync(PY, harness("  " + TOKEN + "  "), { encoding: "utf8", env: envS }), svLog = fs.existsSync(logS) ? fs.readFileSync(logS, "utf8") : "";
    ok("!! save-token READS THE TOKEN FROM A HIDDEN PROMPT (never an argument), trims it, hands it to caveclient's save_token (the stand-in logs only its length, " + TOKEN.length + "), and PRINTS NOTHING OF IT", sv.status === 0 && new RegExp('"token_len": ' + TOKEN.length + "[,}]").test(svLog.replace(/"token_len":\s*/g, '"token_len": ')) && !sv.stdout.includes(TOKEN) && !sv.stderr.includes(TOKEN) && /Saved/.test(sv.stdout));
    watch(sv);
    const logE = path.join(work, "log_save2.jsonl"), sv2 = spawnSync(PY, harness("   "), { encoding: "utf8", env: { ...envS, FAKE_CAVE_LOG: logE } });
    ok("an empty token is refused (exit 2) and save_token is never called", sv2.status === 2 && /no token entered/.test(sv2.stderr) && !(fs.existsSync(logE) && /save_token/.test(fs.readFileSync(logE, "utf8"))));
}

sec("2. discover");
const D = outDir("disc"), rd1 = run(["discover", "--out", D], { env: E });
watch(rd1, D);
{
    const j = JSON.parse(rd(D, "discover.json")), ds = j.details.fish1_test, tabs = Object.fromEntries((ds.tables || []).map((t) => [t.table, t]));
    ok("!! discover lists the datastacks the account can reach and, for each, the materialization version, its timestamp, the datastack info and EVERY table with its row count, metadata, columns and at most five sample rows; the synapse table is flagged", rd1.status === 0 && j.datastacks.join() === "fish1_test,fish1_other" && Object.keys(j.details).sort().join() === "fish1_other,fish1_test" && ds.materializationVersion === 42 && /2026-09-15/.test(ds.timestamp) && ds.datastackInfo.synapse_table === "synapses"
        && Object.keys(tabs).join() === "synapses,soma,cell_types,big_table,notes" && tabs.notes.count === 7 && tabs.notes.sample.length === 5 && tabs.cell_types.count === 5 && tabs.cell_types.columns.join() === "id,pt_root_id,cell_type,status" && tabs.cell_types.sample.length === 5 && tabs.cell_types.sample[0].cell_type === "Mauthner cell, left" && tabs.big_table.sample.length === 1 && tabs.synapses.isSynapseTable === true && tabs.soma.isSynapseTable === false
        && tabs.soma.metadata.schema === "nucleus_detection");
    const t = csvRows(D, "tables.csv");
    ok("tables.csv has a row per table per datastack (10: five tables, two datastacks), with the count, schema and columns, and the synapse table marked", t.length === 10 && t.filter((r) => r.datastack === "fish1_test").length === 5 && t.find((r) => r.datastack === "fish1_test" && r.table === "big_table").count === "10000000" && t.find((r) => r.datastack === "fish1_test" && r.table === "synapses").synapse_table === "true");
    const ctor = rd1.log.filter((c) => c.call === "CAVEclient");
    ok("!! the clients are built over https at the default server with max_retries 3, the datastack client per datastack, and the token the ENVIRONMENT held (the stand-in logs only that one was present)", ctor.length === 3 && ctor[0].server_address === "https://global.brain-wire-test.org" && ctor[0].datastack_name === null && ctor.slice(1).map((c) => c.datastack_name).join() === "fish1_test,fish1_other" && ctor.every((c) => c.auth_token === "<present>" && c.max_retries === 3));
    const rdOne = run(["discover", "--datastack", "fish1_other", "--out", outDir("disc1")], { env: E }); watch(rdOne, outDir("disc1"));
    ok("--datastack limits discover to that datastack (one datastack client, one set of tables), and the manifest names the datastack asked for", rdOne.status === 0 && Object.keys(JSON.parse(rd(outDir("disc1"), "discover.json")).details).join() === "fish1_other" && JSON.parse(rd(outDir("disc1"), "MANIFEST.json")).datastack === "fish1_other");
    const noTok = run(["discover", "--out", outDir("disc2")], {}); watch(noTok, outDir("disc2"));
    ok("with NO token in the environment the client is built without one (caveclient then reads the token it saved), and the run still works", noTok.status === 0 && noTok.log.filter((c) => c.call === "CAVEclient").every((c) => c.auth_token === null));
}

sec("3. the search");
const X = outDir("exp"), rx = run(["export", "--datastack", "fish1_test", "--out", X, "--max-partners", "3"], { env: E });
watch(rx, X);
const cand = rx.status === 0 ? JSON.parse(rd(X, "mauthner_candidates.json")) : { matches: [], scanned: [], skipped: [], ids: [] };
{
    ok("!! export FINDS THE TWO CELLS by the default regexp, in both of its branches (\"Mauthner cell, left\" and \"M-cell right\"), reports each match with its table, column and value, and does NOT match \"somatic cell\", \"mitral cell\" or \"reticulospinal\"", rx.status === 0 && cand.ids.join() === "1001,1002" && cand.matches.length === 2 && cand.matches.every((m) => m.table === "cell_types" && m.column === "cell_type") && cand.matches.map((m) => m.value).join() === "Mauthner cell, left,M-cell right");
    const q = rx.log.filter((c) => c.call === "query_table").map((c) => c.table);
    ok("!! THE SYNAPSE TABLE AND A TABLE OVER --scan-max-rows ARE NOT DOWNLOADED TO BE SEARCHED: query_table was called for soma, cell_types and notes and for nothing else; the skipped list says why (the synapse table; 10000000 rows over the limit)", q.join() === "soma,cell_types,notes" && cand.skipped.some((s) => s.table === "synapses" && /synapse table/.test(s.why)) && cand.skipped.some((s) => s.table === "big_table" && /10000000/.test(s.why)) && cand.scanned.map((s) => s.table).join() === "soma,cell_types,notes");
    const calls = rx.log.filter((c) => ["query_table", "synapse_query", "get_tables", "get_annotation_count"].includes(c.call));
    ok("!! one materialization version reaches EVERY query: the most recent one (42), asked once, in the table list, the counts, the table queries and the synapse queries (root ids change with proofreading)", rx.log.filter((c) => c.call === "most_recent_version").length === 1 && calls.length > 8 && calls.every((c) => c.version === 42) && JSON.parse(rd(X, "MANIFEST.json")).materializationVersion === 42);
    const scanq = rx.log.filter((c) => c.call === "query_table");
    ok("the table queries ask for scalar positions (split_positions) and the scan limit, and no metadata dictionary", scanq.every((c) => c.split_positions === true && c.limit === 300000 && c.metadata === false));
}

sec("4. the synapses");
{
    const out = csvRows(X, "synapses_out.csv"), inn = csvRows(X, "synapses_in.csv");
    const pair = (rs, a, b) => rs.filter((r) => r.pre_pt_root_id === String(a) && r.post_pt_root_id === String(b)).length;
    ok("!! synapses_out.csv holds the 8 synapses out of the cells and synapses_in.csv the 9 into them (the one from cell 1001 onto cell 1002 is in both) -- the autapse (1001 -> 1001) and the two synapses onto root id 0 are NOT there, because the query asks the server to leave them out -- with every column the server returned (id, the pre and post root ids, size, the split position)", out.length === 8 && inn.length === 9 && pair(out, 1001, 1002) === 1 && pair(inn, 1001, 1002) === 1 && pair(out, 1001, 2001) === 3 && pair(out, 1001, 2002) === 1 && pair(out, 1002, 2001) === 2 && pair(out, 1002, 2003) === 1 && pair(inn, 2004, 1001) === 4 && pair(inn, 2001, 1001) === 1 && pair(inn, 2004, 1002) === 2 && pair(inn, 2005, 1002) === 1 && !out.some((r) => r.post_pt_root_id === "0" || r.pre_pt_root_id === r.post_pt_root_id)
        && Object.keys(out[0]).join() === "id,pre_pt_root_id,post_pt_root_id,size,ctr_pt_position_x,ctr_pt_position_y,ctr_pt_position_z");
    const sq = rx.log.filter((c) => c.call === "synapse_query");
    ok("!! the synapse queries are the three the design says, in order, with the flags it says: pre_ids = the cells; post_ids = the cells; pre_ids = post_ids = the cells and their top partners (remove_autapses, include_zeros false, split_positions, no metadata, the --max-rows limit)", sq.length === 3 && sq[0].pre_ids.join() === "1001,1002" && sq[0].post_ids === null && sq[1].post_ids.join() === "1001,1002" && sq[1].pre_ids === null && sq[2].pre_ids.join() === sq[2].post_ids.join() && sq.every((c) => c.remove_autapses === true && c.include_zeros === false && c.split_positions === true && c.metadata === false && c.limit === 5000000));
    const part = csvRows(X, "partners.csv");
    ok("!! partners.csv ranks the partners of the cells by their synapses with the cells (in + out), TIES BY THE SMALLER ID, and keeps --max-partners (3): 2001 (6: 5 out of the cells, 1 into them... worked out by hand: 3 + 2 from the cells and 1 to them), 2004 (6), then 2002 (1) -- the cells themselves are never partners", part.map((p) => p.partner_root_id).join() === "2001,2004,2002" && part[0].synapses_from_cells === "1" && part[0].synapses_to_cells === "5" && part[0].total === "6" && part[1].synapses_from_cells === "6" && part[1].synapses_to_cells === "0" && part[2].total === "1");
    ok("the circuit query asks for exactly the cells and their top partners: 1001, 1002, 2001, 2002, 2004", sq[2].pre_ids.join() === "1001,1002,2001,2002,2004");
    const circ = csvRows(X, "synapses_circuit.csv");
    ok("!! synapses_circuit.csv holds only the synapses AMONG those five neurons (17: 7 out of the cells, 7 into them, 3 among the partners) -- once each, the one from cell 1001 onto cell 1002 included: not 1002 -> 2003, not 2005 -> 1002, not 3001 -> 2001", circ.length === 17 && circ.filter((r) => r.pre_pt_root_id === "1001" && r.post_pt_root_id === "1002").length === 1 && !circ.some((r) => ["2003", "2005", "3001"].some((x) => r.pre_pt_root_id === x || r.post_pt_root_id === x)) && circ.every((r) => ["1001", "1002", "2001", "2002", "2004"].includes(r.pre_pt_root_id) && ["1001", "1002", "2001", "2002", "2004"].includes(r.post_pt_root_id)));
    const edges = csvRows(X, "edges.csv"), ed = (a, b) => edges.find((r) => r.pre_root_id === String(a) && r.post_root_id === String(b));
    ok("!! edges.csv has one row per pre -> post pair of the circuit with the synapse count and the summed size, worked out by hand: 1001>2001 3 / 600, 1001>2002 1 / 50, 1002>2001 2 / 30, 2004>1001 4 / 40, 2001>1001 1 / 7, 2004>1002 2 / 20, 2001>2002 2 / 8, 2004>2001 1 / 9 -- nine pairs, sorted -- 1001>1002 1 / 33, the cell-onto-cell synapse, ONCE", edges.length === 9 && ed(1001, 1002) && ed(1001, 1002).synapses === "1" && ed(1001, 1002).total_size === "33" && [[1001, 2001, 3, 600], [1001, 2002, 1, 50], [1002, 2001, 2, 30], [2004, 1001, 4, 40], [2001, 1001, 1, 7], [2004, 1002, 2, 20], [2001, 2002, 2, 8], [2004, 2001, 1, 9]].every(([a, b, n, s]) => ed(a, b) && ed(a, b).synapses === String(n) && ed(a, b).total_size === String(s)));
    const lab = csvRows(X, "labels.csv");
    ok("labels.csv has the rows of every table that names a neuron IN the circuit (1001, 1002, 2001, 2002, 2004: the cell-type rows, the soma rows, 2004's note), each with its table and its text columns as JSON, and none of a neuron outside it (2003, 2005, 9999)", lab.some((r) => r.root_id === "1001" && r.table === "cell_types" && /Mauthner cell, left/.test(r.text_columns.replace(/""/g, '"'))) && lab.some((r) => r.root_id === "1002" && r.table === "cell_types") && lab.some((r) => r.root_id === "2001" && r.table === "cell_types") && lab.some((r) => r.root_id === "2004" && r.table === "notes") && !lab.some((r) => ["2003", "2005", "9999"].includes(r.root_id)));
}

sec("5. the options");
{
    const H = outDir("hops1"), r1 = run(["export", "--datastack", "fish1_test", "--out", H, "--hops", "1", "--max-partners", "3"], { env: E }); watch(r1, H);
    ok("!! --hops 1 writes NO circuit file and makes two synapse queries; its edges.csv holds only the 9 pairs between the cells and their partners (the cell-onto-cell synapse, which is in both queries, counted once) (no 2001 > 2002, no 2004 > 2001)", r1.status === 0 && !fs.existsSync(path.join(H, "synapses_circuit.csv")) && r1.log.filter((c) => c.call === "synapse_query").length === 2 && csvRows(H, "edges.csv").length === 9 && csvRows(H, "edges.csv").find((r) => r.pre_root_id === "1001" && r.post_root_id === "1002").synapses === "1" && !csvRows(H, "edges.csv").some((r) => r.pre_root_id === "2001" && r.post_root_id === "2002"));
    const R = outDir("rootids"), r2 = run(["export", "--datastack", "fish1_test", "--out", R, "--root-ids", "1002", "--max-partners", "2"], { env: E }); watch(r2, R);
    const c2 = JSON.parse(rd(R, "mauthner_candidates.json"));
    ok("!! --root-ids SKIPS THE SEARCH: no query_table call at all, the candidates file says the ids were given, and the export runs for that one cell (the synapse queries name 1002 alone)", r2.status === 0 && r2.log.filter((c) => c.call === "query_table").length === 0 && /no search was made/.test(c2.note) && c2.ids.join() === "1002" && r2.log.find((c) => c.call === "synapse_query").pre_ids.join() === "1002" && JSON.parse(rd(R, "MANIFEST.json")).cells.join() === "1002");
    const RI = outDir("rootids2"), rri = run(["export", "--datastack", "fish1_test", "--out", RI, "--root-ids", "1002, 1001,1002,", "--hops", "1"], { env: E }); watch(rri, RI);
    ok("!! --root-ids takes SEVERAL ids, in any order, with spaces and a trailing comma, each once: the manifest's cells are 1001, 1002 and the first synapse query names both", rri.status === 0 && JSON.parse(rd(RI, "MANIFEST.json")).cells.join() === "1001,1002" && rri.log.find((c) => c.call === "synapse_query").pre_ids.join() === "1001,1002");
    const T = outDir("trunc"), r3 = run(["export", "--datastack", "fish1_test", "--out", T, "--root-ids", "1001,1002", "--max-rows", "5"], { env: E }); watch(r3, T);
    const m3 = JSON.parse(rd(T, "MANIFEST.json"));
    ok("!! A QUERY THAT HIT --max-rows IS FLAGGED TRUNCATED: with a limit of 5 the warnings (and the manifest's `truncated`) name the queries that returned 5, the limit is the one the stand-in saw, and the run still finishes", r3.status === 0 && m3.warnings.length >= 2 && m3.warnings.every((w) => /^TRUNCATED:/.test(w)) && m3.truncated.length >= 2 && r3.log.filter((c) => c.call === "synapse_query").every((c) => c.limit === 5) && /WARNING: TRUNCATED/.test(r3.stdout));
    const V = outDir("ver"), r4 = run(["export", "--datastack", "fish1_test", "--out", V, "--root-ids", "1001", "--version", "7"], { env: E }); watch(r4, V);
    ok("--version N is the version of EVERY query (none asks for the most recent one), and the manifest records it", r4.status === 0 && r4.log.filter((c) => c.call === "most_recent_version").length === 0 && r4.log.filter((c) => c.call === "synapse_query").every((c) => c.version === 7) && JSON.parse(rd(V, "MANIFEST.json")).materializationVersion === 7);
    const S2 = outDir("tabs"), r5 = run(["export", "--datastack", "fish1_test", "--out", S2, "--tables", "soma,notes"], { env: E }); watch(r5, S2);
    ok("!! --tables searches only those tables, and with the cells in none of them there is NO MATCH: exit 2 with the reason, mauthner_candidates.json and a manifest that says 'no cells' are written, and NO synapse query is made", r5.status === 2 && /no cell matched/.test(r5.stderr) && r5.log.filter((c) => c.call === "synapse_query").length === 0 && r5.log.filter((c) => c.call === "query_table").map((c) => c.table).join() === "soma,notes" && JSON.parse(rd(S2, "MANIFEST.json")).result === "no cells" && fs.existsSync(path.join(S2, "mauthner_candidates.json")));
    const M = outDir("match"), r6 = run(["export", "--datastack", "fish1_test", "--out", M, "--match", "reticulo"], { env: E }); watch(r6, M);
    ok("--match replaces the pattern (case-insensitively): \"reticulo\" finds neuron 2001 in the cell-type table and not the Mauthner cells", r6.status === 0 && JSON.parse(rd(M, "mauthner_candidates.json")).ids.join() === "2001");
    const N = outDir("scanmax"), r7 = run(["export", "--datastack", "fish1_test", "--out", N, "--scan-max-rows", "3"], { env: E }); watch(r7, N);
    ok("--scan-max-rows is respected: with 3, cell_types (5 rows) is not downloaded, so nothing is found, and the skipped list says why", r7.status === 2 && JSON.parse(rd(N, "mauthner_candidates.json")).skipped.some((s) => s.table === "cell_types" && /over --scan-max-rows 3/.test(s.why)) && !r7.log.some((c) => c.call === "query_table" && c.table === "cell_types"));
}

{
    const B = outDir("bound"), rb = run(["export", "--datastack", "fish1_test", "--out", B, "--scan-max-rows", "5"], { env: E }); watch(rb, B);
    ok("!! --scan-max-rows is a LIMIT ON THE COUNT, not below it: a table with exactly that many rows (cell_types, 5) IS searched with --scan-max-rows 5, a table with more (notes, 7) is not", rb.status === 0 && JSON.parse(rd(B, "mauthner_candidates.json")).ids.join() === "1001,1002" && JSON.parse(rd(B, "mauthner_candidates.json")).skipped.some((s) => s.table === "notes"));
    const Z = outDir("zeros"), zf = JSON.parse(JSON.stringify(FIXTURE)); zf.leak_zero = true; writeFixture(zf);
    const rz = run(["export", "--datastack", "fish1_test", "--out", Z, "--max-partners", "3"], { env: E }); writeFixture(FIXTURE); watch(rz, Z);
    const zq = rz.log.filter((c) => c.call === "synapse_query"), zout = csvRows(Z, "synapses_out.csv");
    ok("!! A ZERO ROOT ID FROM THE SERVER (an unproofread partner) IS NEVER A PARTNER OR A MEMBER: with a server that returns the two synapses onto root id 0 anyway (they ARE in synapses_out.csv, as returned), partners.csv, the circuit query and the manifest's circuit hold no 0", rz.status === 0 && zout.some((r) => r.post_pt_root_id === "0") && !csvRows(Z, "partners.csv").some((r) => r.partner_root_id === "0") && zq[2].pre_ids.every((x) => x !== 0) && !JSON.parse(rd(Z, "MANIFEST.json")).circuitNeurons.includes(0));
    const NN = outDir("nan"), nf = JSON.parse(JSON.stringify(FIXTURE)); nf.nan_size = true; writeFixture(nf);
    const rn = run(["export", "--datastack", "fish1_test", "--out", NN, "--max-partners", "3"], { env: E }); writeFixture(FIXTURE); watch(rn, NN);
    ok("!! A NaN IN A COLUMN (a size the server did not fill in) IS WRITTEN AS AN EMPTY CELL, never as the text 'nan', and the export finishes (the edge's summed size skips it)", rn.status === 0 && csvRows(NN, "synapses_out.csv")[0].size === "" && !/\bnan\b/i.test(rd(NN, "synapses_out.csv") + rd(NN, "edges.csv")) && csvRows(NN, "edges.csv").length === 9);
    const SL = outDir("slash"), rs = run(["discover", "--server", "https://global.brain-wire-test.org/", "--out", SL], { env: E }); watch(rs, SL);
    ok("a trailing slash on --server is dropped before the client is built", rs.status === 0 && rs.log.filter((c) => c.call === "CAVEclient").every((c) => c.server_address === "https://global.brain-wire-test.org"));
    const BL = outDir("blank"), rbk = run(["discover", "--out", BL], { env: { CAVE_TOKEN: "   " } }); watch(rbk, BL);
    ok("a CAVE_TOKEN that is only spaces is no token (the client is built without one and caveclient reads its saved file)", rbk.status === 0 && rbk.log.filter((c) => c.call === "CAVEclient").every((c) => c.auth_token === null));
}

sec("6. the manifest, and a token that must never be in the folder");
{
    const m = JSON.parse(rd(X, "MANIFEST.json")), names = fs.readdirSync(X).filter((f) => f !== "MANIFEST.json").sort();
    ok("!! MANIFEST.json lists EVERY file of the folder (and not itself) with its byte count and a sha256 that is recomputed here and matches; the materialization version and timestamp, the datastack, the server, the caveclient version, every option, the cells, the circuit's neurons and the citation are in it", m.files.map((f) => f.name).sort().join() === names.join() && m.files.every((f) => f.bytes === fs.statSync(path.join(X, f.name)).size && f.sha256 === sha(path.join(X, f.name))) && m.materializationVersion === 42 && /2026-09-15/.test(m.timestamp) && m.datastack === "fish1_test" && m.server === "https://global.brain-wire-test.org" && m.caveclient === "0.0-standin" && m.options.hops === 2 && m.options.maxPartners === 3 && m.cells.join() === "1001,1002" && m.circuitNeurons.join() === "1001,1002,2001,2002,2004" && /Petkova/.test(m.citation) && m.tool === "fishCaveExport");
    const tri = JSON.parse(JSON.stringify(FIXTURE)); tri.tables.cell_types.rows[2].cell_type = "reticulospinal " + TOKEN; writeFixture(tri);
    const L = outDir("leak"), rl = run(["export", "--datastack", "fish1_test", "--out", L, "--max-partners", "2"], { env: E });
    writeFixture(FIXTURE);
    ok("!! A TOKEN THAT REACHED A FILE STOPS THE SCRIPT: with the environment token planted in a text column of a cell-type table (a label that lands in labels.csv), the last step -- a scan of the folder for the token -- refuses, exit 2, and names the file", rl.status === 2 && /token appears in/.test(rl.stderr) && /labels\.csv|mauthner_candidates\.json|MANIFEST/.test(rl.stderr));
    // the leak run's own folder has the token by design; it is the one folder not watched
}

sec("7. no token anywhere");
{
    const joined = leaks.join("\n");
    ok("!! THE ENVIRONMENT TOKEN APPEARS IN NO FILE THE SCRIPT WROTE and in NONE OF ITS STDOUT OR STDERR, across every run above (" + leaks.length + " outputs checked), and the refusal messages do not echo the token they refused", joined.length > 5000 && !joined.includes(TOKEN) && !joined.includes("abc\n") );
}

sec("8. the real library");
{
    const st = run(["selftest-signatures"], {});
    ok("!! `selftest-signatures` FAILS (exit 1, a FAIL line a probe) against a library that lacks what the script calls: the stand-in has no materializationengine, infoservice or auth modules (11 of the 13 probes FAIL; the two constructor probes bind to the stand-in's own), and the report says so instead of passing", st.status === 1 && (st.stdout.match(/^FAIL /gm) || []).length === 11 && (st.stdout.match(/^ok /gm) || []).length === 2);
    if (!hasMod(REAL, "caveclient")) note("NOT CHECKED HERE: no Python with caveclient installed (set FISH_CAVE_PYTHON to one). `selftest-signatures` binds every keyword the script passes to the installed library's signatures; it was run once by hand against caveclient 8.2.1, 13 of 13 ok, and is recorded in this file's header.");
    else {
        const r = spawnSync(REAL, [SCRIPT, "selftest-signatures"], { encoding: "utf8", env: { ...process.env, PYTHONPATH: "" } });
        ok("!! `selftest-signatures` BINDS EVERY KEYWORD THE SCRIPT PASSES TO THE INSTALLED caveclient'S SIGNATURES (the client constructor, synapse_query, query_table, get_tables, get_table_metadata, get_annotation_count, most_recent_version, get_timestamp, get_datastacks, get_datastack_info, get_new_token, save_token): the only contact this gate has with the real library", r.status === 0 && (r.stdout.match(/^ok /gm) || []).length === 13 && !/FAIL/.test(r.stdout), r.stdout.trim().split("\n").length + " probes");
    }
}

sec("9. real pandas DataFrames");
{
    if (!hasMod(REAL, "pandas")) note("NOT CHECKED HERE: no Python with pandas (set FISH_CAVE_PYTHON to the one that has caveclient).");
    else {
        const P = outDir("pandas"), rp = run(["export", "--datastack", "fish1_test", "--out", P, "--max-partners", "3"], { env: E, py: REAL, pandas: true }); watch(rp, P);
        const same = ["synapses_out.csv", "synapses_in.csv", "edges.csv", "partners.csv", "synapses_circuit.csv"].every((f) => rd(P, f) === rd(X, f));
        ok("!! WITH REAL pandas DataFrames (numpy integers, the column dtypes the real library returns) the export writes the SAME CSV files to the byte as with the plain stand-in: no `np.int64(...)`, no `1.0` for an id, no NaN text", rp.status === 0 && same);
    }
}

try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* the temp folder is only scratch */ }
finished = true;
console.log(fails ? `\nfishCaveExport-selfcheck: ${fails} FAILED` : "\nfishCaveExport-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
