// tools/roundhouse/libmControls.mjs
//
// v3083 -- AN UNMOVED ANSWER IS AMBIGUOUS, AND CRITERION 4 HAS BEEN TREATING IT AS A PASS.
//
// v2906 settled this for criterion 2 and the argument is identical here. A nuisance sweep that comes back
// bit-identical is consistent with a perfect invariance AND with a knob that was never wired, so the sweep
// reports SUSPECT and refuses to call it success. Criterion 4 asks the mirror question -- does a one-ulp shift
// of the 22 unspecified libm functions move the answer -- and when nothing moves it says PASS.
//
// THREE DIFFERENT SITUATIONS PRODUCE THAT SAME OUTPUT:
//   (a) the code path genuinely calls none of the perturbed functions. A real and strong result.
//   (b) the observable is QUANTISED and would not have moved for any reason whatsoever. optics rayleighFactor
//       was exactly this before v2932 refined the estimator, and corroborateFully-selfcheck still carries the
//       case as its cautionary tale.
//   (c) THE PERTURBATION NEVER REACHED THE DEVICE -- it did not arm, or the module captured Math.sin into a
//       local binding at import time, or the mode under test does not run the code anyone assumed it ran. This
//       is the worst of the three because nothing downstream looks wrong.
//
// Criterion 2 refuses (b)-shaped evidence by name. Criterion 4 accepts it. That asymmetry was recorded at v3082
// and this closes it: a bit-identical c4 result must now be accompanied by a CONTROL -- a different mode on the
// SAME DEVICE, run in the SAME PROCESS, that demonstrably DOES move. The control cannot distinguish (a) from
// (b); c2 already does that, because a quantised observable is bit-identical under its nuisance knob too. What
// the control rules out is (c), which nothing anywhere was checking.
//
// WHY A DECLARED REGISTER RATHER THAN AUTO-DISCOVERY. The obvious implementation is "did any field in this
// build move", which is what runNuisance does for liveness. It cannot work here: for a genuinely libm-free mode
// NOTHING in that build moves, which is the whole point, so auto-discovery would report every honest (a) as a
// dead instrument. The control has to come from elsewhere on the device, and which mode reaches a perturbed
// function is a fact about the physics that a person has to look up and write down. Same ceremony as the knob
// registers: an entry cannot be added without the sentence saying which function it reaches and why.
//
// THE DEFAULT IS UNVERIFIED, NOT PASS. A device with no control declared and a bit-identical result gets
// c4 = UNVERIFIED and does not corroborate. That is deliberately inconvenient -- it is the only setting under
// which the register ever gets filled in.

import { getDevice } from "./devices.mjs";
import { withPerturbedLibm, diffObservables } from "./libmSensitivity.mjs";

/**
 * THE REGISTER. device -> a mode/field on that device that MUST move under the one-ulp shift.
 *
 * Each entry names the perturbed function it reaches. "It moves" is not a reason; "it moves BECAUSE it calls
 * Math.sinh" is, and it is what lets the next person check the entry instead of trusting it.
 */
export const LIBM_CONTROLS = {
    lens: {
        mode: "shadow",
        field: "shadowAngleRad",
        reaches: "Math.asin and Math.acos",
        why: "shadowAngle computes asin(sqrt(s2)) for a static observer outside 3M, and acos on the branch " +
             "inside it. Both are in the perturbation set. The quantity under test, deflectionMeasured, runs " +
             "through tracePhoton -- arithmetic, an RK4 step, and Math.sqrt, which is IEEE-exact and correctly " +
             "excluded -- so it cannot serve as its own control and nothing else in the deflect build can either.",
    },
    quantum: {
        mode: "tunnel",
        field: "transmission",
        reaches: "Math.sinh and Math.sin",
        why: "The rectangular-barrier transmission coefficient uses sinh(kappa*a) below the barrier and " +
             "sin(k2*a) above it, both in schrodinger1d.js and both perturbed. The corroborated quantities " +
             "ratio21 and ratio31 come from the WELL mode, whose eigenvalue solve is arithmetic and sqrt only " +
             "-- measured, no field in that entire build moves -- so their bit-identical c4 result had nothing " +
             "standing behind it until this entry existed.",
    },
};

/**
 * Run one control and report whether the perturbation demonstrably reached the device.
 *
 * Reports ABSENT distinctly from NOT MOVED. A control naming a field the build does not produce is a broken
 * register entry, not a dead instrument, and telling a caller "the perturbation is not reaching this device"
 * when the truth is "you spelled the field wrong" would send them hunting the wrong thing entirely.
 */
export async function probeLibmControl(device, control = LIBM_CONTROLS[device]) {
    if (!control) return { device, declared: false, present: false, moved: false, relMove: null };
    const dev = await getDevice(device);
    const base = await dev.build({ mode: control.mode });
    const pert = await withPerturbedLibm(() => dev.build({ mode: control.mode }));
    const d = diffObservables(base, pert).find((x) => x.field === control.field);
    return {
        device, declared: true, mode: control.mode, field: control.field, reaches: control.reaches,
        present: !!d, moved: !!(d && d.moved), relMove: d && d.moved ? d.relMove : null,
        base: base?.[control.field], pert: pert?.[control.field],
    };
}

/** One line per control, for a report that has to be read rather than parsed. */
export function controlLine(p) {
    if (!p.declared) return `  ${p.device}: NO CONTROL DECLARED -- a bit-identical c4 here cannot be accepted`;
    if (!p.present) return `  ${p.device}.${p.mode}/${p.field}: ABSENT from the build -- broken register entry, not a dead instrument`;
    if (!p.moved) return `  ${p.device}.${p.mode}/${p.field}: DID NOT MOVE -- the perturbation is not reaching this device (reaches ${p.reaches})`;
    return `  ${p.device}.${p.mode}/${p.field}: moved ${p.relMove.toExponential(3)} via ${p.reaches} -- perturbation live`;
}
