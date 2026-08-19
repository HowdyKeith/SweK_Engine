// tools/roundhouse/libmControl-selfcheck.mjs
//
// Run: node tools/roundhouse/libmControl-selfcheck.mjs   (~40s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3083 -- CRITERION 4 WAS HANDING OUT A PASS FOR NOT MOVING, AND TWO OF THE LAB'S THREE STANDINGS RESTED ON IT.
//
// v3082 recorded the asymmetry and did not close it: criterion 2 refuses a bit-identical result BY NAME, because
// an unwired knob and a perfect invariance produce the same output, while criterion 4 accepted exactly that shape
// as success. This closes it, and the measurement that makes the round is what turned up on the way.
//
// QUANTUM.WELL RATIO21 AND RATIO31 -- the lab's second and third corroborated quantities, and its flagship
// result -- pass criterion 4 by being bit-identical. NOTHING IN THAT ENTIRE BUILD MOVES under the perturbation:
// not one field. And quantumBind.mjs DOES call Math.exp, Math.cos and Math.sin, all three in the perturbation
// set, so "the module calls no perturbed function" was not available as an explanation either. Two readings fit
// and they are opposites: the well solve genuinely never reaches those calls (they are in a wavepacket initial
// condition belonging to another mode), or the perturbation was not reaching the device at all. NOTHING IN THE
// LAB COULD TELL THEM APART, and one of them means the criterion has been measuring nothing since v2908.
//
// It is the first. schrodinger1d.js reaches Math.sinh and Math.sin in the BARRIER transmission coefficient, and
// quantum.tunnel/transmission moves by 2.64e-16 in the same process -- so the perturbation arms, reaches the
// device, and the well eigenvalue solve really is arithmetic and sqrt. The standing survives. It was not earned
// until something checked, and what this round adds is the check rather than the answer.
//
// WHY THE CONTROL CANNOT BE AUTO-DISCOVERED, since that is the first thing anyone will try: "did any field in
// this build move" is what runNuisance uses for liveness, and here it is exactly backwards. For a genuinely
// libm-free mode nothing in the build moves BY CONSTRUCTION, so auto-discovery would condemn every honest pass
// as a dead instrument. The control must come from another mode on the same device, and which mode reaches a
// perturbed function is a fact about the physics that a person has to look up. Hence a declared register with a
// stated reason, and hence UNVERIFIED rather than PASS when nobody has written one.

import { LIBM_CONTROLS, probeLibmControl, controlLine } from "./libmControls.mjs";
import { corroborateFully, NEW_NUISANCE } from "./corroborateFully.mjs";
import { NUISANCE_KNOBS } from "./nuisanceKnobs.mjs";
import { REFINEMENT_KNOBS } from "./refinementKnobs.mjs";
import { LENS_DEFLECT_REGISTRATION } from "./lensRegistration.mjs";
import { preRegister } from "./corroborate.mjs";
import { getDevice } from "./devices.mjs";
import { withPerturbedLibm, diffObservables } from "./libmSensitivity.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const reg = preRegister({ quantity: "gate probe", claim: { observable: "standing" } });

// ---- 1. THE REGISTER DEMANDS A NAMED FUNCTION, NOT JUST A MOVING NUMBER --------------------------------------------
{
    const es = Object.entries(LIBM_CONTROLS);
    ok("every control names the perturbed function it reaches",
        es.every(([, c]) => typeof c.reaches === "string" && c.reaches.length > 3 && typeof c.why === "string" && c.why.length > 80),
        es.length + " declared: " + es.map(([d, c]) => d + " -> " + c.mode + "/" + c.field + " (" + c.reaches + ")").join("; ") +
        ". 'It moves' is not a reason -- 'it moves BECAUSE it calls Math.sinh' is, and it is what lets the next " +
        "person check the entry instead of trusting it");

    for (const d of Object.keys(LIBM_CONTROLS)) {
        const p = await probeLibmControl(d);
        ok("the " + d + " control actually moves", p.present && p.moved, controlLine(p).trim());
    }
}

// ---- 2. THE MEASUREMENT THAT MADE THIS ROUND NECESSARY --------------------------------------------------------------
{
    const q = await getDevice("quantum");
    const base = await q.build({ mode: "well" });
    const pert = await withPerturbedLibm(() => q.build({ mode: "well" }));
    const movers = diffObservables(base, pert).filter((x) => x.moved);
    ok("!! NOTHING in the quantum.well build moves under the perturbation",
        movers.length === 0,
        Object.keys(base).length + " observables, " + movers.length + " moved. The lab's flagship corroborated " +
        "quantities live here and their criterion-4 pass was resting on this with nothing standing behind it");

    const p = await probeLibmControl("quantum");
    ok("!! ...and the control on the same device DOES move, in the same process",
        p.moved,
        "quantum.tunnel/transmission " + p.base.toPrecision(17) + " -> " + p.pert.toPrecision(17) + ", relMove " +
        p.relMove.toExponential(3) + " via " + p.reaches + ". So the perturbation arms and reaches this device, " +
        "and the well solve really is arithmetic and sqrt -- the standing survives, and is now earned rather " +
        "than assumed");
}

// ---- 3. THE THREE OUTCOMES, EACH FORCED --------------------------------------------------------------------------
{
    const cfg = { device: "quantum", mode: "well", field: "ratio21",
        refinement: REFINEMENT_KNOBS.quantum, nuisance: NEW_NUISANCE.quantum, registration: reg };
    const good = await corroborateFully(cfg);
    ok("a bit-identical result WITH a live control passes",
        good.criteria.c4_portability.pass && good.criteria.c4_portability.moved === false,
        good.criteria.c4_portability.evidence);

    // SABOTAGE A: take the control away. Nothing about the physics changed; the EVIDENCE did.
    const saved = LIBM_CONTROLS.quantum;
    delete LIBM_CONTROLS.quantum;
    const bare = await corroborateFully(cfg);
    LIBM_CONTROLS.quantum = saved;
    ok("!! SABOTAGE: with the control removed the SAME quantity is UNVERIFIED, not passed",
        bare.criteria.c4_portability.pass === false && bare.standing === "NOT CORROBORATED",
        "identical physics, identical numbers, and the standing changes -- because the standing was always a " +
        "claim about the EVIDENCE and not only about the quantity. This is the state every device without a " +
        "register entry is in right now, stated out loud rather than passing quietly");

    // SABOTAGE B: a control that does not move. This is the case that matters -- a perturbation that never
    // reached the device -- and it must be told apart from the honest bit-identical pass above.
    LIBM_CONTROLS.quantum = { mode: "well", field: "ratio31", reaches: "nothing -- deliberately wrong entry",
        why: "SABOTAGE ONLY: ratio31 is in the same libm-free build as ratio21, so it cannot serve as a control. " +
             "If a dead control were accepted, a perturbation that never armed would corroborate everything." };
    const dead = await corroborateFully(cfg);
    LIBM_CONTROLS.quantum = saved;
    ok("!! SABOTAGE: a control that does NOT move is reported as a dead instrument, not a pass",
        dead.criteria.c4_portability.pass === false && /not reaching this device/.test(dead.criteria.c4_portability.evidence),
        "pointing the control at another field of the same libm-free build reproduces exactly what a " +
        "perturbation that never armed would look like, and it is refused: " + dead.criteria.c4_portability.evidence);

    // SABOTAGE C: a control naming a field that does not exist is a BROKEN REGISTER, not a dead instrument.
    // Two very different fixes, and telling a caller the wrong one sends them hunting the wrong thing.
    LIBM_CONTROLS.quantum = { mode: "tunnel", field: "noSuchField", reaches: "Math.sinh",
        why: "SABOTAGE ONLY: a field the build does not produce. The report must say the ENTRY is broken rather " +
             "than claiming the perturbation is not reaching the device." };
    const absent = await corroborateFully(cfg);
    LIBM_CONTROLS.quantum = saved;
    ok("...and a control naming a missing field says the REGISTER is broken, not the instrument",
        absent.criteria.c4_portability.pass === false && /broken register entry/.test(absent.criteria.c4_portability.evidence),
        "a typo in the register and a perturbation that never armed have completely different fixes; a report " +
        "that conflated them would send someone hunting the wrong one");
}

// ---- 4. MOVEMENT IS ITS OWN LIVENESS PROOF -- NO CONTROL DEMANDED WHERE NONE IS NEEDED ------------------------------
{
    const o = await corroborateFully({ device: "optics", mode: "airy", field: "rayleighFactor",
        refinement: REFINEMENT_KNOBS.optics, nuisance: NEW_NUISANCE.optics, registration: reg, tol: 2e-3 });
    ok("a quantity that MOVED is judged on magnitude and never asked for a control",
        o.criteria.c4_portability.moved === true && o.criteria.c4_portability.controlNeeded === false,
        o.criteria.c4_portability.evidence + " -- optics has no register entry and does not need one; movement " +
        "already proves the perturbation reached it. Demanding a control here would be ceremony, and ceremony " +
        "is how a check gets switched off");

    const c = await corroborateFully({ device: "chaos", mode: "feigenbaum", field: "deltaBest",
        refinement: REFINEMENT_KNOBS.chaos, nuisance: { param: "warmup", values: [20000, 40000, 80000], tol: 1e-9 },
        registration: reg });
    ok("a quantity that moves TOO MUCH still fails on magnitude",
        c.criteria.c4_portability.pass === false && c.criteria.c4_portability.moved === true,
        c.criteria.c4_portability.evidence + " -- the round must not have quietly turned c4 into a liveness " +
        "check that forgot to judge the number");
}

// ---- 5. NO STANDING WAS LOST, AND THAT IS A RESULT RATHER THAN A RELIEF ---------------------------------------------
{
    const rows = [
        ["quantum", "well", "ratio21", REFINEMENT_KNOBS.quantum, NEW_NUISANCE.quantum, undefined, reg],
        ["quantum", "well", "ratio31", REFINEMENT_KNOBS.quantum, NEW_NUISANCE.quantum, undefined, reg],
        ["lens", "deflect", "deflectionMeasured", REFINEMENT_KNOBS.lens, NUISANCE_KNOBS.lens, undefined, LENS_DEFLECT_REGISTRATION],
    ];
    const out = [];
    for (const [device, mode, field, refinement, nuisance, tol, registration] of rows) {
        out.push(await corroborateFully({ device, mode, field, refinement, nuisance, tol, registration }));
    }
    ok("!! every quantity that passed c4 by NOT MOVING still passes, now with its proof attached",
        out.every((r) => r.standing === "CORROBORATED" && r.criteria.c4_portability.control?.moved),
        out.map((r) => r.device + "." + r.field).join(", ") + " -- three standings, each now naming the control " +
        "that proves the perturbation was live. Had any of them turned out to be case (c) it would have been a " +
        "retraction, and the round was worth running either way");
    console.log("  NOTE   this rules out a perturbation that never reached the device. It does NOT distinguish a");
    console.log("         libm-free path from a QUANTISED observable -- criterion 2 does that, because a quantised");
    console.log("         quantity is bit-identical under its nuisance knob too. The two criteria are load-bearing");
    console.log("         together and neither is sufficient alone, which is the entire argument for a battery.");
}

console.log();
if (fails) { console.log("libmControl-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("libmControl-selfcheck: all checks pass");
