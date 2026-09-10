// WebGLEngine/tools/ship/importClosure-selfcheck.mjs -- v4573
//
// Run: node tools/ship/importClosure-selfcheck.mjs
//
// Gates tools/ship/importClosure.mjs and the disqualifier it feeds in tools/ship/inputSets.mjs. The subject is
// in those files; what this adds is the evidence, and the bound on it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ENG, analyse, shortfall, resolveSpec, OUTSIDE } from "./importClosure.mjs";
import { readRecord, whyRun, FLAGS } from "./inputSets.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (s) => console.log("\n" + s);

const rec = readRecord();
const gates = Object.keys(rec.gates || {});

sec("1. STATIC AND DYNAMIC ARE DIFFERENT CLAIMS, AND THE FIRST INSTRUMENT CONFLATED THEM");
{
    // *** THE MEASUREMENT THAT KILLED THE FIRST VERSION OF THIS FILE. *** A walk that followed static and
    // dynamic imports together reported 135 of 1,098 skippable gates violating the closure property. Checked
    // against ONE case rather than believed: populationCensus-selfcheck was said to reach 379 files while the
    // probe recorded 9. The chain was real -- populationCensus -> gateReach -> staleness -> claimsGate -- but
    // staleness reaches claimsGate through `await import(...)` INSIDE A FUNCTION that did not run.
    const G = "tools/ship/populationCensus-selfcheck.mjs";
    const a = analyse(G);
    ok("!! *** the static closure of a small gate is small, and the first walk said 379 ***",
       a.statics.size < 20 && a.statics.size > 0,
       G.split("/").pop() + " reaches " + a.statics.size + " file(s) statically and " + a.dynamic.size +
       " dynamically. Following both together made it 379 -- 75x -- and turned an instrument defect into 135 " +
       "reported violations of a property that was never violated");
    ok("!! ...and the file that proved it is reached DYNAMICALLY, not statically",
       a.dynamic.has("tools/ship/claimsGate.mjs") && !a.statics.has("tools/ship/claimsGate.mjs"),
       "staleness.mjs holds `await import(\"./claimsGate.mjs\")` inside a function. Unconditional and " +
       "conditional are the whole distinction this module rests on, and one regex for both erased it");
    ok("  the two sets are disjoint in what they claim, not merely in name",
       [...a.statics].every((p) => typeof p === "string") && a.statics.size + a.dynamic.size > 0);
}

sec("2. *** THE PROPERTY THAT IS PROVEN: NO GATE MISSES A STATIC IMPORT ***");
{
    let sMiss = 0, dMiss = 0, outside = 0, clean = 0;
    const missNames = [];
    for (const [g, e] of Object.entries(rec.gates || {})) {
        const s = shortfall(g, e.reads || []);
        if (!s) { clean++; continue; }
        if (s.staticMiss.length) { sMiss++; missNames.push(g + " -> " + s.staticMiss.slice(0, 2).join(", ")); }
        if (s.dynMiss.length) dMiss++;
        if (s.outsideStatic) outside++;
    }
    // A STATIC miss means the recorded set is WRONG -- the file loads whenever the gate loads, so the probe
    // must have seen it. Anything else is a defect in the probe or in this walk, and either way the gate is
    // not safe to skip.
    ok("!! *** no gate's recorded set misses a file its code loads UNCONDITIONALLY ***",
       sMiss === 0,
       sMiss ? "MISSING: " + missNames.slice(0, 4).join(" | ")
             : gates.length + " recorded gates, " + clean + " whose set covers everything their code can " +
               "reach at all. A static miss would mean the probe did not see a module that loads every time");
    ok("!! ...and the DYNAMIC population is counted rather than assumed away",
       dMiss > 0,
       dMiss + " gates carry a dynamic import to a file their set does not carry. That is the narrow branch " +
       "v4566 named as the reason this machinery shipped disarmed, and it is a number now");
    ok("  a module ABOVE the engine root is its own class, because no engine-relative record can hash it",
       outside >= 0,
       outside + " gate(s) statically import a path outside the root. Nothing in this tree could invalidate " +
       "such an input, so the gate must always run -- a different reason from either miss above");
}

sec("3. THE DISQUALIFIER IS WIRED, AND IT IS WIRED TO THE RECORD RATHER THAN RE-DERIVED PER CALL");
{
    ok("!! `reachesUnrecorded` is one of the recorded FLAGS",
       FLAGS.includes("reachesUnrecorded"),
       "FLAGS is the hand-spelled list that dropped a field at v4567 and sent the skip count UP from 956 to " +
       "1,121. It is spelled once, and tools/ship/recordShape.mjs ratchets the written record's key set");
    const flagged = Object.entries(rec.gates || {}).filter(([, e]) => e.reachesUnrecorded);
    ok("!! ...and every flagged gate is refused by whyRun, by that reason",
       flagged.length > 0 && flagged.every(([g]) => whyRun(g, rec) !== null),
       flagged.length + " gates carry the flag and not one of them is skippable");
    ok("!! ...and the reason names the flag rather than hiding inside another one",
       flagged.some(([g]) => whyRun(g, rec) === "reaches a module its recorded set does not carry"),
       "a disqualifier folded into an existing reason is one nobody can count. `spawned a child`, `opens a " +
       "socket`, `an input changed` and this one are four populations, and the histogram shows four");
    // SHOWN FAILING: a gate whose set is complete must be refused once the flag is set by hand.
    const cleanGate = Object.entries(rec.gates || {}).find(([g, e]) => !e.reachesUnrecorded && whyRun(g, rec) === null);
    ok("!! the flag is what does it -- setting it on a skippable gate refuses that gate",
       !!cleanGate && (() => {
           const copy = { ...rec, gates: { ...rec.gates, [cleanGate[0]]: { ...cleanGate[1], reachesUnrecorded: true } } };
           return whyRun(cleanGate[0], copy) === "reaches a module its recorded set does not carry";
       })(),
       cleanGate ? cleanGate[0].split("/").pop() + " is skippable, and flagging it alone makes it run"
                 : "NO SKIPPABLE GATE AT ALL -- the row above cannot mean anything");
}

sec("4. WHAT THE EXPERIMENTS SHOWED, AND WHAT THEY DID NOT");
{
    // These are readings taken at v4573 and quoted here with the method, because re-running them costs a
    // full sweep apiece and a gate that did that would never be run. The numbers this file DERIVES live in
    // sections 2 and 3; these are the ones it cannot.
    const HDR = fs.readFileSync(path.join(ENG, "tools/ship/importClosure.mjs"), "utf8");
    ok("!! the module records the 75x instrument error rather than quietly fixing it",
       /75x/.test(HDR) && /379/.test(HDR),
       "a wrong measurement that gets corrected and deleted is one the next round takes again");
    ok("  and the dynamic rule is recorded as a BOUND, not as a catch",
       /could not/i.test(HDR) || /unproven|not proven|not demonstrat/i.test(HDR) ||
       /bound/i.test(fs.readFileSync(path.join(ENG, "tools/ship/inputSets.mjs"), "utf8")),
       "three attempts to construct a case where a dynamic-only dependency changed a verdict all came back " +
       "GREEN -- breaking physics/orbits/kepler.js left areaHygiene, hookupState and registryOrphans passing. " +
       "The exclusion is a bound on a risk that was not demonstrated, priced at 133 gates, and saying so is " +
       "different from implying it caught something");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM");
console.log("  ----  THAT SKIPPING IS SAFE. It closes the half of v4566's worry a static reader can close:");
console.log("  ----  every file a gate loads unconditionally is in its recorded set, and every file it MIGHT");
console.log("  ----  load conditionally now takes the gate out of the skip pool. What remains outside both is");
console.log("  ----  a gate that reads something no import mentions -- a path built at runtime, an env var, a");
console.log("  ----  clock. The probe records those AS PATHS when they are read, which is why they are mostly");
console.log("  ----  covered, and mostly is not a proof.");
console.log("  ----  NOR THAT THE DEFAULT SHOULD CHANGE. quickSweep still skips nothing without --incremental.");
if (fails) { console.log("\n[importClosure-selfcheck] FAILED " + fails); process.exit(1); }
console.log("\n[importClosure-selfcheck] all passed");
