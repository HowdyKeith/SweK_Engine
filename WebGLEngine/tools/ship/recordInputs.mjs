// WebGLEngine/tools/ship/recordInputs.mjs -- v4565
//
// Run: node tools/ship/recordInputs.mjs [--gates <substring>] [--limit N] [--write]
//
// Runs each gate ONCE under tools/ship/inputProbe.mjs and records what it read, so tools/ship/inputSets.mjs
// can decide -- later, cheaply -- whether anything a gate depends on has moved. This is the expensive half
// and it is meant to be run rarely: one pass over the tree, serially, to buy every sweep after it.
//
// *** IT RECORDS THE PROBE'S OWN LIMITS ALONGSIDE THE PATHS. *** A gate that spawned, opened a socket, or
// takes fs by named import gets its set recorded AND a flag saying the set cannot be trusted, because the
// alternative -- omitting it -- makes "no record" and "a record we must not use" the same thing, and only
// one of those is worth re-recording later.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { enumerateGates } from "./gateSweep.mjs";
import { ENG, RECORD, hashFile, hashDir, readRecord, encode } from "./inputSets.mjs";

/** Does this gate's source take fs by NAMED import? The probe patches the builtin's exports object, and a
 *  named binding is resolved when the module links -- so those gates are recorded and never trusted. */
export function usesNamedFsImport(rel, root = ENG) {
    try {
        const src = fs.readFileSync(path.join(root, rel), "utf8");
        return /^\s*import\s*\{[^}]*\}\s*from\s*["'](?:node:)?fs(?:\/promises)?["']/m.test(src);
    } catch { return false; }
}

// *** THIS PASS RUNS PARALLEL AND THE ROTATION'S DOES NOT, AND THE DIFFERENCE IS WHAT IS BEING MEASURED. ***
// tools/ship/sweepRotation.mjs is serial on purpose: it records HOW LONG a gate takes, and SWEEP_CONTENTION_V4562
// measured an 8-worker run inflating that by a 2.41x median, so a parallel re-time would evict healthy gates on a
// manufactured reading. This records WHAT a gate read, which is the same set whether the box is idle or loaded --
// contention changes the clock, not the paths. So the one measurement that must be taken alone is taken alone and
// this one is not, and neither is a habit copied from the other.
// *** v4567 -- A DIRECTORY PER GATE, NOT A FILE, BECAUSE THE CHILDREN WRITE INTO IT TOO. ***
// NODE_OPTIONS carries the probe into every node child that inherits the environment, so one gate run can
// produce SEVERAL probe outputs -- one per process in the tree. Each names its own pid and ppid, and the
// merge is a union: what a gate depends on is what ANY process in its run read. The hook goes in the
// environment rather than on the command line for exactly that reason -- an argv flag reaches one process,
// an environment variable reaches the whole tree of them.
const probeDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "swek-probe-"));
const probeEnv = (root, dir) => {
    // Assigned through pathToFileURL on its own line: tools/ship/windowsImport-selfcheck.mjs reads what is
    // handed to `--import` and its pattern cannot see inside a NESTED call, so an inline
    // pathToFileURL(path.join(...)) is reported as a raw path. Safe code in a form its checker can read.
    const hook = pathToFileURL(path.join(root, "tools/ship/inputProbe.mjs")).href;
    return { ...process.env, NODE_OPTIONS: "--import " + hook, SWEK_PROBE_DIR: dir, SWEK_PROBE_OUT: "" };
};

/** Union every process's output, carrying the disqualifiers forward from ANY of them. */
const readProbe = (dir, rel, ms, status) => {
    const reads = new Set(), dirs = new Set(), execs = new Set();
    let procs = 0, net = false, nonNode = false, nodeKids = 0;
    let files = [];
    try { files = fs.readdirSync(dir); } catch {}
    for (const f of files) {
        // The loader thread writes a plain list of module paths (see probe/hooks.mjs); every other writer
        // in the directory writes JSON. Two shapes, one union.
        if (f.startsWith("loads-")) {
            try { for (const l of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) if (l) reads.add(l); } catch {}
            continue;
        }
        let j = null;
        try { j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
        procs++;
        for (const r of j.reads || []) reads.add(r);
        for (const d of j.dirs || []) dirs.add(d);
        for (const e of j.execs || []) execs.add(e);
        if (j.net) net = true;
        if (j.spawnedNonNode) nonNode = true;
        nodeKids += j.spawnedNode || 0;
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    if (!procs) return { gate: rel, ms, code: status ?? 1, ok: false, procs: 0, reads: [], dirs: [], execs: [],
                         net: false, spawnedNonNode: false, spawnedNode: 0 };
    return { gate: rel, ms, code: status ?? 1, ok: true, procs,
             reads: [...reads].sort(), dirs: [...dirs].sort(), execs: [...execs].sort(),
             net, spawnedNonNode: nonNode, spawnedNode: nodeKids };
};

/** Synchronous, for one gate at a time -- the shape the gate and a --gates run want. */
export function probeOne(rel, { root = ENG, timeoutMs = 30000 } = {}) {
    const dir = probeDir();
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(root, rel)],
        { cwd: root, stdio: "ignore", timeout: timeoutMs, env: probeEnv(root, dir) });
    return readProbe(dir, rel, Date.now() - t0, r.status);
}

// *** AND THE FIRST DRAFT OF THE PARALLEL PASS WAS NOT PARALLEL, WHICH IS THIS SESSION'S OWN DEFECT CLASS. ***
// I wrote eight async workers over probeOne and a comment above it saying the pass runs parallel. probeOne
// uses spawnSync, which BLOCKS THE EVENT LOOP, so all eight awaited each other and the pass ran exactly as
// serially as before -- a claim living in a comment while the code did something else, which is the fault
// tools/ship/absenceScope.mjs was built to catch in prose and nothing catches in a scheduler. Measured, not
// reasoned about: the "8-worker" run had not reached its 100-gate progress mark after several minutes, which
// a truly parallel pass over 1,253 mostly-sub-second gates cannot fail to do.
export function probeOneAsync(rel, { root = ENG, timeoutMs = 30000 } = {}) {
    return new Promise((resolve) => {
        const dir = probeDir();
        const t0 = Date.now();
        const p = spawn(process.execPath, [path.join(root, rel)],
            { cwd: root, stdio: "ignore", env: probeEnv(root, dir) });
        const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, timeoutMs);
        p.on("exit", (code, sig) => { clearTimeout(timer); resolve(readProbe(dir, rel, Date.now() - t0, sig ? 124 : code)); });
        p.on("error", () => { clearTimeout(timer); resolve(readProbe(dir, rel, Date.now() - t0, 1)); });
    });
}

export function entryFor(p, { root = ENG } = {}) {
    const hashes = {}, dirHashes = {};
    for (const r of p.reads) hashes[r] = hashFile(r, root);
    for (const d of p.dirs) dirHashes[d] = hashDir(d, root);
    // namedFsImport is no longer a DISQUALIFIER at v4567 -- the loader hook reaches those bindings, measured
    // on a fixture that recorded an empty set before it and its real set after. It is still RECORDED, because
    // that count is the evidence the hook is what changed and not something else.
    return { reads: p.reads, dirs: p.dirs, hashes, dirHashes,
             spawnedNonNode: p.spawnedNonNode, spawnedNode: p.spawnedNode, procs: p.procs,
             net: p.net, namedFsImport: usesNamedFsImport(p.gate, root), probeMs: p.ms, exit: p.code };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
    const only = arg("--gates", null), limit = Number(arg("--limit", 0));
    const workers = Number(arg("--workers", 8)), timeoutMs = Number(arg("--timeout-s", 25)) * 1000;
    // *** THE SCOPE IS THE SWEEP'S OWN POPULATION, NOT THE TREE. *** Skipping can only save time on a gate the
    // sweep actually runs, and the sweep runs what is under budget. Probing the 359 gates outside it costs the
    // full run of each -- the 140 cap-hitters alone are 140 x 20 s -- to record a set nothing will ever consult.
    // --all overrides, for the day the exiled pool comes back (OVER_BUDGET_PASS_V4565 returned 105 of them).
    const all = process.argv.includes("--all");
    let gates = enumerateGates(ENG);
    if (!all && !only) {
        const t = JSON.parse(fs.readFileSync(path.join(ENG, "tools/ship/sweep-timings.json"), "utf8"));
        const under = (g) => (t.timings || {})[g] != null && t.timings[g] <= 3000;
        gates = gates.filter(under);
    }
    if (only) gates = gates.filter((g) => g.includes(only));
    if (limit) gates = gates.slice(0, limit);
    const prior = readRecord();
    const out = { ...(prior.gates || {}) };
    let done = 0, trusted = 0, timedOut = 0;
    const t0 = Date.now();
    console.log(`[inputs] probing ${gates.length} gate(s) with ${workers} worker(s), ${timeoutMs / 1000} s cap each`);
    // Parallel, for the reason in the note above probeOne: the paths do not depend on the load.
    let next = 0;
    const worker = async () => {
        while (next < gates.length) {
            const g = gates[next++];
            const p = await probeOneAsync(g, { timeoutMs });
            out[g] = entryFor(p);
            done++;
            if (!p.ok) timedOut++;
            if (!out[g].spawnedNonNode && !out[g].net && out[g].reads.length) trusted++;
            if (done % 100 === 0) process.stderr.write(`[inputs] ${done}/${gates.length}  ${trusted} usable, ${timedOut} gave no output\n`);
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, workers) }, worker));
    const ms = Date.now() - t0;
    console.log(`[inputs] probed ${done} gates in ${(ms / 1000).toFixed(0)} s: ${trusted} with a usable input set, ` +
                `${timedOut} produced no probe output (timed out, or died before the exit handler)`);
    if (process.argv.includes("--write")) {
        // INDEXED, not one path list per gate -- see the note above `FORMAT` in inputSets.mjs. Written
        // compactly rather than with an indent: this is a 4,072-row table with 443,405 references into it,
        // and an indent per line is a megabyte of spaces.
        fs.writeFileSync(path.join(ENG, RECORD), JSON.stringify(encode(out, {
            note: "What each gate READ, observed by running it once under tools/ship/inputProbe.mjs. `paths` " +
                  "is the shared table and each gate's `r`/`d` are indices into it; `hashes`/`dirHashes` are " +
                  "the content at record time, one per PATH, so a later run can ask what moved. TWO " +
                  "disqualifiers remain at v4567 and a gate carrying either is recorded and NEVER skipped: " +
                  "`spawnedNonNode` (a child that is not node, or anything through a shell -- nobody " +
                  "recorded what it read) and `net` (the input is not in the tree at all). `namedFsImport` " +
                  "is still recorded and no longer decides anything: the loader hook reaches those bindings. " +
                  "See tools/ship/inputSets.mjs for the rule.",
            at: new Date().toISOString(), probedMs: ms,
        })) + "\n");
        console.log("[inputs] wrote " + RECORD);
    } else console.log("[inputs] dry run -- pass --write to record");
}
