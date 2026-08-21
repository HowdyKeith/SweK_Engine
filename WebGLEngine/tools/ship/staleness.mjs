// WebGLEngine/tools/ship/staleness.mjs -- v2976
//
// EVERY DERIVED NUMBER IN THE TREE, CHECKED AGAINST REALITY, IN UNDER A SECOND.
//
// WHY THIS EXISTS, AND IT IS A FAILURE THAT ALREADY HAPPENED. The v2975 build shipped with THREE stale facts:
//
//     brain/brain.js BRAIN_BUILD   said v2888   engine was v2975   (87 versions behind)
//     case-study.html gate count   said 380     actual was 457     (77 gates uncounted)
//     knowledge-index.json         said 381     actual was 457     (built at v2888, never rebuilt)
//
// Only the FIRST was caught, because verify.mjs -- the 71-check ship gate -- checks version MARKERS but not
// derived COUNTS. The other two are gated, correctly, inside the 457-gate selfcheck suite. That suite takes
// minutes, so it does not run on every ship. A GATE NOBODY CAN AFFORD TO RUN IS A GATE NOBODY RUNS, and this is
// what that sentence costs when it is left standing: the checks were right, present, and never consulted.
//
// THE FIX IS NOT A NEW KIND OF CHECK. It is putting the CHEAP ones where they will actually be run. Every check
// below is a file read and a count -- the whole module is well under a second, which is affordable on every
// single ship, forever.
//
// THE DISTINCTION WORTH KEEPING: a MARKER is a string someone types (ENGINE_VERSION). A DERIVED FACT is a number
// that describes the tree (how many gates exist). Markers rot when you forget to type; derived facts rot when
// the tree grows underneath them. The second is more insidious, because nothing about editing a physics file
// suggests you should go and renumber a page.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const SKIP = /node_modules|[\\/]\.git|[\\/]vendor|GPU_Assets|demos_code/;

// v3036 -- ONE WALKER, AND IT WAS OFF BY ONE.
//
// This counted gates with /selfcheck.*\.mjs$/, which also matches tools/ship/selfchecks.mjs -- THE RUNNER. The
// runner is not a gate; it is the thing that runs them. caseStudy-selfcheck had its own walker, matching the
// `-selfcheck.mjs` suffix, which excluded the runner correctly -- so the two disagreed by exactly one, forever,
// and case-study.html was re-baked at some point to satisfy whichever one was consulted last. That is why the
// page kept going stale after being "fixed": the number was never the defect. Two counters were.
//
// The proof that a re-bake could never have settled it: adding ONE new gate this round moved the failure from
// caseStudy to staleness without the page changing at all.
//
// So the walker lives here once and caseStudy imports it. NAME THE THING ONCE -- the law this tree has paid for
// eight separate times, including a bridge unreachable for 35 rounds because two files declared /bench.
const GATE_FILE = /-selfcheck\.mjs$/;

/** Every gate file in the tree. The ONE definition of "a gate exists here". */
export function gateFiles(dir = ENG, acc = []) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { return acc; }
    for (const f of entries) {
        const p = path.join(dir, f);
        if (SKIP.test(p)) continue;
        let st; try { st = fs.statSync(p); } catch { continue; }
        if (st.isDirectory()) gateFiles(p, acc);
        else if (GATE_FILE.test(f)) acc.push(p);
    }
    return acc;
}

export function countGateFiles() { return gateFiles().length; }

const readOr = (rel, fallback = "") => { try { return fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { return fallback; } };

/**
 * Every derived fact, with what it CLAIMS and what is TRUE. Returns rows so a caller can report them however it
 * likes -- verify.mjs prints them as ship checks, the selfcheck asserts on them.
 */
export function stalenessRows() {
    const rows = [];

    // 1. the gate count a reader sees on the case study
    const actualGates = countGateFiles();
    const csMatch = readOr("case-study.html").match(/<b>(\d+)<\/b><span>gates<\/span>/);
    const claimedGates = csMatch ? parseInt(csMatch[1], 10) : null;
    rows.push({
        id: "case-study gate count",
        claimed: claimedGates, actual: actualGates, ok: claimedGates === actualGates,
        why: "the number a reader sees is the number that is true, or the page is advertising",
    });

    // 2. the knowledge index -- the thing that answers "does this already exist?"
    let idxGates = null;
    try { idxGates = JSON.parse(readOr("knowledge-index.json", "{}")).counts.gates; } catch {}
    rows.push({
        id: "knowledge-index gate count",
        claimed: idxGates, actual: actualGates, ok: idxGates === actualGates,
        why: "a stale index answers yesterday's question, which is worse than answering none -- it is the exact tool built to stop things being rebuilt",
    });

    // 3. version markers agreeing with each other (not with a --version flag; that is verify.mjs's job)
    const ev = (readOr("main.js").match(/ENGINE_VERSION = "(v\d+)"/) || [])[1] || null;
    const bb = (readOr("brain/brain.js").match(/BRAIN_BUILD = "(v\d+)"/) || [])[1] || null;
    rows.push({
        id: "brain build vs engine version",
        claimed: bb, actual: ev, ok: bb === ev,
        why: "BRAIN_BUILD announces the build in every log line; when it lags, every log lies about which code produced it",
    });

    return rows;
}

/**
 * Derived facts that need a module loaded, so they are async and live beside the synchronous ones rather than
 * inside them. Same class, same rule -- a number that describes the tree, baked into a file, with nothing
 * comparing it to the tree.
 *
 * ALL THREE OF THESE WERE FOUND BY A RIG RUN, NOT BY THIS MODULE (v2999). v2976 built staleness.mjs after three
 * derived facts shipped stale, checked the three it knew about, and stopped. Keith ran the full suite on Windows
 * and three MORE went red for exactly the same reason -- a baked count nobody compares to reality:
 *
 *     labDevices asserted the registry holds TWENTY-FOUR devices; it holds twenty-seven.
 *     promptCost's cost model declared NINETEEN; same registry, same twenty-seven.
 *     case-study advertised a claim count that no longer matched predictions.html.
 *
 * The lesson is not that those three were missed. It is that "derived fact" is a CLASS and I enumerated
 * instances -- so the module found what it was told to look for and nothing else. These are the instances that
 * existed; a future one will need adding the same way, which is worth saying out loud rather than pretending
 * this list is now complete.
 */
export async function asyncStalenessRows() {
    const rows = [];
    let live = null;
    try { live = (await import("../roundhouse/devices.mjs")).DEVICE_NAMES.length; } catch {}

    // 1. the gate's own expectation of how many devices exist
    const labSrc = readOr("tools/ship/labDevices-selfcheck.mjs");
    // v2999 -- IT IS A FLOOR NOW, NOT AN EQUALITY, and the check had to change shape with it. The gate used to
    // assert `DEVICE_NAMES.length === 24` and went red the moment a device was added, reading as a BROKEN
    // REGISTRY rather than a stale number. It now asserts the registry has not SHRUNK.
    //
    // So the derived-fact question changed too. A floor BELOW the live count is correct and expected -- that is
    // headroom. A floor ABOVE it is a real break: either devices vanished or someone raised the ratchet past
    // reality. Only the second is staleness, and asserting equality here would have re-created the churn the
    // floor was introduced to end.
    const labM = labSrc.match(/DEVICE_NAMES\.length >= (\d+)/);
    const floor = labM ? Number(labM[1]) : null;
    rows.push({
        id: "labDevices registry floor",
        claimed: floor, actual: live, ok: floor !== null && live !== null && floor <= live,
        why: "a floor ABOVE the live registry means devices vanished or the ratchet was raised past reality; a floor below it is headroom and is fine",
    });

    // *** v3929 -- THE DEVICES TOOLTIP IN server.html, WHICH HAS NOW DRIFTED TWICE. ***
    // lab-scene-run-selfcheck watches it, and its own header records the first drift: "IT READ 'Nineteen
    // devices' AGAINST A REGISTRY OF 75 -- FIFTY-SIX BEHIND." It was corrected to 75 BY HAND, the registry is
    // now 108, and it drifted again the moment devices were added. A HAND-MAINTAINED NUMBER DRIFTS AS OFTEN AS
    // SOMEBODY FORGETS. It belongs with the other derived facts, in the file whose whole job is that -- and it
    // goes in the ASYNC list because the live count needs devices.mjs, which is exactly why this list exists.
    const tt = readOr("server.html").match(/title="Point a model at a physics instrument[^"]*?(\d+) devices/);
    rows.push({
        id: "server.html devices tooltip",
        claimed: tt ? Number(tt[1]) : null, actual: live,
        ok: !!tt && live !== null && Number(tt[1]) === live,
        why: "a numeral in a tooltip is read as a fact about the lab; when it lags, the first thing a visitor learns about the registry is wrong",
    });

    // 2. the cost model's device count -- it multiplies per-device, so a wrong count is a wrong answer
    const pcSrc = readOr("tools/roundhouse/promptCost.mjs");
    const pcM = pcSrc.match(/devices:\s*(\d+)/);
    rows.push({
        id: "promptCost device count",
        claimed: pcM ? Number(pcM[1]) : null, actual: live, ok: !!pcM && live !== null && Number(pcM[1]) === live,
        // v3311 -- THIS JUSTIFICATION WAS FALSE WHEN WRITTEN AND IS TRUE NOW. Nothing multiplied by the count;
        // the multiplication lived in a sentence in promptCost's header, and a sentence does not recompute.
        // fullMatrixTokens() makes it real, so watching this number now protects an actual computation rather
        // than a claim about one.
        why: "fullMatrixTokens() multiplies by this, so a stale count does not merely mislabel a page -- it produces a wrong number that looks measured",
    });

    // 3. the claim count a reader sees on the case study
    let liveClaims = null;
    try {
        const { extractClaims } = await import("./claimsGate.mjs");
        liveClaims = extractClaims(readOr("predictions.html")).length;
    } catch {}
    const csM = readOr("case-study.html").match(/<b>(\d+)<\/b><span>claims<\/span>/);
    rows.push({
        id: "case-study claim count",
        claimed: csM ? Number(csM[1]) : null, actual: liveClaims, ok: !!csM && liveClaims !== null && Number(csM[1]) === liveClaims,
        why: "the same rule as the gate count beside it: the number a reader sees is the number that is true, or the page is advertising",
    });

    return rows;
}

/** Convenience: are they all fresh? */
export function isFresh() { return stalenessRows().every((r) => r.ok); }

/**
 * v3929 -- isFresh() reads the SYNC rows only, and it is exported and called elsewhere, so its meaning is left
 * alone. But the CLI prints both lists and then printed a verdict from half of them: the run that added the
 * devices tooltip showed "STALE server.html devices tooltip" and, three lines later, "all derived facts match".
 * A SUMMARY THAT DISAGREES WITH THE ROWS ABOVE IT TEACHES PEOPLE TO SKIP THE SUMMARY. The CLI uses this instead.
 */
export async function isFreshAll() {
    return isFresh() && (await asyncStalenessRows()).every((r) => r.ok);
}

/**
 * v3087 -- THE ONLY DERIVED NUMBER IN THE RITUAL THAT WAS STILL EDITED BY HAND.
 *
 * knowledge-index.json has had a re-bake command since v2888: add a gate, run buildKnowledgeIndex.mjs, done.
 * The case-study gate count did not. Every round that added a gate file, somebody had to open case-study.html,
 * find <b>NNN</b><span>gates</span>, and retype it -- and this session did exactly that three times, at v3081,
 * v3082 and v3083, having first been TOLD the number by a red gate.
 *
 * THAT IS THE SHAPE THAT FROZE THE CHANGELOG FOR FORTY VERSIONS: a manual step beside the ritual, surviving
 * exactly as long as somebody's habit, with a check that reports the drift rather than removing the chance of
 * it. staleness has always known both numbers -- it is the file that COMPARES them -- so it was one function
 * away from being able to close the gap it exists to report.
 *
 * IT WRITES ONLY WHAT IT CAN DERIVE, AND ONLY WHEN ASKED. --fix is never part of a check run: a gate that
 * repaired what it measured could never be observed failing, which is the rule lib/derivedCache.js (v3065)
 * states for the four caches and which applies with more force to a gate. It also refuses to invent a row it
 * does not know how to write, rather than reporting success for a fact it left stale.
 */
export function fixDerived({ write = true } = {}) {
    const applied = [], skipped = [];
    for (const r of stalenessRows()) {
        if (r.ok) continue;
        if (r.id === "case-study gate count") {
            const rel = "case-study.html", file = path.join(ENG, rel);
            const before = readOr(rel);
            const after = before.replace(/<b>\d+<\/b><span>gates<\/span>/, "<b>" + r.actual + "</b><span>gates</span>");
            if (after === before) { skipped.push(r.id + " -- the marker was not found in " + rel); continue; }
            if (write) fs.writeFileSync(file, after);
            applied.push(r.id + ": " + r.claimed + " -> " + r.actual);
        } else {
            // NAMED, NOT SILENTLY PASSED OVER. A --fix that quietly ignored the rows it cannot write would
            // report success while leaving the tree stale, which is worse than not having the flag.
            skipped.push(r.id + " -- not writable from here (" + r.claimed + " vs " + r.actual + ")" +
                (r.id === "knowledge-index gate count" ? "; run tools/ship/buildKnowledgeIndex.mjs" : ""));
        }
    }
    return { applied, skipped, clean: applied.length === 0 && skipped.length === 0 };
}

/**
 * v3929 -- the rows that need an IMPORT to know their actual value cannot be reached from the sync fixer, so
 * they get their own. fixDerived keeps its signature and its contract exactly; this is additive, and the CLI
 * runs both so `--fix` still means one command.
 */
export async function fixDerivedAsync({ write = true } = {}) {
    const applied = [], skipped = [];
    for (const r of await asyncStalenessRows()) {
        if (r.ok) continue;
        if (r.id === "server.html devices tooltip" && r.actual != null) {
            const rel = "server.html", file = path.join(ENG, rel);
            const before = readOr(rel);
            const after = before.replace(/(title="Point a model at a physics instrument[^"]*?)\d+( devices)/,
                                         "$1" + r.actual + "$2");
            if (after === before) { skipped.push(r.id + " -- the marker was not found in " + rel); continue; }
            if (write) fs.writeFileSync(file, after);
            applied.push(r.id + ": " + r.claimed + " -> " + r.actual);
        } else {
            skipped.push(r.id + " -- not writable from here (" + r.claimed + " vs " + r.actual + ")");
        }
    }
    return { applied, skipped, clean: applied.length === 0 && skipped.length === 0 };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const fix = process.argv.includes("--fix");
    const rSync = fix ? fixDerived() : { applied: [], skipped: [], clean: await isFreshAll() };
    const rAsync = fix ? await fixDerivedAsync() : { applied: [], skipped: [], clean: true };
    const r = { applied: [...rSync.applied, ...rAsync.applied], skipped: [...rSync.skipped, ...rAsync.skipped],
                clean: rSync.clean && rAsync.clean };
    if (!fix) {
        for (const row of [...stalenessRows(), ...await asyncStalenessRows()]) console.log((row.ok ? "  ok    " : "  STALE ") + row.id + ": claimed " + row.claimed + ", actual " + row.actual);
        console.log(r.clean ? "\n[staleness] all derived facts match. --fix would do nothing." : "\n[staleness] run with --fix to rewrite what can be derived.");
        process.exit(r.clean ? 0 : 1);
    }
    for (const a of r.applied) console.log("[staleness] fixed " + a);
    for (const sk of r.skipped) console.log("[staleness] NOT fixed: " + sk);
    if (r.clean) console.log("[staleness] nothing to fix.");
    process.exit(r.skipped.length ? 1 : 0);
}
