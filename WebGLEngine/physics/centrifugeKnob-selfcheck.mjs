// WebGLEngine/physics/centrifugeKnob-selfcheck.mjs -- v3597
// ---------------------------------------------------------------------------------------------------------------
// THE ROUND HAD A HAZARD NAMED IN ADVANCE AND THIS GATE IS WHERE IT WAS TESTED.
//
// v3596 found a recovered frequency and a closed form ALIASING IDENTICALLY -- agreeing perfectly about a mode
// that did not exist -- and closed by saying that centrifuge's key, an exponent recovered from a FIT against
// an exponent in a CLOSED FORM, could alias the same way and should be read against that finding first.
//
// *** SECTION 3 IS THAT TEST, AND THE ANSWER IS NO -- BECAUSE THEY DISAGREE BY A CONVERGING AMOUNT. *** If
// the fit were reading the closed form back it would return exactly -2 at every dt. It returns -1.995913 at
// dt = 1/60 and the error QUARTERS as dt quarters, which is forward Euler's own order. THE DISAGREEMENT IS
// WHAT MAKES THE AGREEMENT MEAN SOMETHING.
//
// And section 1 is the finding that made the round: the key the triage asked for is for a model this tree
// does not have. Asserted as an ABSENT MECHANISM in centrifuge.js rather than as an absent mention, because
// a comment saying "no diffusion here" would satisfy a text search.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sedCoeff, radialSpeed } from "./centrifuge.js";
import { adjudicate, score, propose, doublingTime, omegaExponent, rateFor,
         DT, SERIES_RADIUS, PARTICLE, FLUID } from "./centrifugeKnob.mjs";
import { registerAll } from "./knobRegistry.mjs";
import { resetRegistry, listProposers, getProposer, runProposer } from "./proposers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (n, c, note = "") => { if (c) { pass++; console.log("  ok   " + n + (note ? "  -- " + note : "")); }
                                  else { fail++; console.log("  FAIL " + n + (note ? "  -- " + note : "")); } };
const section = (n) => console.log("\n== " + n + " ==");

// ---------------------------------------------------------------------------------------------------------------
section("1. THE KEY THE TRIAGE ASKED FOR IS FOR A MODEL THAT IS NOT HERE");
{
    const src = fs.readFileSync(path.join(HERE, "centrifuge.js"), "utf8");
    // ABSENT MECHANISM, NOT ABSENT MENTION: a stochastic term needs a source of randomness or a temperature,
    // and neither appears. A prose claim would not satisfy this.
    ok("centrifuge.js has no randomness", !/Math\.random|randn|gauss/i.test(src));
    ok("...and no temperature or diffusion coefficient", !/\bkT\b|boltz|diffusiv|diffusion|brownian/i.test(src));
    ok("*** so there is no sedimentation EQUILIBRIUM and no concentration profile to grade ***",
       !/equilibr|profile/i.test(src), "drift plus a clamp: every particle reaches the wall");
    // AND THE MIRROR, SHOWN RATHER THAN DESCRIBED: radialSpeed multiplies by omega^2, so recovering omega^2
    // from it is exact by construction. Four exact digits over a 16x sweep is the give-away.
    const p = { a: PARTICLE.a, rho: PARTICLE.rho, r: 0.1, species: 0 };
    const rs = [1, 2, 4, 8, 16].map((w) => radialSpeed(p, { omega: w, ...FLUID }));
    const ratios = rs.slice(1).map((v, i) => v / rs[i]);
    ok("v3590's radialSpeed ratios really are EXACTLY 4, to the bit",
       ratios.every((r) => r === 4), ratios.join(", "));
    ok("*** and that is a MIRROR: nothing was integrated, so nothing was tested ***",
       /omega \* omega/.test(src.split("radialSpeed")[1] || ""));
}

// ---------------------------------------------------------------------------------------------------------------
section("2. TWO RIGHT ANSWERS, AND A CHECK AGAINST EITHER ALONE IS WRONG DIFFERENTLY");
{
    const rows = [20, 60, 100, 200].map((w) => {
        const k = rateFor(w), x = k * DT, T = doublingTime(w);
        return { w, x, T, relDisc: Math.abs(T - Math.LN2 / (Math.log(1 + x) / DT)) / (Math.LN2 / (Math.log(1 + x) / DT)),
                 dep: (T - Math.LN2 / k) / (Math.LN2 / k), pred: x / 2 };
    });
    ok("the stepper reproduces its OWN exact rate to machine precision",
       rows.every((r) => r.relDisc < 1e-9), "worst " + Math.max(...rows.map((r) => r.relDisc)).toExponential(2));
    ok("*** and it does NOT reproduce the continuous law -- which is correct, not a defect ***",
       rows.every((r) => r.dep > 1e-5), rows.map((r) => r.dep.toExponential(2)).join(" "));
    ok("the departure IS the leading series term x/2, predicted rather than fitted",
       rows.every((r) => Math.abs(r.dep - r.pred) <= (r.x * r.x) / 3),
       "measured/predicted " + rows.map((r) => (r.dep / r.pred).toFixed(4)).join(" "));
    // FIRST ORDER IN dt, WHICH IS WHAT SAYS IT IS DISCRETISATION AND NOT A MODEL ERROR (v3492's rule).
    const a = (doublingTime(100, { dt: DT }) - Math.LN2 / rateFor(100)) / (Math.LN2 / rateFor(100));
    const b = (doublingTime(100, { dt: DT / 4 }) - Math.LN2 / rateFor(100)) / (Math.LN2 / rateFor(100));
    ok("the departure QUARTERS when dt quarters", Math.abs(a / b - 4) < 0.05,
       a.toExponential(2) + " -> " + b.toExponential(2) + ", ratio " + (a / b).toFixed(3));
    // THE INTERPOLATION MATTERS AND IT IS NOT COSMETIC: a linear stopping rule leaves a dt-sized artefact
    // bigger than the effect. Shown by comparing against the raw step boundary.
    const raw = Math.ceil(doublingTime(100) / DT) * DT;
    ok("the geometric crossing interpolation is load-bearing",
       Math.abs(raw - doublingTime(100)) / doublingTime(100) > Math.abs(a),
       "step-boundary artefact " + (Math.abs(raw - doublingTime(100)) / doublingTime(100)).toExponential(2) +
       " against the physics departure " + a.toExponential(2));
}

// ---------------------------------------------------------------------------------------------------------------
section("3. *** THE ALIASING QUESTION v3596 NAMED, ASKED AND ANSWERED ***");
{
    const es = [DT, DT / 4, DT / 16].map((dt) => ({ dt, slope: omegaExponent({ dt }) }));
    for (const e of es) console.log("     dt " + e.dt.toExponential(3) + "  slope " + e.slope.toFixed(6));
    // IF THE FIT READ THE CLOSED FORM BACK, THIS WOULD BE EXACTLY -2 EVERYWHERE AND THE KEY WOULD BE VACUOUS.
    ok("*** the fitted exponent is NOT exactly -2 at any finite dt ***", es.every((e) => e.slope !== -2),
       es.map((e) => e.slope.toFixed(6)).join(" "));
    ok("...so the fit and the closed form are NOT the same number under two names",
       Math.abs(es[0].slope + 2) > 1e-4, "gap " + Math.abs(es[0].slope + 2).toExponential(2) + " at dt = 1/60");
    ok("and the gap SHRINKS toward -2 as dt refines, at forward Euler's own order",
       es.every((e, i) => i === 0 || Math.abs(e.slope + 2) < Math.abs(es[i - 1].slope + 2)),
       es.map((e) => Math.abs(e.slope + 2).toExponential(2)).join(" -> "));
    ok("...quartering, which is what makes it discretisation rather than a wrong law",
       Math.abs(Math.abs(es[0].slope + 2) / Math.abs(es[1].slope + 2) - 4) < 0.3,
       "ratio " + (Math.abs(es[0].slope + 2) / Math.abs(es[1].slope + 2)).toFixed(3));
}

// ---------------------------------------------------------------------------------------------------------------
section("4. THE BOUNDARY IS THE SERIES' RADIUS, NOT A CHOSEN TOLERANCE");
{
    const crit = Math.sqrt(SERIES_RADIUS / (sedCoeff(PARTICLE.a, PARTICLE.rho, FLUID.rhoF, FLUID.eta) * DT));
    ok("x = 1 is a real omega on this fixture", crit > 100 && crit < 2000, "omega_crit = " + crit.toFixed(1));
    ok("just below it the device is graded", adjudicate(Math.floor(crit * 0.9)).pass);
    const over = adjudicate(Math.ceil(crit * 1.1));
    ok("*** just above it the device REFUSES, and names the series rather than a threshold ***",
       !over.pass && /RADIUS/.test(over.evidence.reason) && over.evidence.x >= SERIES_RADIUS);
    ok("the refusal is not a crash or a null", typeof over.evidence.x === "number");
    // AND THE REFUSAL IS EARNED: past the radius the answer really is wrong about the physics, by a lot.
    const w = Math.ceil(crit * 1.5), k = rateFor(w), T = doublingTime(w);
    ok("...and past it the reported doubling time is wrong by tens of percent",
       (T - Math.LN2 / k) / (Math.LN2 / k) > 0.3,
       ((T - Math.LN2 / k) / (Math.LN2 / k) * 100).toFixed(0) + "% long at omega " + w);
}

// ---------------------------------------------------------------------------------------------------------------
section("5. THE SCORE, THE LOOP, AND THE SCENE");
{
    ok("propose offers values its own adjudicator REJECTS", propose({}).some((w) => !adjudicate(w).pass));
    ok("score prefers a FAST spin (cheaper to measure)", score(100) > score(20));
    const cheap = doublingTime(100), dear = doublingTime(20);
    ok("...and the cost claim is measured", dear / cheap > 10,
       dear.toFixed(3) + "s at omega 20 against " + cheap.toFixed(3) + "s at 100, " +
       (dear / cheap).toFixed(1) + "x");
    resetRegistry(); registerAll();
    const p = getProposer("cfg-spin");
    const real = p.adjudicate; let fired = 0;
    p.adjudicate = (...a) => { fired++; return real(...a); };
    p.score(100, {});
    p.adjudicate = real;
    ok("*** score does NOT consult its own adjudicator ***", fired === 0, "spy fired " + fired);
    ok("cfg-spin is registered against the centrifuge instrument",
       listProposers().some((x) => x.id === "cfg-spin" && x.instrument === "centrifuge"));
    const r = runProposer("cfg-spin");
    ok("the greedy pick is past the boundary and refused", r.verdict.pass === false, "greedy omega=" + r.best);
    ok("...and the loop names a survivor", r.accepted !== null,
       "accepted omega=" + r.accepted + " at rank " + r.acceptedRank + " of " + r.tried);
    ok("the accepted spin is inside the series radius", rateFor(r.accepted) * DT < SERIES_RADIUS);
}

console.log("\n" + (fail ? "FAILED " + fail + " of " + (pass + fail) : "ALL " + pass + " CHECKS PASS"));
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fail ? 1 : 0);
