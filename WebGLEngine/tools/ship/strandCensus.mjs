#!/usr/bin/env node
// WebGLEngine/tools/ship/strandCensus.mjs -- v4857
//
// Run:  node tools/ship/strandCensus.mjs --run [--workers 4] [--cap-s 300] [--out FILE] [--only SUBSTRING]
//       node tools/ship/strandCensus.mjs --read FILE
//
// *** WHAT CAN A KILLED GATE LEAVE IN THE TREE? *** quickSweep SIGKILLs a gate at its cap, and a SIGKILL runs no
// `finally`. A gate that creates a file under the engine root and removes it on the way out leaves it behind --
// and the tree has learnt that one rig failure at a time: the zz- gate fixtures (TRANSIENT_FIXTURES), four
// mkdtemp prefixes (TRANSIENT_DIRS), the `__` fixtures (fixtureLitter), exitBusy's probe copies, and at v4856
// .maze-boot.mjs, one file that took runtimeGap's census and recordDrift-selfcheck red together on the rig.
// Each was added to a list after the rig found it. This asks the question of the whole population instead.
//
// HOW: every gate is run ONCE under tools/ship/inputProbe.mjs, whose shims since v4857 record what a process
// WRITES inside the tree as well as what it reads (named imports, require and node children alike). The moment
// a gate exits, each path it wrote is classified:
//
//   covered     a cleanup the sweep already runs after a kill names it (TRANSIENT_FIXTURES, TRANSIENT_DIRS, a `__`
//               fixture in FIXTURE_DIRS, an exitBusy copy)
//   tracked     a committed file, or a directory holding one: the gate rewrites a record on purpose, or bends a
//               file and puts it back -- reported, because a kill mid-rewrite leaves a modified tracked file
//   ignored     a path git ignores (gate-reports, *.local.json, captures): output, not litter
//   left        untracked, not ignored, and STILL THERE after a clean exit -- litter even without a kill
//   strandable  created and gone again by a clean exit, and nothing names it: THE FINDING. A kill strands it.
//
// WHAT IT CANNOT SEE: a write by a non-node child (a browser, git, a shell), and a gate stopped at --cap-s (a
// SIGKILL runs no exit handler, so its probe file is never written -- it is listed as unread, never as clean).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gateFiles } from "./staleness.mjs";
import { TRANSIENT_FIXTURES, TRANSIENT_DIRS } from "./gateSweep.mjs";
import { FIXTURE_DIRS, FIXTURE_PREFIX } from "./fixtureLitter.mjs";
import { COPY_SUFFIX } from "./exitBusy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROBE = path.join(ENG, "tools", "ship", "inputProbe.mjs");

/** Is `rel` named by a cleanup the sweep already runs after a kill? Each owner spells its own names. */
export function coveredBy(rel) {
    if (TRANSIENT_FIXTURES.includes(rel)) return "TRANSIENT_FIXTURES";
    for (const [dir, prefix] of TRANSIENT_DIRS) if (rel.startsWith(dir + "/" + prefix)) return "TRANSIENT_DIRS";
    const dir = path.posix.dirname(rel), base = path.posix.basename(rel);
    if (FIXTURE_DIRS.includes(dir) && base.startsWith(FIXTURE_PREFIX)) return "fixtureLitter";
    if (COPY_SUFFIX && base.endsWith(COPY_SUFFIX)) return "exitBusy";
    return null;
}

/**
 * Classify one gate's writes. Pure: the tree is asked through `tracked` (a Set of committed files), `trackedDirs`
 * (directories holding one), `exists` and `ignored` (both rel -> bool), so the rules are driven on fixtures.
 */
export function classify(writes, { tracked, trackedDirs, exists, ignored }) {
    return writes.map((rel) => {
        const by = coveredBy(rel);
        if (by) return { rel, kind: "covered", by };
        if (tracked.has(rel) || trackedDirs.has(rel)) return { rel, kind: "tracked" };
        if (ignored(rel)) return { rel, kind: "ignored" };
        return { rel, kind: exists(rel) ? "left" : "strandable" };
    });
}

/** The tree's committed files, and every directory that holds one. */
export function trackedSets(root = ENG) {
    const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 }).split("\0").filter(Boolean);
    const dirs = new Set();
    for (const f of files) for (let d = path.posix.dirname(f); d && d !== "."; d = path.posix.dirname(d)) { if (dirs.has(d)) break; dirs.add(d); }
    return { tracked: new Set(files), trackedDirs: dirs };
}

/** Which of `rels` git ignores, asked in one call. */
export function ignoredSet(rels, root = ENG) {
    if (!rels.length) return new Set();
    try {
        return new Set(execFileSync("git", ["check-ignore", "--no-index", "--stdin"], { cwd: root, input: rels.join("\n"), encoding: "utf8" })
            .split("\n").map((l) => l.trim()).filter(Boolean));
    } catch (e) { return new Set(String(e.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean)); }   // exit 1: none ignored
}

function runOne(gate, { capMs }) {
    return new Promise((resolve) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-strand-")), t0 = Date.now();
        const child = spawn(process.execPath, ["--import", PROBE, gate], {
            cwd: ENG, stdio: "ignore",
            env: { ...process.env, SWEK_PROBE_DIR: dir, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import ${PROBE}`.trim() } });
        const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, capMs);
        child.on("exit", (code, signal) => {
            clearTimeout(timer);
            const writes = new Set();
            for (const f of fs.readdirSync(dir)) { try { for (const w of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).writes || []) writes.add(w); } catch {} }
            fs.rmSync(dir, { recursive: true, force: true });
            const existsNow = new Map([...writes].map((w) => [w, fs.existsSync(path.join(ENG, w))]));
            resolve({ gate, code, capped: signal === "SIGKILL", ms: Date.now() - t0, writes: [...writes].sort(), existsNow: Object.fromEntries(existsNow) });
        });
    });
}

/** Run every gate (or those matching `only`) under the probe, `workers` at a time. */
export async function runCensus({ workers = 4, capMs = 300000, only = null, log = console.log } = {}) {
    const gates = gateFiles(ENG).map((f) => path.relative(ENG, f).split(path.sep).join("/")).filter((g) => !only || g.includes(only)).sort();
    const out = [], queue = [...gates];
    let done = 0;
    await Promise.all(Array.from({ length: Math.max(1, workers) }, async () => {
        for (let g; (g = queue.shift());) {
            out.push(await runOne(g, { capMs }));
            if (++done % 100 === 0 || done === gates.length) log(`[strandCensus] ${done}/${gates.length}`);
        }
    }));
    return { generatedFrom: "tools/ship/strandCensus.mjs", at: new Date().toISOString(), host: os.hostname(), platform: process.platform,
             workers, capMs, gates: out.sort((a, b) => a.gate.localeCompare(b.gate)) };
}

/** Classify a saved census against this tree. */
export function readCensus(census, root = ENG) {
    const { tracked, trackedDirs } = trackedSets(root);
    const all = [...new Set(census.gates.flatMap((g) => g.writes))];
    const ign = ignoredSet(all, root);
    const rows = census.gates.map((g) => ({ gate: g.gate, capped: g.capped,
        paths: classify(g.writes, { tracked, trackedDirs, exists: (r) => !!(g.existsNow || {})[r], ignored: (r) => ign.has(r) }) }));
    const by = (k) => rows.flatMap((r) => r.paths.filter((p) => p.kind === k).map((p) => ({ gate: r.gate, ...p })));
    return { rows, strandable: by("strandable"), left: by("left"), tracked: by("tracked"), covered: by("covered"), ignored: by("ignored"),
             unread: rows.filter((r) => r.capped).map((r) => r.gate) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const a = process.argv.slice(2), val = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
    let census;
    if (a.includes("--run")) {
        census = await runCensus({ workers: Number(val("--workers", 4)), capMs: 1000 * Number(val("--cap-s", 300)), only: val("--only", null) });
        const out = path.resolve(val("--out", "strand-census.json"));
        fs.writeFileSync(out, JSON.stringify(census, null, 1) + "\n");
        console.log(`[strandCensus] ${census.gates.length} gates run; the census: ${out}`);
    } else if (a.includes("--read")) census = JSON.parse(fs.readFileSync(path.resolve(val("--read")), "utf8"));
    else { console.log("usage: node tools/ship/strandCensus.mjs --run [--workers 4] [--cap-s 300] [--out FILE] [--only S] | --read FILE"); process.exit(2); }
    const R = readCensus(census);
    const show = (name, list) => { console.log(`  ${name}: ${list.length}`); for (const p of list.slice(0, 60)) console.log(`    ${p.rel}   <- ${p.gate}${p.by ? "  (" + p.by + ")" : ""}`); };
    show("STRANDABLE (a kill leaves it; nothing names it)", R.strandable);
    show("LEFT after a clean exit (untracked, not ignored)", R.left);
    show("TRACKED files rewritten", R.tracked);
    show("covered by a cleanup", R.covered);
    console.log(`  ignored: ${R.ignored.length}; unread (stopped at the cap): ${R.unread.length}${R.unread.length ? " -- " + R.unread.join(", ") : ""}`);
    process.exitCode = R.strandable.length || R.left.length ? 1 : 0;
}
