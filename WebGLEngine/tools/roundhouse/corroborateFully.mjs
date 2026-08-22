// tools/roundhouse/corroborateFully.mjs
//
// v2908 -- PUTTING SOMETHING THROUGH ALL FOUR, WHICH HAS NEVER BEEN DONE.
//
// The four criteria were built in v2891, hardened in v2902, and then measured one at a time: v2904 counted who
// could be asked, v2905 answered criterion 4 per observable, v2906 answered criterion 2 for four devices, v2907
// answered criterion 3 for five. At no point has a single quantity been put through all four and given one
// standing. The lab still has exactly one corroborated number -- the Lyapunov exponent from v2891, chosen partly
// because it was expected to pass.
//
// WHO IS ELIGIBLE, AND THE FIRST FINDING IS THAT ALMOST NOBODY IS. A quantity can only face the full battery if
// its device declares BOTH a refinement knob and a nuisance knob. After v2906 and v2907 those sets are
// {ising, kepler, chaos, blackhole} and {splat, optics, quantum, kepler, chaos}. The intersection is TWO
// DEVICES. That is the honest state of the lab after four rounds of building the apparatus, and it is why this
// round adds two more nuisance knobs rather than only running what already exists.
//
// THE TWO NEW KNOBS ARE BOTH DIMENSIONAL-ANALYSIS INVARIANCES, which is the richest source of live nuisance
// parameters in a physics lab and had not been mined:
//
//   quantum.well: E_n = n^2 pi^2 hbar^2 / (2 m L^2), so the RATIOS E2/E1 and E3/E1 are exactly 4 and 9 for every
//   box length. Changing L moves every number in the discretised Hamiltonian and moves neither ratio. Live and
//   unarguable.
//
//   optics.airy: the first Airy zero sits at 1.2197 lambda/D. Expressed as rayleighFactor -- the ring position in
//   units of lambda/D -- it is invariant under wavelength. Changing lambda rescales the entire diffraction
//   integral and must leave the factor alone.
//
// THE VERDICT IS DELIBERATELY HARD TO EARN. CORROBORATED requires all four: a frozen prediction, invariance under
// a knob the physics forbids from mattering, convergence under refinement, and stability under a one-ulp libm
// shift. Anything else is reported as the specific criterion that failed. There is no partial credit, because
// the whole point of the battery is that the criteria catch different things -- v2907 ended with deltaSpread
// perfectly converged and wildly libm-unstable, which is exactly the case a single criterion would have passed.

import { getDevice } from "./devices.mjs";
import { classifySequence } from "./refinementKnobs.mjs";
import { withPerturbedLibm, diffObservables } from "./libmSensitivity.mjs";
import { probeLibmControl } from "./libmControls.mjs";
import { LAB_ASSUMPTIONS, withAssumptions } from "./assumptions.mjs";
import { preRegister } from "./corroborate.mjs";

/** Nuisance knobs added by this round, in the shape v2906 established. */
export const NEW_NUISANCE = {
    quantum: {
        mode: "well",
        param: "L",
        why: "The infinite square well has E_n proportional to n^2 / L^2, so every ENERGY depends on the box " +
             "length and every ENERGY RATIO is exactly n^2/m^2 independent of it. Changing L rescales the grid " +
             "spacing, the kinetic operator and all three eigenvalues; the ratios cannot notice. This is a " +
             "dimensional-analysis invariance, which is the strongest kind available -- it follows from the " +
             "form of the equation rather than from a symmetry of the particular solution.",
        values: [0.5, 1, 2.5],
        invariants: ["ratio21", "ratio31"],
        tol: 1e-6,
    },
    optics: {
        mode: "airy",
        param: "lambda",
        why: "The Airy pattern's first zero lies at 1.2197 lambda/D. rayleighFactor reports the measured ring " +
             "position in units of lambda/D, so it is a pure number fixed by the geometry of the aperture and " +
             "not by the colour of the light. Changing lambda rescales the whole diffraction integral.",
        values: [400e-6, 500e-6, 700e-6],
        invariants: ["rayleighFactor"],
        tol: 2e-3,
    },
};

const isNum = (x) => typeof x === "number" && Number.isFinite(x);

/**
 * v3082 -- THE BATTERY WAS MEASURING AT AN OPERATING POINT NOBODY DECLARED.
 *
 * Both sweeps below used `config: { [knob.param]: v }` -- ONE named key, and every other parameter silently
 * falling back to the device DEFAULTS. Two things follow, and both bit this round.
 *
 * (1) A KNOB THAT IS NOT A SINGLE CONFIG FIELD CANNOT BE EXPRESSED. NUISANCE_KNOBS entries carry an
 *     `apply(cfg, v)` because some knobs move SEVERAL parameters together: kepler.scale sends a -> lambda*a with
 *     mu -> lambda^3*mu, and lens.scale sends M and b together. runNuisance has always called apply; this file
 *     ignored it and passed `{ scale: 1 }`, which lensDefaults and keplerDefaults correctly do not recognise.
 *     Every run then came back IDENTICAL and criterion 2 reported "bit-identical, so the knob may not be live"
 *     -- a true sentence about a sweep that never happened. TWO DEFINITIONS OF "APPLY A NUISANCE KNOB", the
 *     shape this tree keeps meeting.
 *
 * (2) THE TWO CRITERIA WERE RUN AT DIFFERENT PHYSICS. A refinement sweep at the device default and a nuisance
 *     sweep at the knob's own values are not two criteria about one quantity, they are two criteria about two
 *     quantities that share a name. lens made this visible: dphi refinement is CONVERGING at b = 60 and
 *     DRIFTING at b = 10, so the standing depended on a parameter neither register mentioned.
 *
 * A knob may now declare `base`, the operating point it is asserted at. Absent both fields the behaviour is
 * exactly what it was, so every knob written before this is unaffected.
 */
function knobConfig(knob, v) {
    const base = knob.base ? { ...knob.base } : {};
    return knob.apply ? knob.apply(base, v) : { ...base, [knob.param]: v };
}
const pointOf = (knob) => (knob.base ? " at " + Object.entries(knob.base).map(([k, x]) => k + "=" + x).join(" ") : " at device defaults");

/**
 * Run all four criteria against one field of one device/mode.
 *
 * Each criterion is reported with the evidence, not just a boolean, because a verdict whose reasoning is not
 * inspectable is the thing this lab keeps discovering it cannot trust.
 */
export async function corroborateFully({ device, mode, field, refinement, nuisance, registration, tol = 1e-6 }) {
    const dev = await getDevice(device);
    const out = { device, mode, field, criteria: {} };

    // ---- criterion 1: was a claim frozen before the measurement? -------------------------------------------------
    // This one cannot be measured, only possessed. It is checked structurally: a registration must exist, name
    // this quantity, and have been sealed. Retrofitting is exactly what preRegister's seal is for.
    out.criteria.c1_preregistered = {
        pass: !!(registration && registration.quantity && registration.sealed !== false),
        evidence: registration ? registration.quantity : "no registration supplied",
    };

    // ---- criterion 2: invariance under a knob the physics forbids from mattering ---------------------------------
    {
        const vals = [];
        for (const v of nuisance.values) {
            const o = await dev.build({ mode, config: knobConfig(nuisance, v) });
            vals.push(o?.[field]);
        }
        if (!vals.every(isNum)) {
            out.criteria.c2_nuisance = { pass: false, evidence: "field absent or non-finite under the nuisance sweep" };
        } else {
            const bitIdentical = vals.every((x) => Object.is(x, vals[0]));
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vals.length - 1));
            const spread = Math.abs(mean) > 0 ? sd / Math.abs(mean) : Infinity;
            // Bit-identical is NOT a pass. v2906's whole lesson: an unwired knob is indistinguishable from a
            // perfect invariance, and scoring it as success is how the criterion became vacuous the first time.
            out.criteria.c2_nuisance = {
                pass: !bitIdentical && spread <= (nuisance.tol ?? tol),
                evidence: `${nuisance.param} over ${nuisance.values.join(", ")}${pointOf(nuisance)}: spread ${spread.toExponential(2)}` +
                    (bitIdentical ? " but BIT-IDENTICAL, so the knob may not be live for this field" : ""),
                spread, bitIdentical, vals,
            };
        }
    }

    // ---- criterion 3: convergence under refinement ----------------------------------------------------------------
    {
        const vals = [];
        for (const v of refinement.values) {
            const o = await dev.build({ mode, config: knobConfig(refinement, v) });
            vals.push(o?.[field]);
        }
        const cls = vals.every(isNum) ? classifySequence(vals, refinement.values) : { verdict: "NON-FINITE" };
        out.criteria.c3_convergence = {
            pass: cls.verdict === "CONVERGING",
            evidence: `${refinement.param} over ${refinement.values.join(", ")}${pointOf(refinement)}: ${cls.verdict}` +
                (cls.contraction !== undefined ? `, contraction ${cls.contraction.toExponential(2)}` : ""),
            verdict: cls.verdict, vals,
        };
    }

    // ---- criterion 4: stability under a one-ulp libm shift ---------------------------------------------------------
    {
        const base = await dev.build({ mode });
        const pert = await withPerturbedLibm(() => dev.build({ mode }));
        const d = diffObservables(base, pert).find((x) => x.field === field);
        if (!d) {
            out.criteria.c4_portability = { pass: false, evidence: "field not present in the perturbation diff" };
        } else if (d.moved) {
            // It MOVED, so the perturbation demonstrably reached this quantity. No control is needed -- movement
            // is its own liveness proof, and the only question left is magnitude.
            out.criteria.c4_portability = {
                pass: d.relMove <= tol,
                evidence: `moves ${d.relMove.toExponential(2)} relative under a one-ulp libm shift (tol ${tol.toExponential(0)})`,
                moved: true, relMove: d.relMove, controlNeeded: false,
            };
        } else {
            // v3083 -- BIT-IDENTICAL IS THREE DIFFERENT SITUATIONS AND THIS USED TO PASS ALL THREE. A libm-free
            // code path, a quantised observable, and a perturbation that never reached the device all produce
            // exactly no movement. c2 has refused this shape by name since v2906; c4 accepted it. A control on
            // the SAME DEVICE, in the SAME PROCESS, must move -- see libmControls.mjs for why it cannot be
            // auto-discovered. Absent a control the verdict is UNVERIFIED, which does not corroborate.
            const ctl = await probeLibmControl(device);
            out.criteria.c4_portability = {
                pass: ctl.declared && ctl.present && ctl.moved,
                evidence: !ctl.declared
                    ? "bit-identical, but NO CONTROL DECLARED for this device -- unverified, because a libm-free path, " +
                      "a quantised observable and a perturbation that never armed all look exactly like this"
                    : !ctl.present
                    ? `bit-identical, and the declared control ${ctl.mode}/${ctl.field} is ABSENT from its build -- ` +
                      "a broken register entry, not a verdict"
                    : !ctl.moved
                    ? `bit-identical, and the control ${ctl.mode}/${ctl.field} DID NOT MOVE either though it reaches ` +
                      `${ctl.reaches} -- the perturbation is not reaching this device, so this measures nothing`
                    : `bit-identical under a one-ulp libm shift, with the perturbation proven live: control ` +
                      `${ctl.mode}/${ctl.field} moved ${ctl.relMove.toExponential(2)} via ${ctl.reaches}`,
                moved: false, relMove: 0, controlNeeded: true, control: ctl,
            };
        }
    }

    const failed = Object.entries(out.criteria).filter(([, c]) => !c.pass).map(([k]) => k);
    out.failedCriteria = failed;

    // v3101 -- THE FOUR CRITERIA SAY THE NUMBER IS WELL BEHAVED. THEY DO NOT SAY IT IS MEANINGFUL.
    //
    // A quantity can pass all four at an operating point where its answer key does not apply. lens.deflect is
    // the standing example: at the DEVICE DEFAULT b = 10 the ray sits in the MID band where deflectionErrFrac
    // is null by design, and the sweeps still converge and still stay invariant, because convergence and
    // invariance are properties of the ARITHMETIC. The physics that makes the number mean something is a
    // separate claim, and until now it lived in a comment.
    //
    // So a standing now carries the conditions it was taken under, evaluated against the knobs' declared
    // operating point. This is v3100's rule applied one layer up: A RESULT CARRYING AN UNMET ASSUMPTION IS NOT
    // A RESULT. It is not downgraded to NOT CORROBORATED, because that would say the criteria failed and they
    // did not -- it gets its own verdict, so "this number is wrong" and "this number was taken somewhere it
    // does not apply" stay the two different findings they are.
    const point = { ...(refinement && refinement.base), ...(nuisance && nuisance.base) };
    const declared = LAB_ASSUMPTIONS[device + "." + mode] || null;
    if (declared && Object.keys(point).length) {
        const a = withAssumptions(out.field, declared, point);
        out.assumptions = a.assumptions;
        out.operatingPoint = point;
        out.soundAtPoint = a.sound;
        out.assumptionNote = a.note;
    } else {
        // NO DECLARED ASSUMPTIONS IS NOT NO ASSUMPTIONS -- it is nobody having written them down, which is the
        // same distinction v3094 and v3098 spent two rounds separating for audits. Said out loud rather than
        // defaulting to true and looking like a pass.
        out.soundAtPoint = null;
        out.assumptionNote = declared
            ? "assumptions declared but the knobs state no operating point to evaluate them against"
            : "no assumptions declared for " + device + "." + mode + " -- which is not the same as none applying";
    }

    out.standing = failed.length ? "NOT CORROBORATED"
        : out.soundAtPoint === false ? "UNSOUND AT THIS OPERATING POINT"
        : "CORROBORATED";
    return out;
}

/**
 * PRE-REGISTERED before any of the four were run for these quantities.
 *
 * Prediction A: quantum.well's ratio21 passes all four. It converges cleanly (v2907 measured 3.999996 against an
 * exact 4), the L-invariance is forced by the form of the equation, and an eigenvalue ratio on a tridiagonal
 * operator should not be libm-sensitive.
 *
 * Prediction B: chaos.feigenbaum's deltaBest FAILS, and fails specifically on criterion 4. v2907 showed it
 * converges under cascade refinement; v2905 showed it moves 9.5e-4 relative under a one-ulp libm shift, which is
 * three orders above the 1e-6 tolerance. If that holds it becomes the lab's first quantity rejected by the full
 * battery while passing the criterion its own device would have checked.
 *
 * Prediction B is the load-bearing one. A battery that has only ever ratified things is not a battery.
 */
export const FULL_REGISTRATION = preRegister({
    quantity: "quantum.well ratio21 and chaos.feigenbaum deltaBest under the full four-criteria battery",
    claim: { ratio21: "CORROBORATED", deltaBest: "NOT CORROBORATED via c4_portability" },
    rationale: "ratio21 converges to an exact 4 (v2907), is invariant under L by dimensional analysis, and is a " +
        "ratio of eigenvalues of a tridiagonal operator. deltaBest converges (v2907) but moved 9.5e-4 under a " +
        "one-ulp libm shift (v2905), three orders above tolerance. Registering a predicted FAILURE alongside a " +
        "predicted pass so the battery is not being tested only on things expected to survive it.",
});

export function fullLines(rs) {
    const L = [];
    for (const r of rs) {
        L.push(`  ${r.device}.${r.mode}.${r.field}: ${r.standing}` +
            (r.failedCriteria.length ? `  (failed: ${r.failedCriteria.join(", ")})` : ""));
        for (const [k, c] of Object.entries(r.criteria)) L.push(`      ${c.pass ? "ok  " : "FAIL"} ${k}: ${c.evidence}`);
    }
    return L;
}
