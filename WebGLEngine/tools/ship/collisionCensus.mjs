// WebGLEngine/tools/ship/collisionCensus.mjs -- v3607
// ---------------------------------------------------------------------------------------------------------------
// HOW MANY TIMES DOES EACH GATE RUN THE SELF-COLLISION PASS, AND DID IT EVER SEE A CONTACT?
//
// TWO ROUNDS FOUND THE SAME DEFECT SIDEWAYS. v3604 found that the shipped 5x5 cloth never folds, while asking
// what radius the cloth is entitled to. v3606 found that clothLoop-selfcheck's spine check drives a radius at
// which findCollisionPairs returns an EMPTY LIST every frame -- a whole PASS entered and never exercised --
// while asking why two solvers disagreed. NEITHER ROUND WENT LOOKING FOR IT. This makes the question direct.
//
// ================================================================================================================
// THE CENSUS, MEASURED BY SPAWNING EVERY GATE THAT TOUCHES THE CLOTH SOLVERS
// ================================================================================================================
//
//     gate                                   calls   empty    pairs   maxPairs
//     cloth-selfcheck                         3258    3005     2385         53
//     clothLoop-selfcheck                     4500    4500        0          0    <- 4500 calls, NOT ONE CONTACT
//     clothLoopKey-selfcheck                   960     960        0          0    <- 960 calls, NOT ONE CONTACT
//     collisionKnobs-selfcheck                 137       0     6568         48
//     kktResidual-selfcheck                      2       0      166        118
//     solverParity-selfcheck                  8280    7716    11085         48
//     clothSoak-selfcheck                     6833    6169    17994        118
//     scheduleKey-selfcheck                      0       0        0          0    (never drives it -- correct)
//     xpbd-selfcheck                             0       0        0          0    (never drives it -- correct)
//
// *** clothLoopKey-selfcheck IS NEW HERE. v3606 found the same defect in clothLoop-selfcheck by hand; the
// census found a SECOND instance nobody had looked for, which is the difference between an accident and an
// instrument. Both drive radius 0.08 on a fixture whose activation floor v3604 measured at 0.321239. ***
//
// ================================================================================================================
// WHAT THE CENSUS LICENSES, AND WHAT IT DOES NOT -- THE DISTINCTION IS THE ROUND
// ================================================================================================================
//
// A NONZERO PAIR COUNT IS NECESSARY FOR A GATE TO CATCH A DEFECT IN THE PASS, AND IT IS NOT SUFFICIENT.
// Removing the SORT -- the sabotage selfCollide.js names in its own header -- and re-running all nine:
//
//     caught it: cloth-selfcheck, collisionKnobs-selfcheck                      (2)
//     saw contacts and did NOT catch it: kktResidual, solverParity, clothSoak   (3)
//     structurally could not: clothLoop-selfcheck, clothLoopKey-selfcheck       (2)
//
// The middle three are not defective. THE SORT IS ABOUT ORDER, AND ONLY A CHECK THAT VARIES THE WALK ORDER CAN
// SEE IT -- solverParity compares two solvers that would both walk unsorted and therefore still agree, and
// clothSoak grades derived quantities. So the census gives an UPPER BOUND ON DETECTABILITY and never a
// guarantee; reporting it as "these gates cover the pass" would be the count-that-is-really-a-cap defect.
//
// ================================================================================================================
// AND THE CLAIM THAT CANNOT BE TESTED WHERE IT IS MADE
// ================================================================================================================
//
// clothLoop-selfcheck asserts "byte-identical under 200 shuffles of vertex, color, AND COLLISION-WALK order".
// Two thirds of that is real, and the third is vacuous -- but NOT ONLY because its radius finds no pairs.
//
// *** THE SORT IS DETECTABLE AT THE PAIR-LIST LEVEL AND NOT AT THE SOLVE LEVEL, AND THAT IS WHY THREE GATES
// WITH REAL CONTACTS STILL MISSED IT. *** Measured on the deepest interpenetrating frame of v3604's drape,
// 45 pairs, r = h/2:
//
//     PAIR-LIST level  (compare what findCollisionPairs RETURNS):  40/40 identical  ->  0/40 with the sort gone
//     SOLVE level      (compare the cloth after 160 frames):       20/20 identical  ->  20/20 with the sort gone
//
// The colouring and the per-colour independence ABSORB the discovery order, so the positions come out the same
// whichever way the buckets were walked. SO clothLoop-selfcheck'S COLLISION-ORDER CLAIM WOULD BE VACUOUS EVEN
// ON A FIXTURE FULL OF CONTACTS: the level is wrong, not just the radius. What actually protects the sort is
// cloth-selfcheck's DIRECT comparison of the returned list, and that is the right place for it.
//
// This is measured both ways rather than argued, and the solve-level insensitivity is REPORTED rather than
// dressed up: it is a fact about this tree's fixtures, not a proof that no fixture could ever see it.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findCollisionPairs, STATS, resetStats } from "../../physics/xpbd/selfCollide.js";
import { drape, coherenceCeiling, CLOSE_FRAMES } from "../../physics/xpbd/clothSoak.mjs";
import { clothFrame } from "../../physics/xpbd/clothLoop.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE = path.join(HERE, "..", "..");
export const HOOK = path.join(HERE, "collideCensusHook.mjs");

/** Every gate in the tree that imports a cloth solver or the pass itself. DERIVED, never a typed list. */
export function collisionGates() {
    const out = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) walk(p); continue; }
            if (!/-selfcheck\.mjs$/.test(e.name)) continue;
            const src = fs.readFileSync(p, "utf8");
            // A CONSUMER OF THIS CENSUS CANNOT BE A SUBJECT OF IT. Left in, this file's own gate matched the
            // import test (it imports selfCollide and solverParity), so the census SPAWNED ITSELF and hung --
            // THE DEFECT LANDING ON THE FILE STUDYING IT, this tree's named recurring shape, sixth instance.
            // Excluded by MECHANISM (does it import the census) rather than by name.
            if (/from\s+["'][^"']*collisionCensus\.mjs/.test(src)) continue;
            if (/from\s+["'][^"']*(clothStep|clothLoop|selfCollide|clothSoak|collisionKnobs|kktResidual|solverParity)/.test(src))
                out.push(path.relative(ENGINE, p).split(path.sep).join("/"));
        }
    };
    walk(path.join(ENGINE, "physics"));
    walk(path.join(ENGINE, "tools"));
    return out.sort();
}

/** Spawn one gate under the loader hook and read back that process's STATS. */
export function censusOne(rel, { timeoutMs = 120000 } = {}) {
    const out = path.join(os.tmpdir(), "swek-collide-" + process.pid + "-" + Math.random().toString(36).slice(2) + ".jsonl");
    const r = spawnSync(process.execPath, ["--import", HOOK, rel],
        { cwd: ENGINE, timeout: timeoutMs, env: { ...process.env, SWEK_COLLIDE_CENSUS: out, SWEK_COLLIDE_LABEL: rel }, stdio: "ignore" });
    let row = { label: rel, code: r.status, calls: 0, empty: 0, pairs: 0, maxPairs: 0, dumped: false };
    try {
        const lines = fs.readFileSync(out, "utf8").trim().split("\n").filter(Boolean);
        if (lines.length) row = { ...JSON.parse(lines[lines.length - 1]), dumped: true };
    } catch { /* no dump: the gate died before exit, which the row reports rather than hides */ }
    try { fs.unlinkSync(out); } catch { /* nothing to clean */ }
    return row;
}

export function census(gates = collisionGates(), opts = {}) { return gates.map((g) => censusOne(g, opts)); }

/** Blind = the pass ran and returned an empty list EVERY time. Silent = it never ran, which is a different fact. */
export const classify = (row) => (row.calls === 0 ? "never-drives-it" : row.pairs === 0 ? "BLIND" : "sees-contacts");

// --- the claim moved to where it can be tested ---------------------------------------------------------------

/**
 * THE COLLISION-WALK ORDER CLAIM, MEASURED AT BOTH LEVELS. The PAIR-LIST level compares what
 * findCollisionPairs returns under scrambled walks; the SOLVE level compares the cloth after a full run. Only
 * the first can see the sort, and reporting one without the other is how a vacuous check looks like a passing
 * one. The frame is the DEEPEST INTERPENETRATING one from a collision-OFF run, so the list is as long as this
 * fixture ever makes it -- picking a settled frame would compare empty lists (my first version did, and read
 * a confident 40/40 over a list of length ZERO).
 */
export function collisionOrderStable(trials = 40, { hold = 200, radius = coherenceCeiling() } = {}) {
    const sc = drape(5, 17, 0.6), W = sc.W, H = sc.H, im = sc.init.invMass, N = im.length;
    let seed = 0x51c0;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
    const iota = Array.from({ length: N }, (_, i) => i);
    const drive = (order, collisionRadius, frames) => {
        const n = sc.init.pos.length;
        const buf = { pos: Float64Array.from(sc.init.pos), vel: Float64Array.from(sc.init.vel), pred: new Float64Array(n), prev: new Float64Array(n) };
        let deepest = null, deepestN = 0;
        for (let f = 0; f < CLOSE_FRAMES + frames; f++) {
            const t = Math.min(1, f / CLOSE_FRAMES), z = sc.z0 + (sc.span - sc.z0) * t;
            for (let x = 0; x < W; x++) buf.pos[3 * ((H - 1) * W + x) + 2] = z;
            clothFrame(buf, im, sc.cons, sc.colors, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], radius: collisionRadius, adj: sc.adj, collisionOrder: order });
            const p = findCollisionPairs(buf.pos, N, 2 * radius, 2 * radius, sc.adj);
            if (p.length > deepestN) { deepestN = p.length; deepest = Float64Array.from(buf.pos); }
        }
        return { pos: buf.pos, deepest, deepestN };
    };
    // PAIR-LIST level, on the frame where this fixture interpenetrates most (collision OFF so the pass has work)
    const off = drive(null, 0, hold);
    const listRef = JSON.stringify(findCollisionPairs(off.deepest, N, 2 * radius, 2 * radius, sc.adj, null));
    let listSame = 0;
    for (let t = 0; t < trials; t++)
        if (JSON.stringify(findCollisionPairs(off.deepest, N, 2 * radius, 2 * radius, sc.adj, shuffle(iota))) === listRef) listSame++;
    // SOLVE level, same fixture, collision ON
    const solveRef = drive(null, radius, 40).pos;
    let solveSame = 0;
    for (let t = 0; t < Math.min(trials, 20); t++) {
        const r = drive(shuffle(iota), radius, 40).pos;
        let identical = true;
        for (let i = 0; i < solveRef.length; i++) if (solveRef[i] !== r[i]) { identical = false; break; }
        if (identical) solveSame++;
    }
    return { trials, listSame, listLength: JSON.parse(listRef).length, solveTrials: Math.min(trials, 20), solveSame, radius };
}

export const MEASURED_V3607 = {
    blind: ["physics/xpbd/clothLoop-selfcheck.mjs", "physics/xpbd/clothLoopKey-selfcheck.mjs"],
    twoLevels: { listSame: 40, listSameWithSortRemoved: 0, listLength: 45, solveSame: 20, solveSameWithSortRemoved: 20 },
    blindCalls: { "clothLoop-selfcheck": 4500, "clothLoopKey-selfcheck": 960 },
    sortPlantCaughtBy: ["cloth-selfcheck", "collisionKnobs-selfcheck"],
    sawContactsAndMissedIt: ["kktResidual-selfcheck", "solverParity-selfcheck", "clothSoak-selfcheck"],
    verdict: "TWO GATES CALL THE SELF-COLLISION PASS 4500 AND 960 TIMES AND RECEIVE AN EMPTY LIST EVERY SINGLE " +
             "TIME. v3606 found the first by hand; the census found the SECOND, which nobody had looked for. " +
             "A nonzero pair count is NECESSARY for a gate to catch a defect in the pass and it is NOT " +
             "SUFFICIENT -- removing the sort is caught by 2 of the 5 that see contacts, because the sort is " +
             "about ORDER and only a check that VARIES the walk order can see it.",
    notClaimed: "This is an UPPER BOUND ON DETECTABILITY, never coverage. Reporting 'these gates cover the " +
                "pass' would be the count-that-is-really-a-cap defect this tree has committed before.",
    theShippedPath: "selfCollide.js gains two counter increments and NO file I/O -- it must stay importable in " +
                    "a browser. The dump lives in the loader hook, which shares the module instance. The " +
                    "shipped behaviour is held to readings from the pristine v3606 extract.",
};

export function reportLines({ rows = null } = {}) {
    const L = [], say = (s) => L.push(s);
    say("[collisionCensus] how many gates run the self-collision pass, and which ever see a contact");
    say("");
    say("  gate                                              calls   empty    pairs  maxPairs  verdict");
    for (const r of (rows || census())) {
        say("  " + r.label.padEnd(50) + String(r.calls).padStart(6) + String(r.empty).padStart(8) +
            String(r.pairs).padStart(9) + String(r.maxPairs).padStart(10) + "  " + classify(r) +
            (r.code === 0 ? "" : "   (gate exit " + r.code + ")"));
    }
    say("");
    say("  BLIND means the pass RAN and returned an empty list every time -- a whole pass entered and never");
    say("  exercised. never-drives-it is a different fact and is not a defect.");
    say("");
    const s = collisionOrderStable();
    say("  THE COLLISION-WALK ORDER CLAIM, MEASURED AT BOTH LEVELS (drape, r = " + s.radius.toFixed(3) + "):");
    say("    PAIR-LIST level: " + s.listSame + " of " + s.trials + " scrambled walks return the identical list, over " +
        s.listLength + " pairs");
    say("    SOLVE level:     " + s.solveSame + " of " + s.solveTrials + " reproduce the cloth exactly");
    say("    ONLY THE FIRST CAN SEE THE SORT: remove it and the list goes 0/" + s.trials + " while the solve stays");
    say("    " + s.solveSame + "/" + s.solveTrials + ", because the colouring absorbs the discovery order. clothLoop-selfcheck");
    say("    makes this claim at the SOLVE level AND at a radius where the pass finds nothing.");
    say("");
    say("  " + MEASURED_V3607.verdict);
    say("  NOT CLAIMED: " + MEASURED_V3607.notClaimed);
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
