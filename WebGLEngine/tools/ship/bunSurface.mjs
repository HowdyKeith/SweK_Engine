// WebGLEngine/tools/ship/bunSurface.mjs -- v3966
//
// Run:  node tools/ship/bunSurface.mjs     (the baseline)
//       bun  tools/ship/bunSurface.mjs     (the question)
//
// *** "DO WE HAVE A LIST OF WHAT SweK FUNCTIONS WILL NOT FULLY WORK WITH ONLY BUN?" -- NO, AND THAT IS WHY
// THIS EXISTS. *** tools/ship/bun-audit.mjs audits exactly ONE entry point (brain/esPilot.mjs, the cell
// manager that must survive `bun build --compile`) by GREPPING its import graph for hostile idioms. That is a
// real check and it is not this question: it covers one subtree, it never runs anything, and a grep cannot tell
// you whether `dgram.createSocket` actually binds on the runtime in front of you.
//
// *** SO THIS RUNS THINGS. *** Every probe below is TRIED on whichever runtime executes this file, and the two
// runs are meant to be compared. A capability that works on Node and not on Bun is the list Keith asked for;
// a capability that fails on both is a broken box, not a Bun finding, and the baseline run is what tells those
// apart. NOTHING HERE IS ASSERTED FROM MEMORY -- the whole point is that the answer changes with the Bun
// version and the operating system.
//
// *** AND THE OPERATING SYSTEM IS THE PART THAT MATTERS MOST, WHICH IS EXACTLY WHAT I COULD NOT TEST. ***
// Measured on Linux with bun 1.3.11: all 134 ai-bridge/*Bridge.js modules load, ai-bridge/server.js boots and
// serves /health, tools/ship/verify.mjs runs ALL GREEN, and every capability below matches Node. Keith's rig is
// WINDOWS, where Bun's process, socket and native-module surfaces are its weakest, and none of that transfers.
// A green run here is evidence about this box only. RUN IT THERE.
//
// It is deliberately NOT a *-selfcheck.mjs: it does not assert, it REPORTS, and its verdict differs by runtime
// on purpose. A gate whose correct answer depends on who invoked it is not a gate.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNTIME = (typeof Bun !== "undefined" && Bun.version) ? "bun " + Bun.version : "node " + process.version;
const JSON_OUT = process.argv.includes("--json");

const rows = [];
const probe = (name, fn) => {
    try { const r = fn(); rows.push({ name, ok: true, detail: r === undefined ? "" : String(r).slice(0, 60) }); }
    catch (e) { rows.push({ name, ok: false, detail: String((e && e.message) || e).split("\n")[0].slice(0, 90) }); }
};

// ---- 1. the runtime's own identity -------------------------------------------------------------------------
// *** THIS IS FIRST BECAUSE IT WAS THE ONE REAL BUG THE SURVEY FOUND. *** Bun EMULATES process.version: on the
// box this was written on it answers "v24.3.0" while the Node installed beside it is v22.22.2. /health reported
// that field and therefore, under Bun, named a Node newer than any that exists here. `typeof Bun` is the only
// reliable discriminator, and server.js uses it now.
probe("runtime is identifiable (typeof Bun, not process.version)",
    () => RUNTIME + (typeof Bun !== "undefined" ? "  [process.version claims " + process.version + "]" : ""));

// ---- 2. the node builtins this tree actually leans on -------------------------------------------------------
// Counted from the tree rather than guessed: child_process appears in 141 files, dgram in 11, worker_threads in
// 4, cluster in 1. Those counts are why these four lead -- a Bun gap in child_process would not be a footnote.
probe("child_process.spawnSync (141 files use child_process)",
    () => "exit " + require_("node:child_process").spawnSync(process.execPath, ["-e", "0"]).status);
probe("dgram udp4 socket (11 files -- LAN peer discovery)",
    () => { const s = require_("node:dgram").createSocket("udp4"); s.close(); return "created + closed"; });
probe("worker_threads (4 files)", () => "isMainThread=" + require_("node:worker_threads").isMainThread);
probe("cluster (1 file)", () => { const c = require_("node:cluster"); return "isPrimary=" + (c.isPrimary ?? c.isMaster); });
probe("http.createServer", () => { const s = require_("node:http").createServer(); s.close(); return "created"; });
probe("fs.watch", () => { const w = fs.watch(ENG); w.close(); return "watching"; });
probe("zlib.gzipSync (release zips)", () => require_("node:zlib").gzipSync(Buffer.from("x")).length + " bytes");
probe("crypto.randomUUID", () => require_("node:crypto").randomUUID().length + " chars");
probe("vm.runInNewContext", () => require_("node:vm").runInNewContext("1+1"));
probe("os.networkInterfaces", () => Object.keys(require_("node:os").networkInterfaces()).length + " interfaces");
probe("global fetch", () => typeof fetch);
probe("global WebSocket", () => typeof WebSocket);

// ---- 3. can the bridges actually LOAD? -----------------------------------------------------------------------
// The census bridgeCensus-selfcheck runs under Node, asked again under whatever is running now. Loading is a low
// bar and it is the right first one: a bridge that cannot be required cannot be wrong in an interesting way.
{
    let total = 0, bad = [];
    const dir = path.join(ENG, "ai-bridge");
    for (const f of fs.readdirSync(dir).filter((x) => /Bridge\.js$/.test(x)).sort()) {
        total++;
        try { require_(path.join(dir, f)); } catch (e) { bad.push(f + ": " + String((e && e.message) || e).split("\n")[0].slice(0, 60)); }
    }
    rows.push({ name: "all ai-bridge/*Bridge.js load", ok: bad.length === 0,
                detail: bad.length ? bad.length + " of " + total + " FAILED -- " + bad.slice(0, 3).join(" | ")
                                   : total + " of " + total });
}

// ---- report ---------------------------------------------------------------------------------------------------
if (JSON_OUT) {
    console.log(JSON.stringify({ kind: "swek-bun-surface", runtime: RUNTIME, platform: process.platform,
                                 arch: process.arch, at: new Date().toISOString(), rows }, null, 1));
} else {
    console.log("bunSurface -- what this runtime can actually do, tried rather than assumed\n");
    console.log("  runtime : " + RUNTIME);
    console.log("  platform: " + process.platform + " " + process.arch + "\n");
    for (const r of rows) console.log("  " + (r.ok ? "OK  " : "FAIL") + "  " + r.name.padEnd(52) + r.detail);
    const bad = rows.filter((r) => !r.ok);
    console.log("\n  " + (bad.length ? bad.length + " of " + rows.length + " FAILED on this runtime"
                                     : "all " + rows.length + " OK on this runtime"));
    console.log("  Compare against the OTHER runtime: a difference is the answer; a shared failure is the box.");
    console.log("  MEASURED ON LINUX ONLY at v3966 -- Windows is Bun's weakest surface and is untested here.");
}
// Always exit 0: this REPORTS, it does not grade. A different answer under Bun is information, not a failure.
process.exit(0);
