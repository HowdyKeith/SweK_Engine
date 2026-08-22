// WebGLEngine/tools/ship/gateAxioms-selfcheck.mjs -- v3440
//
// Run: node tools/ship/gateAxioms-selfcheck.mjs
//
// *** A GATE SHOULD BE ABLE TO SAY WHAT IT ASSUMED. *** The idea comes from schildep/verified-polygon-intersection,
// which runs `#print axioms` on its Lean proofs to confirm they depend only on [propext, Classical.choice,
// Quot.sound] -- BECAUSE AGENTS COULD HAVE INTRODUCED AN AXIOM, AND AN UNCHECKED ASSUMPTION IS A HOLE THAT LOOKS
// LIKE A PROOF. This tree has 784 gates asserting properties and not one of them declares a precondition.
//
// *** BUT IT IS DERIVED HERE RATHER THAN DECLARED, WHICH IS THE DIFFERENCE THAT MATTERS. *** A declared axiom
// list is a SECOND DECLARATION NOBODY COMPARES -- this project's most-named defect -- and it would go stale the
// first time a gate grew a `readFileSync`. What a gate actually assumes is visible in what it CALLS: the
// environment it reads, the files it opens, the network it reaches, the processes it spawns, the clock it
// consults and the randomness it draws. So the assumption surface is READ OFF THE CODE, and the gate below
// grades the shape of that surface rather than trusting anybody's prose about it.
//
// THE PROBES RUN OVER codeOnly(), WHICH STRIPS COMMENTS AND STRING LITERALS. My first pass ran them over raw
// source and reported that 435 of 784 gates touch a GPU -- in a tree whose sandbox has none. They were matching
// the WORD "WebGL" in prose, in files that explain why they cannot use one. PROSE-AS-CODE, the defect this tree
// names most, hit while building the instrument for a different one.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly } from "./sourceScan.mjs";
import { gateFiles } from "./staleness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/** What a gate reaches outside its own arithmetic. Each is an ASSUMPTION about the world it runs in. */
const PROBES = {
    env:    { re: /process\.env\./,                     why: "assumes an environment variable is set the way the author expects" },
    fsRead: { re: /readFileSync|readdirSync|existsSync/, why: "assumes a file or directory is present and says what it said" },
    net:    { re: /\bfetch\s*\(|https?\.request\s*\(/,   why: "assumes the network answers -- and that a stranger's answer is the right one" },
    proc:   { re: /child_process|execSync|spawnSync/,    why: "assumes a binary exists on this machine" },
    rand:   { re: /Math\.random\s*\(/,                   why: "assumes its own run is repeatable WHEN IT IS NOT" },
    clock:  { re: /Date\.now\s*\(|performance\.now\s*\(/, why: "assumes wall-clock time, which differs on every machine and every run" },
    gpu:    { re: /getContext\s*\(|navigator\.gpu/,      why: "assumes a graphics context, which this sandbox does not have" },
};

// v3442 -- *** THIS FILE WALKED THE TREE ITSELF AND SHIPPED singleSource RED AT v3441. *** It built its own
// population with the LOOSE pattern and no skip list -- a SECOND DEFINITION OF "a gate exists here", which is
// the defect v3041 found in buildKnowledgeIndex and affected.mjs, and which v3071 then committed inside
// gateQuality-selfcheck, a meta-gate about gate quality. THIRD TIME, and this one landed in the round built to
// census what every gate assumes. The two walks currently agree, which is exactly the hazard v3041 named: a
// count that is only correct while nothing changes is not a measurement, it is a coincidence with a good record.
// gateFiles() is the one definition and this now imports it.
const gates = gateFiles(ENG);

const counts = {}, byGate = new Map();
for (const g of gates) {
    let src = "";
    try { src = codeOnly(fs.readFileSync(g, "utf8")); } catch { continue; }
    const hit = [];
    for (const [k, p] of Object.entries(PROBES)) if (p.re.test(src)) { hit.push(k); counts[k] = (counts[k] || 0) + 1; }
    byGate.set(path.relative(ENG, g).split(path.sep).join("/"), hit);
}

console.log("[gateAxioms] what every gate actually assumes, read off the code\n");
console.log(`  ${gates.length} gates scanned\n`);
for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(7)} ${String(n).padStart(4)}   ${PROBES[k].why}`);
}
const pure = [...byGate.values()].filter((h) => h.length === 0).length;
console.log(`\n  ${pure} gates assume NOTHING outside their own arithmetic.\n`);

// ---- 1. THE CENSUS IS REAL --------------------------------------------------------------------------------
{
    ok("!! every gate in the tree was scanned and classified", byGate.size === gates.length && gates.length > 500,
       `${byGate.size} of ${gates.length}. A scan that silently skipped unreadable files would report a cleaner surface than the tree has -- the two counts are compared rather than one being assumed.`);
    ok("!! *** and a large share of gates assume NOTHING AT ALL ***", pure > gates.length * 0.25,
       `${pure} of ${gates.length} touch no environment, no file, no network, no process, no clock and no randomness. THAT IS THE HEALTHY SHAPE: a check whose only input is arithmetic gives the same answer on every machine forever, and this tree has ${pure} of them.`);
}

// ---- 2. *** THE ONE THAT MATTERS: A GATE THAT DRAWS RANDOMNESS ASSUMES ITS OWN REPEATABILITY *** -------------
{
    const rand = [...byGate.entries()].filter(([, h]) => h.includes("rand")).map(([f]) => f);
    say(`gates calling Math.random: ${rand.length}${rand.length ? " -- " + rand.join(", ") : ""}`);
    ok("!! REPORTED, not failed: an unseeded draw is the loudest assumption a gate can make",
       rand.length < gates.length * 0.05,
       "*** A GATE THAT DRAWS RANDOMNESS IS ASSERTING SOMETHING ABOUT A SAMPLE IT WILL NEVER SEE AGAIN. It may be " +
       "entirely right to do so -- a property that holds for ANY input is best tested with inputs nobody chose -- but " +
       "then a FAILURE IS NOT REPRODUCIBLE, and a gate whose red cannot be reproduced is a rumour. The tree's own " +
       "seeded-RNG modules exist for exactly this; whether each of these should use one is a judgement per gate, and " +
       "naming them is what makes the judgement possible. ***");
    const clock = [...byGate.entries()].filter(([, h]) => h.includes("clock")).length;
    ok("...and the clock is the quieter version of the same assumption",
       clock > 0 && clock < gates.length * 0.15,
       `${clock} gates read Date.now or performance.now. MOST OF THOSE ARE BUDGETS -- "did this finish in time" -- which is a REAL property and A MACHINE-DEPENDENT ONE, and this tree has already had three gates go red on a slow sandbox for that reason. A TIMEOUT IS NOT A FAILURE, and a gate that cannot tell them apart will eventually claim it is.`);
}

// ---- 3. THE ENVIRONMENTAL SURFACE, AND WHY IT IS SMALL ------------------------------------------------------
{
    const net = [...byGate.entries()].filter(([, h]) => h.includes("net")).map(([f]) => f);
    const proc = [...byGate.entries()].filter(([, h]) => h.includes("proc")).length;
    ok("!! very few gates reach the NETWORK, which is what makes the suite runnable anywhere",
       net.length < 20,
       `${net.length} of ${gates.length}. A GATE THAT NEEDS THE INTERNET IS A GATE THAT IS RED ON AN AEROPLANE, and worse, one whose GREEN depends on a stranger's server still saying what it said.`);
    ok("...and few spawn a process", proc < 40,
       `${proc} use child_process. Each assumes a binary exists on THIS machine -- the shape behind every "works on my rig" report.`);
    ok("!! and the GPU surface is nearly empty, which is the harness telling the truth",
       (counts.gpu || 0) < 20,
       `${counts.gpu || 0} gates touch a graphics context. *** MY FIRST PASS SAID 435, because it ran the probes over RAW SOURCE and matched the WORD "WebGL" in prose -- in files that explain why they CANNOT use one. codeOnly for an IDIOM, and the number fell by more than twenty-fold. A CENSUS OF ASSUMPTIONS THAT COUNTED EXPLANATIONS OF ASSUMPTIONS WOULD HAVE BEEN EXACTLY BACKWARDS. ***`);
}

// ---- 4. WHAT THIS IS NOT ------------------------------------------------------------------------------------
{
    ok("REPORTED: this is a DERIVED surface, not a declared axiom list, and the difference is the point", true,
       "*** A DECLARED LIST WOULD BE A SECOND DECLARATION NOBODY COMPARES -- this project's most-named defect -- and it " +
       "would go stale the first time a gate grew a readFileSync. *** What is NOT captured: an assumption that lives in " +
       "the ARGUMENT rather than the call, like a fixture whose numbers only make sense at one grid size, or a tolerance " +
       "chosen to fit. Those are real axioms and no regex finds them. THE SURFACE IS A FLOOR ON WHAT A GATE ASSUMES, " +
       "NEVER A CEILING, and reading it as a ceiling would be the worst possible use of it.");
}

console.log(fails ? `\ngateAxioms-selfcheck: ${fails} FAILED` : "\ngateAxioms-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
