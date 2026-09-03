// WebGLEngine/tools/ship/claimEvidence-selfcheck.mjs
//
// Run: node tools/ship/claimEvidence-selfcheck.mjs   (~1s -- MEASURED)
//
// v4404 -- *** A CLAIM NAMES ITS OWN FALSIFIER IN PROSE, AND NOTHING EVER PULLED THE TRIGGER. ***
//
// docs/EXPLAIN-ITSELF.md item 4, and the register's defect one level over. predictions.html holds 241 claims,
// each with `kill:` -- the condition that would kill it -- and `where:` -- the files it rests on. Both are
// sentences. Nothing resolved the path, nothing ran the gate, and nothing had ever asked whether a claim's own
// stated killer was firing.
//
// *** ONE WAS. *** "The selfchecks and the server survive Windows path semantics" was marked SETTLED, its kill
// named tools/ship/winPathGuard-selfcheck.mjs, and its measured read "it is, so every straggler was caught".
// That gate reports TWENTY offending occurrences and has been in redCensus.RED_AT_V4279 as long as the register
// has existed. The claim is marked BROKEN at v4404 with the measurement, which is what this tree does with a
// falsified prediction and what its other nine broken entries are for.
//
// FOUR OUTCOMES, NOT TWO, for the same reason v4401 gave: one bucket for several species sends different work
// to the same place. contradicted (settled, own gate red) -> read it and mark it. dangling (names a file that
// is gone) -> repoint or delete. prose (no runnable falsifier) -> a gate, or an honest admission there is none.
// gated -> nothing.
//
// *** AND THE FIRST DRAFT COUNTED A SABOTAGE CLAUSE AS EVIDENCE. *** A `kill:` usually ends "SABOTAGE: <how to
// break it>", which names files ON PURPOSE that should not resolve -- one claim names brain/nonexistent-brain.js,
// which IS the sabotage. Reading paths out of it reported a dangling reference for a file the claim intends not
// to exist: ten flagged, three of them the detector's own fault. THE SHADER CENSUS'S DEFECT AGAIN, caught by
// looking at what was flagged instead of trusting the count.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractClaims } from "./claimsGate.mjs";
import { census } from "./claimEvidence.mjs";
import { RED_AT_V4279 } from "./redCensus.mjs";
import { gateReport } from "./gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const REPORT = gateReport("tools/ship/claimEvidence-selfcheck.mjs");

const CLAIMS = extractClaims(fs.readFileSync(path.join(ENG, "predictions.html"), "utf8"));
const C = census(CLAIMS, { exists: (p) => fs.existsSync(path.join(ENG, p)),
                           redGates: new Set(RED_AT_V4279.map((e) => e.gate)) });

// The two populations frozen BY NAME rather than by count, which is v4399's lesson: a count ratchet drifts with
// the tree and cannot say which entry moved, and the round that raises it is the one least able to tell.
const DANGLING_AT_V4403 = Object.freeze([
    "The fingerprint grows a memory -- a content-addressed result ledger across versions and peers",
    "We were serving OKF and reading none of it -- now the engine reads its own",
    "OKF was a bundle on disk; now it is a service on the wire",
    "A page that is not linked is not shipped",
    "The button he asked for was not needed, and bun was installed the whole time",
    "A measurement with no front door is invisible",
    "Cross-thread determinism was untestable",
]);
const PROSE_SETTLED_AT_V4403 = Object.freeze([
    "The rig verification is clickable now -- master, fleet, and the full gate suite run from a button in server.html",
    "SweK's routes are exposed as ChatGPT App widgets, so a fleet can be checked and driven from a chat",
    "The live-mind and a single gauge are extracted into their own mini-panels, so the dashboard can tile just the part you want",
    "The page index is a dashboard-assembler, not a link list -- check pages and watch them live side by side",
    "SweK exports its ground truth in the estimator's own format, so a method like Trace Anything can be scored against it",
    "The ground-truth scene renders to actual depth frames, and the z-buffer gives point-vs-point self-occlusion for free",
    "The ground-truth scene now has occlusion -- tracks vanish behind solids and return, and the grade knows which points were seen",
    "The other live brain pages got the same swap-away guard, and the audit named which pages actually needed it",
    "brain-maze's render and poll loops go quiet when the page is swapped away, instead of throwing every frame",
    "The brain on the robot's head gets a glass dome with lights that flash and cast a glow over it",
    "The GPU brain is a visible brain on the robot's head -- a whirlpool that swirls while it solves",
    "Device gate is multi-runtime and honours forceEngine -- no more false 'no WebGL2'",
    "Krbn-compare left pane renders in real WebGL2, with a verified canvas-2D fallback",
    "Physics Lab contrasts -- A/B pairs where the difference is the lesson, gated to actually differ",
    "Physics Lab presets -- curated starter scenes as foundations, gated so none can rot",
    "Physics Lab -- a 3D showcase whose scenes are gated so the demo cannot rot",
    "The one failure mode here is the one that looks like success",
    "Every time I removed an assumption, the number got smaller",
    "The caves cost 78% of the merge",
    "The creature's control loop erases the world",
    "The instrument was the limit, not the subject",
    "The solver cannot blow up, so it lies instead",
    "A measurement is not a fact about a shape until you say what measured it",
    "The blob dies of uniform heat, not of heat",
    "Sound is vibration because the blob does not push back",
    "The paramecium loses to the mold, and that is the biology",
    "The isosurface papers optimise 10% of the flesh frame",
    "You cannot measure substance by counting words",
    "Splatting would not boil where our marcher does",
    "Krbn's hand-drawn lines do not boil between frames",
    "Krbn's SVG is byte-identical across runs",
    "The engine's blobulator page works",
]);

{
    for (const k of ["gated", "prose", "dangling", "contradicted"])
        if (C.counts[k]) say(`${String(C.counts[k]).padStart(3)}  ${k}`);
    const states = {};
    for (const c of CLAIMS) states[c.state] = (states[c.state] || 0) + 1;
    say(`states: ${JSON.stringify(states)}`);

    // *** THE ONE THAT MATTERS, AND IT MUST BE ZERO. *** A settled claim whose own named gate is red is a claim
    // the tree is asserting against its own evidence. There is no ceiling on this and no frozen list: the
    // answer to finding one is to read it and change its state, never to record it.
    const bad = C.rows.filter((r) => r.kind === "contradicted");
    ok("!! *** no SETTLED claim rests on a gate that is currently RED ***",
       bad.length === 0,
       bad.length ? bad.map((r) => `${r.name.slice(0, 60)} -- ${r.detail}`).join("; ") :
       "241 claims, 203 settled, and not one of them is asserted against a check that is failing. THERE IS NO " +
       "CEILING HERE ON PURPOSE: a claim contradicted by its own killer is read and re-stated, never filed. " +
       "v4404 found exactly one and marked it broken with the measurement");

    const dangling = C.rows.filter((r) => r.kind === "dangling").map((r) => r.name);
    const newDangling = dangling.filter((n) => !DANGLING_AT_V4403.includes(n));
    ok("!! ...and the claims whose evidence names a file that is gone may only SHRINK",
       dangling.length <= DANGLING_AT_V4403.length && newDangling.length === 0,
       newDangling.length ? `NEW: ${newDangling.join("; ")}` :
       `${dangling.length} of the ${DANGLING_AT_V4403.length} frozen at v4404 -- taken AFTER this gate existed, ` +
       "because the first freeze counted the Windows claim as dangling on a citation of THIS FILE, written into " +
       "its measured note one command before the file was. A RATCHET WITH SLACK IN IT IS A RATCHET HOLDING " +
       "NOTHING (v3195), so the list is exactly what is dangling now. Each names a real rename or " +
       "deletion -- okf/brief.js, dist/index.js, tools/ledger/LEDGER.js -- so the evidence cannot be followed " +
       "at all. THE SABOTAGE CLAUSE IS EXCLUDED: a kill that says how to break a claim names files it wants " +
       "missing, and counting those reported three references that were never meant to resolve");

    const prose = C.rows.filter((r) => r.kind === "prose" && r.state === "settled").map((r) => r.name);
    const newProse = prose.filter((n) => !PROSE_SETTLED_AT_V4403.includes(n));
    ok("!! ...and no NEW claim is SETTLED without naming a gate that could kill it",
       newProse.length === 0,
       newProse.length ? `NEW: ${newProse.map((n) => n.slice(0, 70)).join("; ")} -- each is settled on a ` +
       "sentence, which is the state this whole file is about" :
       `${prose.length} frozen at v4404 and nothing new. THE COST OF SETTLING A CLAIM ON PROSE NOW LANDS ON ` +
       "THE ROUND THAT WRITES IT. The 32 standing are mostly UI and wiring -- 'the page is clickable now' -- " +
       "where a gate is genuinely hard rather than neglected, and saying that is not the same as excusing it");

    ok("...and every claim reaches one of the four outcomes, so none is silently uncounted",
       C.rows.length === CLAIMS.length &&
       (C.counts.gated || 0) + (C.counts.prose || 0) + (C.counts.dangling || 0) + (C.counts.contradicted || 0) === CLAIMS.length,
       `${CLAIMS.length} claims, ${C.rows.length} classified. THE ORDER IS A PRIORITY: a claim can be both ` +
       "contradicted and dangling, and contradicted wins because it is the one that needs reading today -- " +
       "which is why marking the Windows claim broken moved it from contradicted to dangling rather than out");

    REPORT.table("what each claim's evidence is worth",
        ["outcome", "claims"],
        [["names a gate that exists", C.counts.gated || 0],
         ["names no runnable falsifier", C.counts.prose || 0],
         ["names a file that is gone", C.counts.dangling || 0],
         ["settled with its own gate RED", C.counts.contradicted || 0]],
        "kill: and where: are sentences. Nothing resolved the path or ran the gate until v4404, and the one " +
        "contradicted claim had been asserting the opposite of its own killer for as long as that gate was red.");
    REPORT.table("the claims settled without a falsifier anybody can run",
        ["claim", "since"],
        C.rows.filter((r) => r.kind === "prose" && r.state === "settled").map((r) => [r.name, r.since || "?"]),
        "Mostly UI and wiring, where a gate is hard rather than neglected. Frozen by name: the list may shrink " +
        "and nothing new may join it.");
    REPORT.write();
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4404.
//   BP the falsified Windows claim put back to "settled" -> exit=1, 1 red naming it. That is the state the
//      tree was in before this round, reproduced as a sabotage.
//   BQ the SABOTAGE-clause exclusion removed, so a kill's "break it like this" text counts as evidence again
//      -> exit=1, 1 red, naming the GPU-brain claim and its deliberately absent brain/nonexistent-brain.js.
//   BR one name removed from the frozen prose list, so an existing claim reads as a new arrival -> exit=1,
//      1 red naming it. A COUNT RATCHET COULD NOT ASK THIS.
//
// AND TWO OF THIS ROUND'S OWN MISTAKES, BOTH CAUGHT BY RUNNING. The first freeze of the dangling list counted
// the Windows claim, because the measured note this round wrote into it cited THIS FILE one command before the
// file existed -- a citation resolving a moment later is still a dangling reference while it does not, and the
// list is taken after the gate exists so the ratchet has no slack. The second: repairing that comment broke a
// template literal, the gate stopped compiling, and `grep -c FAIL` returned ZERO. *** A COUNT OF FAILURES IS
// NOT A VERDICT UNLESS THE PROCESS FINISHED *** -- v4392's finding, hit for the third time in this session, in
// the round about claims that assert what nobody checked.
//
console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM, AND IT IS THE LIMIT THAT MATTERS. That the other 203 settled claims are");
console.log("  ----  TRUE. This can only see a claim whose falsifier is a gate the red register already tracks; a claim");
console.log("  ----  naming a GREEN gate that no longer tests what the claim says is invisible here, and so is one whose");
console.log("  ----  prose describes a gate that exists but checks something else. THE ONE CONTRADICTION FOUND WAS FOUND");
console.log("  ----  BECAUSE THE REGISTER ALREADY KNEW -- not because this file is good at looking.");
if (fails) { console.log("claimEvidence-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("claimEvidence-selfcheck: all checks pass");
