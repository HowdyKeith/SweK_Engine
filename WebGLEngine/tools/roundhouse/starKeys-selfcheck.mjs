// WebGLEngine/tools/roundhouse/starKeys-selfcheck.mjs -- v3421
//
// Run: node tools/roundhouse/starKeys-selfcheck.mjs
//
// THREE MORE MODULES THAT HAD AN EXTERNAL KEY IN THEIR OWN GATE AND NO DEVICE BIND: physics/solarSystem.js,
// physics/pendulumWave.js and physics/neutronStar.js. Bound as MODES on kepler, kuramoto and blackhole -- each
// on a host that shares its substrate, never one that merely shares its subject.
//
// *** AND THE SECOND HALF IS A DEFECT ADDING A MODE KEEPS EXPOSING: THE MODE LIST DECLARED TWICE. *** v3420
// found it in quantumBind, where a declared mode silently returned another mode's answer. This round found it
// in keplerBind AND blackHoleBind -- and in kepler THE TWO COPIES ALREADY DISAGREED: the guard accepted
// "kepler3" while `modes:` never listed it, so kepler3 IS A WORKING MODE NOBODY CAN DISCOVER. It computes the
// Kepler-III slope and is invisible to the census, to checkMode, to lab export and to every tool that reads the
// registry. A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE -- v3192's sentence, still true four hundred
// versions later, in a bind nobody had re-read.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keplerDevice, KEPLER_MODES } from "./keplerBind.mjs";
import { kuramotoDevice, KURAMOTO_MODES } from "./kuramotoBind.mjs";
import { blackHoleDevice, BH_MODES } from "./blackHoleBind.mjs";
import { codeOnly } from "../ship/sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const say = (m) => console.log("  ----  " + m);

async function main() {
    console.log("[starKeys-selfcheck] three more modules bound, and the mode list that keeps being written twice\n");

    // ---- 1. SOLAR SYSTEM: AN EXACT POWER LAW OVER REAL ELEMENTS -----------------------------------------
    {
        const r = await keplerDevice.build({ mode: "solar" });
        say(`solar: ${r.bodies} orbiting bodies, P(4a)/P(a) = ${r.periodRatio4to1}, worst energy ${r.worstEnergyRelErr.toExponential(2)}, worst L ${r.worstAngMomRelErr.toExponential(2)}`);
        ok("!! *** Kepler III comes back as an INTEGER: P(4a)/P(a) is EXACTLY 8 ***",
            r.periodRatio4to1 === r.periodRatioExact,
            "a^3/2 gives 8 and nothing here was told the exponent. AN INTEGER IS A FAR HARDER TARGET THAN A FITTED SLOPE, and no per-planet fudge could produce it across eight bodies at once");
        ok("!! ...and each planet's energy and angular momentum match their closed forms BY TWO ROUTES",
            r.worstEnergyRelErr < 1e-14 && r.worstAngMomRelErr < 1e-14,
            "E and L are recomputed FROM THE STATE the element generated, then compared with -1/(2a) and sqrt(a(1-e^2)) -- the state route knows no formula, so agreement is a result rather than a restatement");
        ok("...and the count is EIGHT, because the element list includes the Sun and the Sun is not an orbit",
            r.bodies === 8,
            "*** a = 0 for the primary, so treating every row as an orbit divides by zero and every observable comes back NaN -- which JSON prints as null. MY FIRST RUN REPORTED TWO CLEAN-LOOKING NULLS RATHER THAN AN ERROR. A LIST THAT INCLUDES THE PRIMARY IS NOT A LIST OF ORBITS ***");
    }

    // ---- 2. PENDULUM WAVE: THE OTHER KIND OF SYNCHRONISATION --------------------------------------------
    {
        const r = kuramotoDevice.build({ mode: "pendulum" });
        say(`pendulum: ${r.pendulums} pendulums over ${r.cycleSteps} steps, spread ${r.spreadStart} -> ${r.spreadMid.toFixed(4)} mid -> ${r.spreadAtCycle.toExponential(2)} at the cycle`);
        ok("!! *** THIS MODE EXISTS TO BE THE OTHER THING: a pendulum wave returns to step with NO COUPLING AT ALL ***",
            r.couplingUsed === 0 && r.resyncRatio > 1e9,
            `the spread at the cycle is ${r.resyncRatio.toExponential(1)}x below its own mid-cycle value. Kuramoto synchronises BY COUPLING and only above a critical K; ` +
            "this closes because the periods are commensurate and the arithmetic returns. BOTH ARE 'SYNCHRONISATION' IN ENGLISH AND THEY SHARE NOT ONE MECHANISM");
        ok("...and it genuinely scrambles in between, so the return is not a fixture that never moved",
            r.spreadStart === 0 && r.spreadMid > 0.1,
            `spread runs 0 -> ${r.spreadMid.toFixed(4)} -> back. A row that started scattered and ended scattered would prove nothing`);
        ok("!! ...and the claim is a RATIO, not an exact zero, because the measurement said 1.05e-13",
            r.spreadAtCycle > 0,
            "*** I WROTE 'EXACT TO THE LAST BIT' AND WAS WRONG: a first probe printed 0.00000 and that was toFixed(5) rounding, not the answer. " +
            "The residue is round-off over 3600 steps, not drift. A CHECK ASSERTING EXACT ZERO WOULD HAVE BEEN A TOLERANCE PRETENDING TO BE A PROOF ***");
    }

    // ---- 3. NEUTRON STAR: TWO BOOLEANS THAT MUST DISAGREE -----------------------------------------------
    {
        const r = await blackHoleDevice.build({ mode: "neutronstar" });
        say(`neutronstar: M ${r.nsMass}, R ${r.nsRadiusKm} km, r_s ${r.rsKm.toFixed(4)}, compactness ${r.compactness.toFixed(5)}, ISCO ${r.iscoKm.toFixed(3)}, photon sphere ${r.photonSphereKm.toFixed(3)}`);
        ok("!! *** THE KEY IS A PAIR OF BOOLEANS THAT MUST DISAGREE, AND A WRONG COMPACTNESS FLIPS THEM TOGETHER ***",
            r.iscoOutside === true && r.photonSphereOutside === false,
            `for the canonical 1.4 Msun / 11 km star the ISCO (3 r_s = ${r.iscoKm.toFixed(2)} km) sits OUTSIDE the surface while the photon sphere ` +
            `(1.5 r_s = ${r.photonSphereKm.toFixed(2)} km) sits INSIDE it. Either alone is one number near a threshold; TOGETHER THEY BRACKET THE ` +
            "COMPACTNESS FROM BOTH SIDES, and no single scale error can satisfy both");
        ok("...and the surface escape speed is a real fraction of c, which is what makes it a compact object at all",
            r.escapeFrac > 0.5 && r.escapeFrac < 0.75,
            `v_esc/c = ${r.escapeFrac.toFixed(5)} -- published for a canonical neutron star, and a number this device does not derive from anything it integrates`);
    }

    // ---- 4. *** ONE DEFINITION OF THE MODE LIST, AND kepler3 WAS THE PROOF IT MATTERS *** -----------------
    {
        ok("!! *** kepler3 IS NOW DECLARED -- it was a WORKING MODE NOBODY COULD DISCOVER ***",
            KEPLER_MODES.includes("kepler3") && keplerDevice.modes.includes("kepler3"),
            "the guard accepted it and `modes:` never listed it, so it was invisible to the census, to checkMode, to lab export and to every " +
            "registry-driven tool. TWO COPIES, AND ONLY ONE WAS EVER UPDATED");
        ok("...and every list a device publishes IS the list its guard enforces",
            keplerDevice.modes === KEPLER_MODES && kuramotoDevice.modes === KURAMOTO_MODES && blackHoleDevice.modes === BH_MODES,
            "identity, not equality -- two arrays that happen to match today are still two declarations");

        // A SOURCE CHECK FOR THE IDIOM, not for the contents: a guard carrying its own array literal is a
        // second declaration by construction, whatever it currently holds. Reported for the rest of the tree
        // rather than failed, because fixing a bind means reading it and that is a round each.
        const binds = fs.readdirSync(HERE).filter((f) => f.endsWith("Bind.mjs"));
        const literalGuards = binds.filter((f) => /\[\s*"[^"]+"(\s*,\s*"[^"]+")*\s*\]\s*\.includes\(\s*h?\.?mode/.test(codeOnly(fs.readFileSync(path.join(HERE, f), "utf8"))));
        ok("!! the three binds touched this round no longer carry a literal mode list in their guard",
            !literalGuards.includes("keplerBind.mjs") && !literalGuards.includes("blackHoleBind.mjs") && !literalGuards.includes("kuramotoBind.mjs"),
            "a guard with its own array literal is A SECOND DECLARATION BY CONSTRUCTION, whatever it currently holds");
        say(literalGuards.length
            ? `REPORTED, not failed -- ${literalGuards.length} bind(s) still carry a literal guard: ${literalGuards.join(", ")}`
            : "REPORTED: no bind in this folder still carries a literal mode guard");
    }

    // ---- 5. THE POINT OF BINDING ------------------------------------------------------------------------
    {
        const declared = (dev, m) => dev.modes.includes(m) && !!dev.defaults({ mode: m });
        ok("!! all three are DECLARED MODES on registered devices, so every roundhouse tool reaches them",
            declared(keplerDevice, "solar") && declared(kuramotoDevice, "pendulum") && declared(blackHoleDevice, "neutronstar"),
            "graded coverage 69 -> 72. NO NEW DEVICE, so promptCost's count and the device census are untouched");
        ok("...and each new mode's observables are declared by its host",
            keplerDevice.observables.includes("periodRatio4to1") && kuramotoDevice.observables.includes("resyncRatio") &&
            blackHoleDevice.observables.includes("photonSphereOutside"),
            "an observable a device produces but does not declare is invisible to claimTrace and to the lab-results baseline");
    }

    console.log(failed ? `\n[starKeys-selfcheck] ${failed} FAILED` : "\n[starKeys-selfcheck] all checks pass");
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[starKeys-selfcheck] COULD NOT RUN:", e && e.stack || e); process.exit(1); });
