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
//
// *** v4300 -- WHAT THE UNWATCHED LADDERS ACTUALLY ARE, after six adjudicated. *** They are not careless
// numbers. They are overwhelmingly measurements from THE PLANTED ARM or from A NON-DEFAULT CONFIGURATION, and
// the value freeze records the HONEST ARM AT DEFAULTS. So the gap is structural: headers argue with both arms
// and across sweeps, and the freeze holds one corner of that.
//   freesurface  per=3 seed census   RE-RUN EXACT, and widened to six seeds -- 0.8947 still the worst
//   voxelize     segments=64 ladder  RE-RUN EXACT, both sequences, non-monotone and bounded in each
//   fragmentRot  planted spectrum    RE-RUN EXACT -- unwatched TWICE, planted arm and not an emitted key
//   eccentric    e0 ladder (v4299)   RE-RUN EXACT, five of six rungs reachable by no mode
//   xpbd         PBD ladder (v4298)  RE-RUN EXACT
//   nbench       N=8000 column       40% WRONG for 389 versions
// Five of six were right. THAT IS THE POINT AND NOT A REASON TO STOP: the one that was wrong was wrong by 40%
// and had stood since the header was written, and nothing in the lab could have told the six apart.
//
// AND ONE IS NOT RE-RUNNABLE AT ALL. flip3d's blindness census (three plants, nine readings) is source edits
// "restored afterwards" -- not knobs, so no configuration reproduces them and no re-run can confirm them. That
// is the worst case this sweep can find: not a stale number but an unfalsifiable one.
//
// *** AND A LIMITATION FOUND BY FIXING THINGS: RECORDING A VERIFIED LADDER ADDS A LADDER. *** The count went
// 48 -> 51 across v4300's own edits, because "honest 3.0000/5.0000/7.0000, planted 4.0897/4.4049/6.5053" is
// itself three-plus numbers in a series. THE TOOL FLAGS ITS OWN REMEDIATION. That is harmless in a report and
// would be corrosive in a ratchet -- a gate that grows every time somebody documents a re-measurement teaches
// people to stop documenting. Whoever turns this into a gate has to exclude re-measurement records (a dated
// "RE-RUN EXACT" marker is the obvious hook) or the ratchet will fight its own fixes.

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

        // *** v4302 -- A CONFIG LIST IS NOT A LADDER, AND THE FIRST CUT COULD NOT TELL THEM APART. *** mpmstep
        // was flagged on "nu = 0, 0.15, 0.3, 0.45, 0.49, 1e-6, -0.3 and 3e5" -- the INPUTS a knob was swept
        // over, not readings taken from it -- and the same mistake caught fdtd's "epsR = 1 / 2 / 4 / 9",
        // freesurface's seed numbers, nbench's "N = 500 / 2000 / 8000" and xpbd's iteration counts. Asking
        // whether the FREEZE HOLDS AN INPUT is a question with no meaning: the freeze records what a device
        // REPORTS.
        //
        // The separator that works is PRECISION, and it works because of what the two things are for. A swept
        // input is chosen by a human and written the short way -- small integers, one or two figures. A reading
        // is whatever came out and gets quoted to the digits that were measured. So: at least one rung carrying
        // FOUR OR MORE significant digits, and not every rung an integer.
        //
        // MEASURED at v4302: this drops 23 of 51 series and every one of the nine already adjudicated by hand
        // survives it -- including nbench's 33.4 / 71.7 / 129.5, which is the loosest real ladder in the set and
        // the one that was 40% wrong. A FILTER THAT REMOVED THE ONLY CONFIRMED DEFECT WOULD BE WORSE THAN THE
        // NOISE IT CLEARED, so that case was checked before this line was kept.
        const anyPrecise = toks.some((t) => digitsOf(t) >= 4);
        if (!anyPrecise || vals.every((v) => Number.isInteger(v))) continue;
        const hits = toks.map((t) => watched.some((w) => sig(w, digitsOf(t)) === sig(Number(t), digitsOf(t))));
        const n = hits.filter(Boolean).length;
        const series = m[0].trim().replace(/\s+/g, " ");
        // *** v4302 -- THE SAME LADDER TWICE IN ONE HEADER IS ONE LADDER. *** v4300 recorded that documenting a
        // verified ladder ADDS a ladder, and the commonest case is the plainest: a correction leaves the old
        // series in place beside the new one, or a dated note repeats the corrected series verbatim. Counting
        // those twice inflates the very number this file exists to report -- mpmrefine showed five entries for
        // four distinct ladders. Deduplicated per device, on the normalised text.
        if (rows.some((r) => r.name === name && r.series === series)) continue;
        rows.push({ name, file, series, rungs: toks.length, watched: n,
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
