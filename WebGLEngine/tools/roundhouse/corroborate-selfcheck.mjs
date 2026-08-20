// tools/roundhouse/corroborate-selfcheck.mjs
//
// Run: node tools/roundhouse/corroborate-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2891 -- THE PHASE WHERE THE LAB STOPS ONLY CONFIRMING THINGS.
//
// Twenty-two devices, every one graded against an answer key. That earned the instrument its trust and it also
// means no device has ever produced a fact nobody already had. This gate holds the machinery that lets a
// measurement with NO closed form count as knowledge -- four independent attacks, none of which needs to know
// the right answer (pre-registration, seed stability, resolution stability, portability-by-construction) -- and
// then applies it to the two quantities in this tree that have always been unkeyed.
//
// The result is one corroboration and one REFUSAL, and the refusal is the more valuable of the two.

import { corroborate, preRegister, crossCheck, measurePortability, corroborationLine } from "./corroborate.mjs";
import { measureBaseline, runCrossChecks, corroborateLyapunov, lyapunov, BASELINE } from "./physicsBaseline.mjs";
import { measureAquariumD } from "../../physics/blobThermal.js";
import { strictLog2 } from "../strictMath.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE ESTIMATOR EARNS ITS LICENCE ON THE ONE POINT THAT HAS A KEY -----------------------------------------
{
    const measured = lyapunov(4, 320000, 0.1234, strictLog2);
    ok("!! the Lyapunov estimator recovers ln 2 at r=4, where the closed form is exact",
        Math.abs(measured - Math.LN2) < 1e-5,
        measured.toFixed(9) + " vs ln 2 = " + Math.LN2.toFixed(9) + " -- validating an instrument where a key EXISTS is what earns it the right to be believed where none does");
}

// ---- 2. AND THEN MEASURES SOMETHING NOBODY OWNS THE ANSWER TO ----------------------------------------------------
{
    const r = await corroborateLyapunov(3.8);
    ok("!! the logistic exponent at r=3.8 -- no closed form -- is CORROBORATED on all four criteria",
        r.corroborated === true, corroborationLine(r));
    ok("...pre-registered: the claim was frozen before the sweep ran", r.criteria.preRegistered === true,
        "the loop enforces this structurally; preRegister makes it auditable");
    ok("...seed-stable: four different initial conditions of a deterministic map agree",
        r.criteria.seedStable === true, "relative spread " + (r.seed.relativeSpread * 100).toFixed(3) + "%");
    ok("...resolution-stable: the value stops moving as the iteration count grows",
        r.criteria.resolutionConverged === true,
        "tail spread " + (r.resolution.relStep * 100).toFixed(3) + "% of value" + (r.resolution.monotone ? "" : " (non-monotone -- a 1/sqrt(N) ergodic average, not a grid refinement)"));
    ok("...portable: zero raw libm calls, so no two conforming machines can disagree about it",
        r.criteria.portable === true, "strictLog2 throughout");
}

// ---- 3. PORTABILITY IS A REAL DISCRIMINATOR, NOT A RUBBER STAMP --------------------------------------------------
{
    const naive = (r, N, x0) => {
        let x = x0;
        for (let i = 0; i < 200; i++) x = r * x * (1 - x);
        let s = 0;
        for (let i = 0; i < N; i++) { s += Math.log(Math.abs(r * (1 - 2 * x))); x = r * x * (1 - x); }
        return s / N;
    };
    const strict = measurePortability(() => lyapunov(3.8, 5000, 0.1234, strictLog2));
    const loose = measurePortability(() => naive(3.8, 5000, 0.1234));
    ok("!! the SAME quantity is portable one way and per-platform the other",
        strict.rawCalls === 0 && loose.rawCalls === 5000,
        "strictLog2 spelling: 0 raw libm calls; Math.log spelling: " + loose.rawCalls +
        " -- identical mathematics, different contract, and the harness can tell without a second machine");
    ok("...and it names the offending line", loose.sites.length > 0 && /log @/.test(loose.sites[0]), loose.sites[0]);
}

// ---- 4. THE REFUSAL -- THE MORE VALUABLE HALF --------------------------------------------------------------------
{
    const measure = ({ resolution }) => measureAquariumD({ x: 0, y: 0, z: 0, r: 1, a: 1 },
        { n: resolution ?? 32, ext: 2, steps: 15, v: 1, dt: 1 / 60, rounds: 2 }).D;
    const r = corroborate({
        quantity: "blobarium advection scheme implicit diffusivity",
        measure, seeds: [1], resolutions: [24, 32, 40, 48],
        registration: preRegister({ quantity: "schemeD", claim: { observable: "schemeD", target: 0.0187, tol: 2e-3 },
            rationale: "v2596 measured 0.0187, called it 'the temperature nobody set', and the number has been quoted since" }),
    });
    ok("!! the engine's most-quoted unkeyed number is REFUSED: it is not a property, it is the grid's",
        r.corroborated === false && r.failed.includes("resolutionConverged"),
        r.resolution.values.map((v) => v.toFixed(6)).join(" -> ") + " across n=24,32,40,48 -- tail spread " +
        (r.resolution.relStep * 100).toFixed(1) + "% of value; it cools as the grid refines, so 0.0187 was a fact about n=32");
    ok("...and it fails ONLY that criterion -- the measurement was honest, the interpretation was not",
        r.failed.length === 1 && r.criteria.portable === true && r.criteria.preRegistered === true,
        "a corroboration report that said merely 'bad' would have taught nobody which of the four things went wrong");
}

// ---- 5. THE CONVERGENCE GATE ITSELF MUST NOT PASS A VANISHING QUANTITY --------------------------------------------
{
    // 1/n heading to zero: every successive difference shrinks, so a naive "differences shrink" test says CONVERGED.
    const vanishing = corroborate({ quantity: "1/n", measure: ({ resolution }) => 1 / resolution, seeds: [1], resolutions: [10, 20, 40, 80], registration: preRegister({ quantity: "1/n", claim: { observable: "x", max: 1 } }) });
    ok("!! an O(1/n) artefact is refused, though its differences shrink monotonically",
        vanishing.criteria.resolutionConverged === false,
        "the gate is the tail spread RELATIVE to the value (" + (vanishing.resolution.relStep * 100).toFixed(0) +
        "%), not whether the steps got smaller -- calibration caught the naive version passing this");
    // CORRECTION, v2902, recorded rather than quietly fixed. This fixture used to read seeds:[1,2,3] and assert
    // that the constant passed all four criteria -- and it did, under the old rule. But `() => 2.5` ignores its
    // seed, so those three "different seeds" returned the same bits three times: the fixture asserting that
    // criterion 2 passed was itself an experiment that never ran, in the file whose whole subject is experiments
    // that never run. The seed-vacuity guard added this round fires on it, correctly. The honest spelling of the
    // same intent is a SINGLE seed -- "deterministic by construction", which corroborate() has always accepted as
    // a stated fact rather than a tested one.
    const constant = corroborate({
        quantity: "a true constant", measure: ({ nuisance = 0 }) => 2.5 + 1e-12 * nuisance, seeds: [1], resolutions: [10, 20, 40],
        deterministic: "arithmetic on literals -- there is no stochastic input to seed",
        nuisance: { name: "an irrelevant knob", why: "the constant does not depend on it", values: [0, 1, 2, 3] },
        registration: preRegister({ quantity: "c", claim: { observable: "x", target: 2.5, tol: 1e-9 } }),
    });
    ok("...and a genuine constant passes all four", constant.corroborated === true);
    let refusedWaiver = false;
    try { corroborate({ quantity: "determinism as a free pass", measure: () => 1, deterministic: "because I said so", resolutions: [10, 20, 40] }); }
    catch { refusedWaiver = true; }
    ok("!! declaring determinism WITHOUT a nuisance parameter is refused -- the criterion is swapped, never waived",
        refusedWaiver, "otherwise every deterministic device in the lab gets criterion 2 for nothing");
    const vacuous = corroborate({ quantity: "a constant swept over seeds that do nothing", measure: () => 2.5, seeds: [1, 2, 3], resolutions: [10, 20, 40], registration: preRegister({ quantity: "c", claim: { observable: "x", target: 2.5, tol: 1e-9 } }) });
    ok("!! a seed sweep whose values are BIT-IDENTICAL is untested, not passed -- the knob never reached the computation",
        vacuous.seed.vacuous === true && vacuous.criteria.seedStable === null && vacuous.untested.includes("seedStable") && vacuous.corroborated === false,
        "three seeds in, one value out: the old rule scored that as evidence, and it was the same class of mistake as an exact-zero error");
    const untested = corroborate({ quantity: "no evidence at all", measure: () => 1, seeds: [1], resolutions: [] });
    ok("!! a quantity with no pre-registration and no sweeps is NOT corroborated -- silence is not evidence",
        untested.corroborated === false && untested.untested.includes("resolutionConverged") && untested.untested.includes("seedStable"),
        "untested criteria are reported as untested, never as passes");
}

// ---- 6. THE PHYSICS BASELINE: did the physics move? (the question hashes cannot answer) ---------------------------
{
    const rows = await measureBaseline();
    const drifted = rows.filter((r) => !r.within);
    ok("!! every pinned measured observable is within its earned tolerance",
        drifted.length === 0,
        rows.length + " entries: " + rows.map((r) => r.id + " " + (r.drift * 100).toFixed(4) + "%").join(", "));
    ok("...and the baseline distinguishes keyed, unkeyed and ARTEFACT entries",
        new Set(BASELINE.map((b) => b.kind)).size === 3 && BASELINE.some((b) => b.kind === "artefact" && b.condition),
        "the artefact entry is pinned WITH its condition -- which is how a resolution-dependent number stops being quoted as physics");
}

// ---- 7. CROSS-DEVICE: two instruments, one quantity, and a gap that means something -------------------------------
{
    const rows = await measureBaseline();
    const [isco] = await runCrossChecks(rows);
    ok("!! the exact geodesic and the PW onset disagree about the ISCO -- and that gap is DECLARED, not swept up",
        isco.verdict === "expected-gap" && isco.relDiff > 1e-3,
        "6M exactly vs " + isco.b.value.toFixed(5) + "M measured (" + (isco.relDiff * 100).toFixed(3) +
        "%): what the Paczynski-Wiita approximation costs, measured rather than assumed");
    const undeclared = crossCheck({ quantity: "q", a: { source: "a", value: 1 }, b: { source: "b", value: 1.5 }, tol: 0.01 });
    ok("...an UNDECLARED disagreement is a finding, not a shrug", undeclared.verdict === "disagree",
        "two self-consistent devices contradicting each other is the bug class no single device can catch");
    const vanished = crossCheck({ quantity: "q", a: { source: "a", value: 1 }, b: { source: "b", value: 1.0001 }, tol: 0.01, expectedGap: "should differ by 5%" });
    ok("!! a declared gap that VANISHES is flagged too -- agreement can be as alarming as disagreement",
        vanished.verdict === "gap-vanished" && vanished.note !== null, vanished.note);
}

console.log();
if (fails) { console.log("corroborate-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("corroborate-selfcheck: all checks pass");
