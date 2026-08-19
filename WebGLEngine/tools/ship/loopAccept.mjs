// tools/ship/loopAccept.mjs -- v3749
//
// *** STEP 5 OF THE SIX: THE HOLDOUT, ENFORCED AT ACCEPT TIME. *** v3747 declared the split and said outright
// that declaring is not enforcing. This is the enforcement, and it does two things v3747 did not: it CHECKS
// THE HOLDOUT WHEN A CANDIDATE IS ACCEPTED, and it KEEPS A LEDGER OF EVERY TIME THE HOLDOUT IS LOOKED AT.
//
// *** AND IT CLOSES THE GAP v3747 NAMED ABOUT ITSELF: THE HOLDOUT WAS A DIFFERENT SIZE, NOT A DIFFERENT KIND.
// Every fixture in the eval and in the noise ensemble is a SMOOTH SINE PRODUCT, so a candidate tuned to smooth
// fields would have met a holdout made of smooth fields. MEASURED at n=24, tol 1e-8: smooth 36, step 33,
// blob 40, checker 25 -- FOUR PROBLEM CLASSES SPANNING 25..40, WIDER THAN THE WITHIN-KIND SPREAD (33..38).
// So the holdout is now TWO members: a different SIZE (smooth at n=32) and a different KIND (a compact blob
// source at n=24, the hardest of the four at 40 iterations). ***
//
// *** THE HOLDOUT HAS ITS OWN NOISE FLOOR AND IT IS NOT THE EVAL'S. Measured across the eight-fixture ensemble
// at n=32: 41, 41, 41, 41, 43, 46, 46, 46 -- sd 2.32, FLOOR 5, against the eval's 3. Judging a holdout
// regression against the EVAL's floor would have been the v3724 mistake -- TWO NUMBERS ARE ONLY COMPARABLE IF
// THE THING LIMITING THEM IS THE SAME. ***
//
// *** THE LEDGER IS A LEDGER, NOT A LOCK, AND SAYING SO IS THE POINT. Nothing in JavaScript stops a search
// from importing loopNoise and building the holdout field itself; a module-scope counter cannot prevent that.
// What it CAN do is make peeking VISIBLE -- every read goes through holdoutScore() and is counted, so a gate
// can assert the accept path consults it a known number of times, and step 6's trace can show any run that
// consulted it more. AN UNENFORCEABLE RULE THAT IS RECORDED BEATS ONE THAT IS ONLY WRITTEN DOWN. ***

import { measure } from "./loopMetric.mjs";
import { floorIters, fieldFor, FIXTURE_FAMILY } from "./loopNoise.mjs";
import { acceptable } from "./loopTarget.mjs";
import { record } from "./loopTrace.mjs";
import { PoissonMG3D, AIR, FLUID, SOLID } from "../../fluid/multigrid3d.mjs";

/** A compact spherical source -- discontinuous, and NOT a sine product. The different KIND. */
export function blobField(n) {
    const N = n * n * n, type = new Uint8Array(N), div = new Float32Array(N);
    const r2 = (n * 0.15) ** 2;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const c = i + n * (j + n * k);
        const wall = (i === 0 || j === 0 || k === 0 || i === n - 1 || k === n - 1);
        type[c] = wall ? SOLID : (j >= n - 3 ? AIR : FLUID);
        if (type[c] !== FLUID) continue;
        const dx = i - n / 2, dy = j - n / 2, dz = k - n / 2;
        div[c] = (dx * dx + dy * dy + dz * dz < r2) ? 1 : 0;
    }
    return { type, div, N };
}

export const HOLDOUT_MEMBERS = [
    { id: "size32", why: "a different SIZE -- smooth field at n=32", n: 32, kind: "smooth", floor: 5 },
    { id: "kindBlob", why: "a different KIND -- a discontinuous compact source at n=24", n: 24, kind: "blob", floor: 5 },
];

// *** THE LEDGER. Module scope on purpose: it survives across calls within a run, which is what makes a peek
// during search distinguishable from the one at accept. ***
let _peeks = [];
export function holdoutPeeks() { return _peeks.slice(); }
export function resetHoldoutLedger() { _peeks = []; }

/** THE ONLY READ PATH. Every call is recorded, with WHO asked, because an unattributed count cannot be audited. */
export function holdoutScore(member, by = "unattributed") {
    _peeks.push({ id: member.id, by, at: _peeks.length });
    if (member.kind === "blob") {
        const { type, div, N } = blobField(member.n);
        const mg = new PoissonMG3D(member.n, member.n, member.n, { pre: 2, post: 2 });
        mg.solveCG(type, div, 1 / 60, new Float32Array(N), { maxIters: 400, tol: 1e-8 });
        return (Number.isFinite(mg.res) && mg.res <= 1e-8) ? mg.iters : null;
    }
    const r = measure({ n: member.n, tol: 1e-8 });
    return r.score;
}

/**
 * *** THE ACCEPT RULE, AND THE ORDER IS THE ARGUMENT: THE EVAL DECIDES FIRST AND THE HOLDOUT ONLY VETOES.
 * A holdout consulted BEFORE the eval verdict is just a third eval arm, and a candidate could then be selected
 * FOR its holdout score -- which is the whole thing a holdout exists to prevent. So a candidate the eval
 * rejects is returned WITHOUT the holdout ever being read, and the ledger proves it. ***
 *
 * @returns {{ accept, why, eval: object, holdout: object|null, peeks: number }}
 */
export function acceptWithHoldout(baselineResult, candidateResult, opts = {}) {
    // *** v3750 -- `what` IS REQUIRED AND THE ATTEMPT IS RECORDED HERE, NOT BY THE CALLER. A trace the caller
    // must remember to write is a trace with holes exactly where a search went wrong, and "the caller must
    // remember" is the shape that produced v3746's too-permissive rule. THE ONLY WAY TO GET A VERDICT IS TO
    // LEAVE A ROW. ***
    const what = opts.what;
    if (typeof what !== "string" || !what.trim()) {
        throw new Error("acceptWithHoldout(..., { what }): `what` is required -- every attempt leaves a trace " +
                        "row, and an attempt nobody can name is a row nobody can act on.");
    }
    const ev = acceptable(baselineResult, candidateResult, opts);
    if (!ev.accept) {
        const rejected = { accept: false, why: "eval: " + ev.why, eval: ev, holdout: null, peeks: holdoutPeeks().length };
        record(what, rejected);   // *** REJECTIONS ARE RECORDED TOO -- a trace of accepts is a highlight reel ***
        return rejected;
    }

    const rows = [];
    for (const m of HOLDOUT_MEMBERS) {
        const before = holdoutScore(m, "accept:baseline");
        const after = holdoutScore(m, "accept:candidate");
        // *** null IS A VETO, NOT A SKIP. A holdout arm that stopped converging is the single most important
        // thing a candidate can do, and treating an unreadable arm as "no objection" would invert it. ***
        const regressed = (before === null || after === null) || (after - before > m.floor);
        rows.push({ id: m.id, before, after, delta: (before === null || after === null) ? null : after - before,
                    floor: m.floor, regressed, why: m.why });
    }
    const bad = rows.filter((r) => r.regressed);
    const out = {
        accept: bad.length === 0,
        why: bad.length
            ? "HOLDOUT VETO on " + bad.map((r) => r.id + " (" + (r.delta === null ? "did not converge" : "+" + r.delta + " > floor " + r.floor) + ")").join(", ")
            : "eval accepted and no holdout member regressed",
        eval: ev, holdout: rows, peeks: holdoutPeeks().length,
    };
    record(what, out);
    return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    resetHoldoutLedger();
    const same = acceptWithHoldout({ score: 36, tol: 1e-8 }, { score: 35, tol: 1e-8, met: true }, { what: "demo: a one-iteration change" });
    console.log("[loopAccept] 36 -> 35 (inside the eval floor): " + same.accept + " -- " + same.why);
    console.log("[loopAccept]   holdout peeks so far: " + same.peeks + "  (the eval rejected it, so none)");
    resetHoldoutLedger();
    const win = acceptWithHoldout({ score: 36, tol: 1e-8 }, { score: 31, tol: 1e-8, met: true }, { what: "demo: a five-iteration change" });
    console.log("[loopAccept] 36 -> 31 (clears the eval floor): " + win.accept + " -- " + win.why);
    for (const r of win.holdout) console.log("             " + r.id.padEnd(9) + r.before + " -> " + r.after + "   floor " + r.floor + "   " + r.why);
    console.log("[loopAccept]   holdout peeks: " + win.peeks + " (" + HOLDOUT_MEMBERS.length + " members x 2 arms)");
}
