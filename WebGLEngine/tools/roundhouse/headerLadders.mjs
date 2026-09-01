// tools/roundhouse/headerLadders.mjs -- v4298
//
// Run: node tools/roundhouse/headerLadders.mjs   (~0.4s -- it reads files, it does not build devices)
//
// A LADDER IN A HEADER THAT THE VALUE FREEZE DOES NOT HOLD.
//
// v4298's first cut asked "which header numbers are unwatched" and got 508 across 79 devices -- formula
// constants, tolerances, years and citations. Useless. THE DEFECT HAS A SHARPER SIGNATURE: nbench and xpbd
// both quote a LADDER -- a run of measurements across a swept configuration -- and a ladder is exactly a
// sweep over configs. nbench's "33.4 / 71.8 / 92.2" had its first two rungs watched and its third invented
// by no mode; xpbd's five-rung PBD ladder is watched at none of its rungs because the device collapses it
// to a spread.
//
// So: find runs of three or more numbers written as a series, and ask how many rungs the freeze holds.
//   NONE watched  -> the whole ladder is unverifiable from any declared mode (xpbd's shape)
//   SOME watched  -> the device runs part of the sweep the header quotes (nbench's shape, the dangerous one)
// *** WHY THIS IS A REPORT AND NOT YET A GATE, STATED SO THE GAP IS NOT MISTAKEN FOR AN OVERSIGHT. ***
// The reference set is lab-results-baseline.json, and on this branch THAT BASELINE IS KNOWN STALE: v4193
// traced 31 moved values across cfl, stability, nbench and hydrostatic to two upstream SPH commits, and the
// re-freeze has not been run. Those four devices therefore report rungs as "unwatched" that the freeze would
// hold if it were current. RATCHETING ON A STALE REFERENCE WOULD BAKE IN FOUR WRONG ENTRIES, so this ships as
// a report; it becomes a gate once the re-freeze lands and the numbers below can be trusted device by device.
// A ZERO HERE WOULD MEAN "NONE FOUND IN WHAT WAS OPENED", NEVER "NONE" (knobLiveness v4042's rule).
//
// MEASURED at v4298: 48 ladders across the registry -- 23 PARTIAL, 15 NONE, 10 fully watched.
// Two were adjudicated by hand and they are the two ends of what this finds:
//   nbench   "33.4 / 71.8 / 92.2" -- the third rung is at N = 8000 and DEF.sizes stops at 2000. It was
//            129.5, not 92.2: FORTY PERCENT WRONG, unwatched for 389 versions.
//   eccentric "0.999635 / ... / 0.003407" across e0 -- `time` pins e0 = 0.01 by design, so five of six rungs
//            are reachable by no mode. Re-run directly: ALL SIX HOLD TO EVERY DIGIT.
// Same structure, opposite verdicts, and only looking tells them apart. That is the case for the report.

import fs from "node:fs";
import path from "node:path";

const ROOT = "/home/user/SweK_Engine/WebGLEngine/tools/roundhouse";
const base = JSON.parse(fs.readFileSync(path.join(ROOT, "lab-results-baseline.json"), "utf8"));
const src = fs.readFileSync(path.join(ROOT, "devices.mjs"), "utf8");

const varToFile = new Map();
for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"\.\/([\w.]+\.mjs)"/g))
    for (const v of m[1].split(",")) varToFile.set(v.trim(), m[2]);
const nameToFile = new Map();
for (const m of src.matchAll(/^\s*(\w+):\s*async\s*\(\)\s*=>\s*(\w+)\s*,/gm))
    if (varToFile.has(m[2])) nameToFile.set(m[1], varToFile.get(m[2]));

function watchedFor(name) {
    const out = [];
    const eat = (v) => {
        if (typeof v === "number" && Number.isFinite(v)) out.push(v);
        else if (Array.isArray(v)) v.forEach(eat);
        else if (v && typeof v === "object") Object.values(v).forEach(eat);
    };
    for (const [k, row] of Object.entries(base.pairs || {}))
        if (k.split("/")[0] === name && row.outputs) eat(row.outputs);
    const d = (base.devices || {})[name];
    if (d && d.outputs) eat(d.outputs);
    return out;
}
function headerOf(file) {
    const out = [];
    for (const L of fs.readFileSync(path.join(ROOT, file), "utf8").split("\n")) {
        if (/^\s*\/\//.test(L) || /^\s*$/.test(L)) out.push(L.replace(/^\s*\/\/ ?/, ""));
        else break;
    }
    return out;
}
const sig = (x, n) => { if (x === 0) return 0;
    const f = Math.pow(10, n - Math.ceil(Math.log10(Math.abs(x)))); return Math.round(x * f) / f; };
const NUM = String.raw`-?\d+\.\d+e[+-]?\d+|-?\d+e[+-]?\d+|-?\d+\.\d+|-?\d+`;
const digitsOf = (t) => Math.min((t.replace(/^-|e[+-]?\d+$/i, "").match(/\d/g) || []).length, 6);

const rows = [];
for (const [name, file] of nameToFile) {
    let header, watched;
    try { header = headerOf(file); } catch { continue; }
    watched = watchedFor(name);
    if (!watched.length) continue;
    const text = header.join("\n").replace(/\bv\d{3,4}\b/g, " ");
    // a series: 3+ numbers joined by / or , (allowing the units/words a header puts between rungs)
    for (const m of text.matchAll(new RegExp(`(?:${NUM})(?:\\s*[/,]\\s*(?:${NUM}))+`, "gi"))) {
        const toks = m[0].match(new RegExp(NUM, "gi")) || [];
        if (toks.length < 3) continue;
        const vals = toks.map(Number).filter(Number.isFinite);
        if (vals.length < 3) continue;
        if (vals.every((v) => Number.isInteger(v) && v > 1900 && v < 2100)) continue;   // years
        const hits = toks.map((t) => watched.some((w) => sig(w, digitsOf(t)) === sig(Number(t), digitsOf(t))));
        const n = hits.filter(Boolean).length;
        rows.push({ name, file, series: m[0].trim().replace(/\s+/g, " "), rungs: toks.length, watched: n,
                    kind: n === 0 ? "NONE" : n < toks.length ? "PARTIAL" : "all" });
    }
}
const partial = rows.filter((r) => r.kind === "PARTIAL");
const none = rows.filter((r) => r.kind === "NONE");
console.log("=== PARTIAL -- the device runs part of the sweep its header quotes (nbench's shape) ===");
for (const r of partial) console.log(`  ${r.name.padEnd(16)} ${r.watched}/${r.rungs} rungs watched   ${r.series.slice(0, 78)}`);
console.log(`\n=== NONE -- no rung of the ladder is in the freeze (xpbd's shape): ${none.length} ladders ===`);
const byDev = new Map();
for (const r of none) byDev.set(r.name, (byDev.get(r.name) || 0) + 1);
console.log("  " + [...byDev.entries()].sort((a,b)=>b[1]-a[1]).map(([d,n]) => `${d}:${n}`).join("  "));
console.log(`\n${rows.length} ladders found; ${partial.length} PARTIAL, ${none.length} NONE, ${rows.length-partial.length-none.length} fully watched.`);
