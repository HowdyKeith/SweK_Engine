#!/usr/bin/env node
// WebGLEngine/tools/ship/gateProfile.mjs -- v4814
//
// Run: node tools/ship/gateProfile.mjs <gate> [<gate> ...] [--top 8]
//      node tools/ship/gateProfile.mjs --rig-slow          (the five gates v4813 found 2-7x slower on the rig)
//
// A DIAGNOSTIC, NOT A GATE: it asserts nothing and exits 0. For each gate named, it runs the gate once as a child with
// V8's CPU profiler on and the fs module's sync calls timed by call site, then prints where the wall time went: the
// filesystem by caller, and the functions that held the CPU. It exists because this round twice found the cost
// somewhere other than where it was assumed -- reportDoors' walk was reads on the rig and CPU here, and absenceScope's
// "tree walk" was a lexer flattening a string at every `/` -- and a fix aimed at the wrong half buys nothing.
//
// The v4813 rig record named five gates that run 2-7x their sandbox time on Keith's Windows box (sweepCoverage.mjs's
// RETURNED_AT_V4813: citedSources 7.4x, corpusFilters 3.8x, headlessGpu 3.1x, windowsImport 2.3x, orreryEjecta 2.0x).
// A profile taken HERE cannot say why a gate is slow THERE; --rig-slow is the command for that box.
"use strict";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RIG_SLOW = ["tools/ship/citedSources-selfcheck.mjs", "tools/ship/corpusFilters-selfcheck.mjs",
                  "tools/ship/headlessGpu-selfcheck.mjs", "tools/ship/windowsImport-selfcheck.mjs",
                  "tools/ship/orreryEjecta-selfcheck.mjs"];
const argv = process.argv.slice(2);
const ti = argv.indexOf("--top"); const TOP = ti >= 0 ? Math.max(1, Number(argv[ti + 1]) || 8) : 8;
const gates = argv.includes("--rig-slow") ? RIG_SLOW : argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--top");
if (!gates.length) { console.log("usage: node tools/ship/gateProfile.mjs <gate> [...] | --rig-slow"); process.exit(0); }

// The fs hook, written to a temp file and loaded with --require, so the gate itself is not edited. Every sync call is
// timed and charged to the first stack frame inside the engine tree; the totals are written as JSON at exit.
const HOOK = String.raw`
const fs = require("fs"); const sites = new Map(); let total = 0n;
const where = () => { const l = new Error().stack.split("\n").slice(3).find((x) => /WebGLEngine[\\/]/.test(x) && !/gateProfile/.test(x)) || "(outside the tree)";
  return l.trim().replace(/^at /, "").replace(/\(?(?:file:\/\/\/)?[^()]*?WebGLEngine[\\/]/, "(").replace(/\\/g, "/").slice(0, 100); };
for (const k of ["readFileSync", "readdirSync", "statSync", "lstatSync", "existsSync", "writeFileSync", "openSync"]) {
  const o = fs[k]; if (typeof o !== "function") continue;
  fs[k] = function (...a) { const t = process.hrtime.bigint(); try { return o.apply(this, a); } finally {
    const d = process.hrtime.bigint() - t; total += d; const key = k + " " + where(); const e = sites.get(key) || { n: 0, ns: 0n }; e.n++; e.ns += d; sites.set(key, e); } };
}
process.on("exit", () => { try { require("fs").writeFileSync(process.env.SWEK_GATEPROFILE_OUT, JSON.stringify({ totalMs: Number(total / 1000000n),
  sites: [...sites].map(([k, v]) => [k, v.n, Number(v.ns / 1000000n)]) })); } catch {} });
`;

console.log("gateProfile -- where a gate's time goes on this box: the filesystem by caller, and the CPU by function.");
console.log(`node ${process.version} ${process.platform} ${os.cpus().length} cores; A diagnostic: it asserts nothing.`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "swek-gateprofile-"));
const hookPath = path.join(tmp, "fs-hook.cjs");
fs.writeFileSync(hookPath, HOOK);

for (const gate of gates) {
    const abs = path.resolve(ENG, gate);
    console.log("");
    console.log(`== ${gate}`);
    if (!fs.existsSync(abs)) { console.log("   not found"); continue; }
    const profDir = fs.mkdtempSync(path.join(tmp, "cpu-"));
    const fsOut = path.join(profDir, "fs.json");
    const t0 = Date.now();
    const r = spawnSync(process.execPath, ["--cpu-prof", "--cpu-prof-dir=" + profDir, "--require", hookPath, abs],
                        { cwd: ENG, env: { ...process.env, SWEK_GATEPROFILE_OUT: fsOut }, encoding: "utf8", timeout: 600000, maxBuffer: 64 << 20 });
    const wall = Date.now() - t0;
    const reds = (r.stdout || "").split("\n").filter((l) => /^\s*FAIL\s/.test(l)).length;
    console.log(`   wall ${wall} ms, exit ${r.status === null ? "KILLED (" + r.signal + ")" : r.status}, ${reds} FAIL line(s)`);
    let fsr = null; try { fsr = JSON.parse(fs.readFileSync(fsOut, "utf8")); } catch {}
    if (fsr) {
        console.log(`   filesystem (sync calls): ${fsr.totalMs} ms, ${(100 * fsr.totalMs / Math.max(1, wall)).toFixed(0)}% of wall`);
        for (const [k, n, ms] of fsr.sites.sort((a, b) => b[2] - a[2]).slice(0, Math.min(TOP, 6)))
            console.log(`     ${String(ms).padStart(6)} ms  ${String(n).padStart(6)} calls  ${k}`);
    } else console.log("   filesystem: no record (the gate exited before the hook could write it)");
    const prof = fs.readdirSync(profDir).find((f) => f.endsWith(".cpuprofile"));
    if (prof) {
        const p = JSON.parse(fs.readFileSync(path.join(profDir, prof), "utf8"));
        const byId = new Map(p.nodes.map((n) => [n.id, n])), self = new Map();
        p.samples.forEach((s, i) => { const n = byId.get(s), cf = n.callFrame;
            const k = `${cf.functionName || "(anonymous)"}  ${String(cf.url).replace(/^file:\/\/\//, "").replace(/\\/g, "/").replace(/^.*WebGLEngine\//, "")}:${cf.lineNumber + 1}`;
            self.set(k, (self.get(k) || 0) + (p.timeDeltas[i] || 0)); });
        const tot = [...self.values()].reduce((a, b) => a + b, 0);
        console.log(`   CPU (self time, sampled): ${(tot / 1000).toFixed(0)} ms`);
        for (const [k, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, TOP))
            console.log(`     ${String((us / 1000).toFixed(0)).padStart(6)} ms  ${k.slice(0, 110)}`);
    } else console.log("   CPU: no profile (the gate was killed before V8 could write one)");
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log("");
console.log("READING IT: filesystem-heavy on one box and not the other is the OS (read once, or fewer stats); CPU-heavy is");
console.log("the gate's own work, and the function names say which. 'outside the tree' is node's own or a dependency's.");
process.exit(0);
