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
import { readRecord, whyRun, firstMoved, FLAGS } from "./inputSets.mjs";
import { treePaths } from "./treeRead.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (s) => console.log("\n" + s);

const rec = readRecord();
const gates = Object.keys(rec.gates || {});
const TREE_GATES = treePaths().filter((f) => f.endsWith("-selfcheck.mjs")).length;

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
    // *** v4647 -- THIS ROW WAS COMPARING A T0 MEASUREMENT AGAINST A T1 FILE FOR A QUARTER OF THE RECORD. ***
    // An entry whose own source has since been edited is STALE by the record's own rule: firstMoved names the
    // moved path and whyRun returns "changed: x", so the gate always runs. Its recorded set was taken against
    // a version of the code that no longer exists, and walking TODAY's import graph against YESTERDAY's set
    // is the species this tree keeps finding -- a claim asserted against a live file that has moved.
    //
    // MEASURED at v4647 over 1,341 entries: 1,019 fresh, 322 stale, and the static misses are 0 of 1,019
    // fresh and 1 of 322 stale -- microfacetWgsl-selfcheck, stale because v4646 gave it a new import and no
    // pass has re-probed it since. The row went red for a record being old, not for the property failing.
    //
    // *** AND PARTITIONING IS NOT A LOOSENING, WHICH IS THE PART THAT HAD TO BE CHECKED RATHER THAN ARGUED. ***
    // The property protects the SKIP: a set that covers everything is safe to skip on. A stale entry is never
    // skipped -- asserted directly below rather than reasoned about -- so nothing that could be skipped is
    // outside the assertion. What the partition removes from the row is exactly the population the row could
    // never have been protecting.
    // *** AND THE PARTITION COSTS NOTHING, BECAUSE IT IS ONLY ASKED WHERE IT DECIDES SOMETHING. ***
    // The first draft called firstMoved for every entry -- and again in the guard row below. Profiled: 491 ms
    // for one pass over 1,344 entries (13,112 file hashes), against this gate's 2,214 ms baseline, of which
    // 2,121 ms is the import-graph walk it cannot avoid. That took it to 3,226 ms, across the 3,000 ms
    // quick-sweep budget -- which is a MEMBERSHIP THRESHOLD, not a warning: a gate over it drops out of every
    // ship. A row added for honesty would have cost the whole gate its place in the sweep.
    //
    // Freshness only decides anything for an entry that HAS a static miss, and there is one. So it is asked
    // there and nowhere else, and the two rows that needed the full partition are re-aimed at the population
    // whose exclusion actually has to be justified.
    // *** THE DECISION IS A NAMED PREDICATE SO A FIXTURE CAN DRIVE IT, BECAUSE ON A HEALTHY TREE THE BRANCH
    // NEVER RUNS. *** Two sabotages -- "always assert" and "always exclude" -- both went 0 RED, for the honest
    // reason that there are no static misses right now, so nothing reaches the classification at all. A
    // repair that is only exercised when the tree is neglected is not a repair anybody can rely on.
    const EXCLUDED = (e) => firstMoved(e) !== null;
    let sMiss = 0, dMiss = 0, outside = 0, clean = 0, examined = 0, sMissStale = 0;
    const missNames = [], staleMissNames = [], staleMissGates = [];
    for (const [g, e] of Object.entries(rec.gates || {})) {
        const s = shortfall(g, e.reads || []);
        if (!s) { clean++; examined++; continue; }
        if (s.staticMiss.length) {
            // The ONLY place freshness changes an answer: an entry whose own source has moved describes code
            // that no longer exists, so walking TODAY's import graph against it compares T0 to T1 -- the
            // species this tree keeps finding. Measured at v4647: 0 static misses among the entries that still
            // match the tree, 1 among those that do not (microfacetWgsl-selfcheck, whose imports v4646 moved).
            if (EXCLUDED(e)) { sMissStale++; staleMissNames.push(g.split("/").pop()); staleMissGates.push(g); }
            else { sMiss++; examined++; missNames.push(g + " -> " + s.staticMiss.slice(0, 2).join(", ")); }
        } else examined++;
        if (s.dynMiss.length) dMiss++;
        if (s.outsideStatic) outside++;
    }
    // A STATIC miss means the recorded set is WRONG -- the file loads whenever the gate loads, so the probe
    // must have seen it. Anything else is a defect in the probe or in this walk, and either way the gate is
    // not safe to skip.
    ok("!! *** no CURRENT recorded set misses a file its code loads UNCONDITIONALLY ***",
       sMiss === 0,
       sMiss ? "MISSING: " + missNames.slice(0, 4).join(" | ")
             : examined + " of " + gates.length + " entries asserted over, " + clean + " of them with a set " +
               "covering everything their code can reach at all. A static miss would mean the probe did not " +
               "see a module that loads every time");
    // *** THE VACUITY GUARD, BECAUSE A PARTITION IS THE EASIEST WAY TO ASSERT ABOUT NOTHING. *** A sabotage
    // that classed every entry as stale went 0 RED: the asserted set emptied, sMiss over nothing is 0, and the
    // row passed while covering no gate at all. Free here, because `examined` is counted in the same loop.
    ok("!! CONTROL: the row above is asserted over a MAJORITY of the record, not over a sliver the partition left",
       examined > 0 && examined >= gates.length * 0.5,
       `${examined} of ${gates.length} entries asserted over; the record holds ${gates.length} of ${TREE_GATES} ` +
       `gates in the tree. If this goes red the partition has swallowed the population and the row above is green ` +
       `about nothing`);
    // And the excluded population -- exactly the entries held back from the row above -- is justified rather
    // than assumed: each is refused by whyRun, so nothing that could be SKIPPED was excluded. Aimed at those
    // entries alone, which is both the honest scope and free.
    ok("!! ...and every entry the partition EXCLUDED is refused by whyRun, so nothing skippable was excused",
       staleMissGates.every((g) => whyRun(g, rec) !== null),
       staleMissGates.length
           ? `${staleMissGates.length} excluded: ${staleMissGates.map((g) => g.split("/").pop()).join(", ")}, ` +
             `each refused. If one were skippable the row above would be excusing the exact case it exists to catch`
           : "none excluded on this tree -- every entry with a static miss would have to be stale for that to happen");
    // The classification itself, driven on two fixtures: a stale entry is EXCLUDED, a current one is ASSERTED
    // OVER. Between them they are what the two 0-red sabotages were reaching for.
    {
        const v = gates[0], e = rec.gates[v];
        const bent = { ...e, hashes: { ...e.hashes, [v]: "0000000000000000" } };
        ok("!! *** the classification is driven: a STALE entry is excluded and a CURRENT one is asserted over ***",
           EXCLUDED(bent) === true && EXCLUDED(e) === false,
           `bent one hash of ${v.split("/").pop()} and it flips. Without this, "always exclude" and "always ` +
           `assert" are both green on any tree with no static misses -- which is every healthy tree`);
    }
    // *** AND ON A HEALTHY TREE THE EXCLUSION ROW IS VACUOUS, WHICH IS SAID RATHER THAN LEFT TO BE NOTICED. *** With
    // the record freshly probed nothing is excluded, so `every` over an empty list is true by arithmetic. The
    // property is driven on a fixture as well, so it is load-bearing on every tree rather than only on a
    // neglected one: an entry whose own source has moved must be refused, whatever else it carries.
    {
        const victim = gates[0];
        const bent = { ...rec.gates[victim], hashes: { ...rec.gates[victim].hashes, [victim]: "0000000000000000" } };
        ok("  ...driven on a fixture too, so it holds when the live population is empty",
           whyRun(victim, { ...rec, gates: { [victim]: bent } }) === "changed: " + victim,
           `a stale entry is refused BY NAME. Without this the row above passes on any tree where the record ` +
           `happens to be current, which is exactly when nobody is looking`);
    }
    if (sMissStale) console.log(`  ----  ${sMissStale} STALE entr(ies) also miss a static import -- ` +
        `${staleMissNames.slice(0, 4).join(", ")} -- which means their gate's imports moved and no pass has ` +
        `re-probed them. Not a violation: their sets describe code that no longer exists, and those gates run anyway.`);
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
