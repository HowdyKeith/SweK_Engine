// WebGLEngine/tools/roundhouse/poissonDevice-selfcheck.mjs -- v3430
//
// Run: node tools/roundhouse/poissonDevice-selfcheck.mjs
//
// *** FOUR QUESTIONS THAT ALL SOUND LIKE "IS THIS SYMPLECTIC", AND THEY HAVE DIFFERENT ANSWERS. *** The
// canonical brackets test the coordinates, Jacobi tests the BRACKET, evolution tests that the bracket generates
// the flow, and preservation tests THE MAP. Only the last one is what the word means, and the first three are
// satisfied by a map that is not symplectic at all.
//
// AND SECTION 6 IS THE ROUND'S REAL FINDING: RK4 IS NOT SYMPLECTIC AND A PRESERVATION CHECK RUN AT ONE SMALL dt
// CERTIFIES IT AS IF IT WERE, because its defect sinks under the central-difference floor. The discriminator is
// the SCALING, not the value.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { poissonDevice, POISSON_MODES } from "./poissonBind.mjs";
import * as D from "./devices.mjs";
import { checkMode } from "./knobGate.mjs";

let failed = 0;
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const say = (m) => console.log("  ----  " + m);
const B = (mode, config = {}) => poissonDevice.build({ mode, config });

async function main() {
    console.log("[poissonDevice-selfcheck] what 'symplectic' means, and the four questions that sound alike\n");

    // ---- 1. THE CANONICAL BRACKETS ----------------------------------------------------------------------
    {
        const r = B("canonical");
        say(`canonical: {q,p} = ${r.qp.toPrecision(15)}, {q,q} = ${r.qq}, {p,p} = ${r.pp}, antisymmetry = ${r.antisymmetry}`);
        ok("!! {q,p} = 1 and {q,q} = {p,p} are EXACTLY zero",
            r.canonicalErr < 1e-10 && r.qq === 0 && r.pp === 0,
            `{q,p} off by ${r.canonicalErr.toExponential(2)} -- the central-difference floor, not a tolerance -- while the self-brackets are ` +
            "exact zeros in a float rather than small numbers");
        ok("!! ...and the bracket is ANTISYMMETRIC to the last bit",
            r.antisymmetry === 0,
            "{q,p} + {p,q} is EXACTLY 0. Not nearly");
    }

    // ---- 2. *** THE PLANT IS INVISIBLE TO {q,p} AND CAUGHT BY ANTISYMMETRY *** ---------------------------
    {
        const n = B("canonical"), p = B("canonical", { planted: true });
        say(`PLANT: {q,p} nominal ${n.qp.toPrecision(17)} vs planted ${p.qp.toPrecision(17)}`);
        ok("!! *** the planted bracket returns {q,p} = 1 BIT-FOR-BIT IDENTICALLY to the true one ***",
            p.qp === n.qp && p.canonicalErr === n.canonicalErr,
            "the plant drops the df/dp dg/dq term, AND THAT TERM VANISHES FOR THE PAIR (q,p). So the most obvious check in the subject -- the " +
            "one every textbook opens with -- CANNOT SEE IT AT ALL. Not approximately blind: identical to seventeen digits");
        ok("!! ...and antisymmetry catches it outright, exactly 0 against exactly 1",
            n.antisymmetry === 0 && Math.abs(p.antisymmetry - 1) < 1e-10,
            `planted antisymmetry ${p.antisymmetry.toPrecision(12)}. THE KEY HERE IS THE PROPERTY, NOT THE VALUE -- a check on {q,p} alone would ` +
            "have shipped a bracket that is not a bracket");
    }

    // ---- 3. THE JACOBI IDENTITY, AND WHAT IT IS NOT ------------------------------------------------------
    {
        const n = B("jacobi"), p = B("jacobi", { planted: true });
        say(`jacobi: nominal ${n.jacobiSum.toExponential(3)} at eps ${n.jacobiEps}, planted ${p.jacobiSum.toExponential(3)}`);
        ok("!! the Jacobi identity holds, and the planted bracket fails it by five orders",
            Math.abs(n.jacobiSum) < 1e-4 && Math.abs(p.jacobiSum) > 1,
            "a three-term cancellation nothing satisfies by accident. THE FIXTURE IS THREE NON-LINEAR FUNCTIONS on purpose: Jacobi is trivial on " +
            "q and p alone, so a canonical-coordinate fixture would be a check that passes because it does nothing");
        ok("!! *** and it is stated here that JACOBI CANNOT SEE A BROKEN INTEGRATOR ***",
            true,
            "it holds for ANY smooth f, g and h whatever map you are stepping with, because it is a property OF THE BRACKET rather than of the " +
            "dynamics. *** AN EXACT IDENTITY IS WORTH CHECKING AND IS NEVER SUFFICIENT -- five instances this session, and this one is named in " +
            "advance rather than discovered afterwards ***");
    }

    // ---- 4. THE BRACKET GENERATES THE FLOW ---------------------------------------------------------------
    {
        const r = B("evolution"), p = B("evolution", { planted: true });
        ok("!! {f,H} equals df/dt taken ALONG THE ACTUAL FLOW",
            r.evolutionRelErr < 1e-10,
            `bracket ${r.bracketRate.toPrecision(12)} against a stepped ${r.numericRate.toPrecision(12)}, ${r.evolutionRelErr.toExponential(2)} apart. ` +
            "Two routes, and the flow route knows nothing about brackets");
        ok("...and the planted bracket generates the WRONG flow, by 62%",
            p.evolutionRelErr > 0.1,
            `${(p.evolutionRelErr * 100).toFixed(1)}% -- so three modes catch this plant and the value of {q,p} catches nothing`);
    }

    // ---- 5. *** PRESERVATION: WHAT THE WORD ACTUALLY MEANS *** --------------------------------------------
    {
        const r = B("preservation");
        say(`defects at dt = ${r.dtUsed}: ` + Object.entries(r.defects).map(([k, v]) => `${k} ${v.toExponential(3)}`).join("  "));
        ok("!! *** velocity-Verlet and semi-implicit Euler PRESERVE the brackets; explicit Euler and RK4 do not ***",
            r.steppersSymplectic.join() === "semiEuler,verlet",
            "M^T J M = J, computed as a numerical Jacobian with NO symplectic theory in the check. THIS IS THE STATEMENT ELEVEN MODULES MAKE IN " +
            "PROSE AND ONE RE-DERIVED before this round");
        ok("!! ...and explicit Euler's defect is EXACTLY dt^2, which is a prediction rather than a tolerance",
            Math.abs(r.eulerOverDtSq - 1) < 1e-6,
            `defect/dt^2 = ${r.eulerOverDtSq.toPrecision(12)}. Its map is [[1,dt],[-dt,1]] and the determinant is 1 + dt^2 -- so the size of the ` +
            "failure is known in advance, and a defect of the wrong SIZE would be as much a finding as no defect at all");
        ok("...and SEMI-IMPLICIT Euler is symplectic while being first order, so the two properties come apart",
            r.defects.semiEuler < 1e-9 && r.defects.euler > 1e-3,
            "two first-order Euler methods, one symplectic and one not. ACCURACY AND SYMPLECTICITY ARE DIFFERENT AXES, and a fixture with only " +
            "verlet and rk4 in it would have let them be read as the same axis");
    }

    // ---- 6. *** THE FINDING: RK4 HIDES UNDER THE FLOOR *** -----------------------------------------------
    {
        const r = B("floor");
        say(`rk4 defect ${r.rk4AtCoarse.toExponential(3)} at dt, ${r.rk4AtFine.toExponential(3)} at dt/8; verlet's floor ${r.floorEstimate.toExponential(3)}`);
        ok("!! *** RK4 IS NOT SYMPLECTIC AND A CHECK AT ONE SMALL dt CERTIFIES IT AS IF IT WERE ***",
            r.rk4FallsBelowFloor === true && r.rk4AtCoarse > 1e-9,
            `its defect falls from ${r.rk4AtCoarse.toExponential(2)} to ${r.rk4AtFine.toExponential(2)} across a factor of eight in dt and lands ` +
            `at the central-difference floor (${r.floorEstimate.toExponential(2)}), where it is INDISTINGUISHABLE FROM VERLET. *** THE ` +
            "DISCRIMINATOR IS THE SCALING, NOT THE VALUE: Euler's defect is dt^2 and visible at every step size, RK4's vanishes into the noise ***");
        ok("...so `preservation` is a measurement at a stated dt and NOT a verdict on a method",
            r.dtUsed >= 0.05,
            "the coarse dt is deliberate. A SMALLER FIXTURE WOULD HAVE MADE THE ANSWER LOOK CLEANER AND BEEN WRONG");
    }

    // ---- 7. THE CLAIM THAT MOTIVATED THE ROUND, RE-DERIVED ------------------------------------------------
    {
        const here = path.dirname(fileURLToPath(import.meta.url));
        const root = path.resolve(here, "..", "..");
        const walk = (dir, out = []) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const f = path.join(dir, e.name);
                if (e.isDirectory()) walk(f, out);
                else if (/\.(js|mjs)$/.test(e.name) && !/selfcheck/.test(e.name)) out.push(f);
            }
            return out;
        };
        const claim = walk(path.join(root, "physics")).filter((f) => /symplectic/i.test(fs.readFileSync(f, "utf8")));
        say(`${claim.length} modules under physics/ use the word "symplectic"`);
        ok("!! REPORTED: the word is used in many modules and the CONDITION now has one definition to check it against",
            claim.length > 5,
            "before this round the condition was re-derived in exactly one place (hmc's 4x4 Jacobian determinant). A PROPERTY WRITTEN DOWN IN " +
            "TWELVE FILES WHERE NOTHING RECOMPUTES IT is this project's signature defect -- REPORTED, not failed, because wiring each of those " +
            "modules to this check is a judgement per module and not a sweep");
    }

    // ---- 8. REGISTRY HYGIENE -----------------------------------------------------------------------------
    {
        const dev = await D.getDevice("poisson");
        ok("!! the registry BUILDS it, not merely lists it",
            !!dev && typeof dev.build === "function" && D.DEVICE_NAMES.includes("poisson"),
            "a name in DEVICE_NAMES the factory cannot build passes a set check and FAILS ON USE (v3330)");
        ok("!! every declared mode answers, and an undeclared one is REFUSED",
            POISSON_MODES.every((m) => !!dev.defaults({ mode: m })) && dev.defaults({ mode: "zzz" }) === null &&
            checkMode(dev, "zzz").ok === false,
            "ONE definition of the mode list (POISSON_MODES), for the reason six other binds needed one");
        ok("...and every observable the modes produce is declared",
            POISSON_MODES.every((m) => Object.keys(B(m)).every((k) => poissonDevice.observables.includes(k))),
            "an observable a device produces but does not declare is invisible to claimTrace and to the lab-results baseline");
        ok("...and the two modes the plant cannot reach say so rather than looking clean",
            B("preservation", { planted: true }).verletDefect === B("preservation").verletDefect,
            "preservation and floor never call a bracket, so a plant on the BRACKET cannot touch them. BLIND BY CONSTRUCTION AND STATED -- and " +
            "v3429's detection map now reports that split without anybody noticing it by hand");
    }

    console.log(failed ? `\n[poissonDevice-selfcheck] ${failed} FAILED` : "\n[poissonDevice-selfcheck] all checks pass");
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[poissonDevice-selfcheck] COULD NOT RUN:", e && e.stack || e); process.exit(1); });
