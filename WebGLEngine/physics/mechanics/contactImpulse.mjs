// WebGLEngine/physics/mechanics/contactImpulse.mjs -- v3580
// ---------------------------------------------------------------------------------------------------------------
// *** THE CONTACT BLOCK'S STATED PURPOSE IS FALSE FOR THE FIELD IT EXPORTS, AND BUILDING IT IS HOW THAT WAS
// FOUND. ***
//
// box3d_shim.c's contacts header (v3037) says the key is: "sum the normal impulses acting on a body across a step
// and it must equal that body's momentum change." v3569 rebuilt the wasm and corrected the field, choosing
// totalNormalImpulse over normalImpulse because box3d's own doc says the latter is the FINAL SUB-STEP ONLY. That
// correction was right. THE CLOSURE IT WAS MADE FOR STILL DOES NOT EXIST.
//
// MEASURED, STEP BY STEP THROUGH ONE IMPACT (dt = 1/480, 4 substeps, a 1 kg box dropped from 3 m):
//
//     step   momentum actually delivered   totalNormalImpulse reported   ratio
//     345            7.01390                       12.21798             1.742    <- the impact
//     346            0.01501                        0.21564            14.368    <- settling
//     347            0.00743                        0.21978            29.593
//     350            0.00851                        0.25364            29.797
//     ...            fully at rest                                      2.0000
//
// *** IT IS NOT A CONSTANT AND IT IS NOT A CONVERSION FACTOR. *** 1.74 at impact, 13 to 30 while settling, and
// exactly 2 only in the static limit. A number that wanders over an order of magnitude is not a budget that
// closes with a coefficient in front of it -- IT IS A DIAGNOSTIC SUM THAT HAPPENS TO AGREE WITH ONE IN A
// SPECIAL CASE.
//
// AND THE REASON IS READ, NOT GUESSED -- box3d's own solver.c. Each substep runs `b3_stageSolve` with
// useBias=true AND `b3_stageRelax` with useBias=false, both calling b3SolveContacts_*, and line 458 accumulates
// `cp->totalNormalImpulse += newImpulse` in each. A third contribution comes from b3ApplyRestitution at line 652.
// *** WHEN THE STATE IS NOT CHANGING, THE TWO PASSES COMPUTE THE SAME IMPULSE AND THE SUM IS EXACTLY TWICE THE
// PHYSICAL ONE. WHEN IT IS CHANGING, THEY COMPUTE DIFFERENT ONES AND THE SUM MEANS NOTHING IN PARTICULAR. ***
// That is the whole result, and it is a property of a soft-step solver rather than a defect in box3d.
//
// ================================================================================================================
// WHAT SURVIVES AS A KEY, BECAUSE A NEGATIVE RESULT IS NOT AN EMPTY ROUND
// ================================================================================================================
//
//   THE STATIC CLOSURE IS EXACT. A resting box's contact must cancel gravity precisely, because its velocity does
//   not change. sum(totalNormalImpulse)/2 = m g dt to four digits ACROSS dt 1/60 TO 1/240 AND SUBSTEPS 1 TO 16 --
//   ratios 2.0000, 2.0000, 1.9999, 2.0000, 1.9999, 1.9995, 1.9991. The constancy across two independent knobs is
//   what makes it a solver property rather than a fitted number.
//
//   THE FIELD RELATIONSHIP IS EXACT AND IT QUANTIFIES THE OLD BUG. normalImpulse / totalNormalImpulse = 1/(2*ss)
//   exactly: 1/1, 1/2, 1/4, 1/8, 1/16 measured at substeps 1, 2, 4, 8, 16. *** SO THE PRE-v3569 GUESS WOULD HAVE
//   UNDER-REPORTED BY EXACTLY THE SUBSTEP COUNT -- the magnitude v3569 predicted from a doc comment, now
//   measured. ***
//
//   AND A PREDICTION FROM THE SOURCE READING WAS TESTED AND COULD NOT FIRE, WHICH IS ALSO A RESULT.
//   b3ApplyRestitution is a third accumulating pass, so a bouncy contact should push the ratio ABOVE 2. It does
//   not: 1.9999 at e = 0, 0.2, 0.5 and 0.9. contact_solver.c line 631 says why -- restitution is skipped unless
//   `cp->relativeVelocity` exceeds a threshold, and A RESTING CONTACT HAS NO APPROACH SPEED. The prediction was
//   not wrong; THE TEST COULD NOT REACH IT, and the flat 1.9999 is evidence that exactly two passes ran.
"use strict";
import { pathToFileURL } from "node:url";
import { initNode, mod, has } from "../box3d/box3dNode.mjs";

export function contactsAvailable() {
    return has("swk_contacts") && has("swk_contact_count") && has("swk_contact_stride");
}

/** Every contact row for one body: [bodyIdx, px,py,pz, nx,ny,nz, totalNormalImpulse, lastSubstepImpulse]. */
export function contactRows(bodyIdx, m = mod()) {
    const n = m._swk_contact_count();
    if (!n) return [];
    const S = m._swk_contact_stride(), p = m._malloc(n * S * 4);
    m._swk_contacts(p);
    const a = Array.from(m.HEAPF32.subarray(p / 4, p / 4 + n * S));
    m._free(p);
    const out = [];
    for (let i = 0; i < n; i++) { const r = a.slice(i * S, (i + 1) * S); if (r[0] === bodyIdx) out.push(r); }
    return out;
}
export const sumTotal = (rows) => rows.reduce((a, r) => a + r[7], 0);
export const sumLast = (rows) => rows.reduce((a, r) => a + r[8], 0);

/** The number solver.c justifies: two accumulating passes per substep, so the physical impulse is half the sum. */
export const SOLVER_PASSES = 2;

/**
 * A box left to settle, then one more step measured. Its velocity does not change, so the contact impulse must
 * cancel gravity exactly -- WHICH IS WHY THE STATIC CASE IS THE ONE WITH NO PAIRING AMBIGUITY. There is no
 * question of which step's impulse belongs to which velocity change when the velocity change is zero.
 */
export function restingBudget({ dt = 1 / 240, substeps = 4, g = 9.8, settle = 400, e = null } = {}) {
    const m = mod();
    m._swk_world_create(0, -g, 0);
    const ground = m._swk_body_box(0, 0, -0.5, 0, 20, 0.5, 20, 1);
    const box = m._swk_body_box(1, 0, 0.5, 0, 0.5, 0.5, 0.5, 1);
    if (e !== null && has("swk_body_set_restitution")) {
        m._swk_body_set_restitution(ground, e); m._swk_body_set_restitution(box, e);
    }
    const mass = 1 * 8 * 0.5 * 0.5 * 0.5;
    for (let i = 0; i < settle; i++) m._swk_world_step(dt, substeps);
    m._swk_world_step(dt, substeps);
    const rows = contactRows(1, m);
    const total = sumTotal(rows), last = sumLast(rows);
    m._swk_world_destroy();
    const need = mass * g * dt;
    // the ROWS travel with the result: the world is destroyed above, so a caller that wanted to inspect a row
    // afterwards would get an empty list from a dead world. The first version of the gate did exactly that.
    return { dt, substeps, mass, need, points: rows.length, rows, total, last,
             ratioTotal: total / need, ratioLast: last / need,
             closure: (total / SOLVER_PASSES) / need,          // the key: must be 1
             fieldRatio: total ? last / total : null };        // must be 1/(2*substeps)
}

/**
 * The same body through a REAL IMPACT, reported step by step. This is the measurement that refutes the header:
 * `needed` is what the momentum actually changed by, `reported` is what the contact list says.
 */
export function impactTrace({ dt = 1 / 480, substeps = 4, g = 9.8, h0 = 3, maxSteps = null } = {}) {
    const m = mod();
    m._swk_world_create(0, -g, 0);
    m._swk_body_box(0, 0, -0.5, 0, 20, 0.5, 20, 1);
    m._swk_body_box(1, 0, h0, 0, 0.5, 0.5, 0.5, 1);
    const vy = () => { const n = m._swk_body_count(), p = m._malloc(n * 3 * 4);
        m._swk_velocities(p, n); const v = m.HEAPF32[p / 4 + 4]; m._free(p); return v; };
    const out = [];
    const N = maxSteps || Math.round(3 / dt);
    for (let i = 0; i < N; i++) {
        const before = vy();
        m._swk_world_step(dt, substeps);
        const after = vy();
        const reported = sumTotal(contactRows(1, m));
        if (reported > 0) {
            const needed = (after - before) + g * dt;         // momentum change minus gravity's share
            out.push({ step: i, before, after, needed, reported, ratio: needed !== 0 ? reported / needed : Infinity });
        }
        if (out.length > 40) break;
    }
    m._swk_world_destroy();
    return out;
}

export const MEASURED_V3580 = {
    theStatedClosureDoesNotExist:
        "box3d_shim.c's contacts header says the key is 'sum the normal impulses acting on a body across a step " +
        "and it must equal that body's momentum change'. *** IT IS FALSE FOR THE FIELD IT EXPORTS. *** Measured " +
        "through one impact: reported/needed is 1.742 at the impact step, then 14.4, 29.6, 27.3, 29.8 while " +
        "settling, and exactly 2 only once the body is at rest. A NUMBER THAT WANDERS OVER AN ORDER OF " +
        "MAGNITUDE IS NOT A BUDGET WITH A COEFFICIENT IN FRONT OF IT.",
    theReasonIsReadNotGuessed:
        "box3d's solver.c runs b3_stageSolve (useBias=true) AND b3_stageRelax (useBias=false) per substep, both " +
        "calling b3SolveContacts_*, and contact_solver.c:458 accumulates totalNormalImpulse in each. *** WHEN " +
        "THE STATE IS NOT CHANGING THE TWO PASSES COMPUTE THE SAME IMPULSE AND THE SUM IS EXACTLY TWICE THE " +
        "PHYSICAL ONE; WHEN IT IS CHANGING THEY COMPUTE DIFFERENT ONES AND THE SUM MEANS NOTHING IN " +
        "PARTICULAR. *** A property of a soft-step solver, not a defect in box3d -- which is why the finding is " +
        "a corrected header rather than a bug report.",
    whatSurvives:
        "THE STATIC CLOSURE IS EXACT: sum/2 = m g dt to four digits across dt 1/60 to 1/240 AND substeps 1 to " +
        "16, and constancy across two independent knobs is what makes it a solver property rather than a fitted " +
        "number. AND THE FIELD RELATIONSHIP QUANTIFIES THE OLD BUG: normalImpulse/totalNormalImpulse = 1/(2*ss) " +
        "exactly at ss = 1, 2, 4, 8, 16, so the pre-v3569 guess would have under-reported by EXACTLY the substep " +
        "count -- the magnitude v3569 predicted from a doc comment, now measured.",
    thePredictionCouldNotFire:
        "b3ApplyRestitution is a third accumulating pass, so a bouncy contact should push the ratio above 2. It " +
        "does not: 1.9999 at e = 0, 0.2, 0.5, 0.9. contact_solver.c:631 says why -- restitution is skipped " +
        "unless relativeVelocity exceeds a threshold, and A RESTING CONTACT HAS NO APPROACH SPEED. *** THE " +
        "PREDICTION WAS NOT WRONG; THE TEST COULD NOT REACH IT *** -- and the flat 1.9999 is positive evidence " +
        "that exactly two passes ran.",
};

export async function reportLines() {
    const st = await initNode();
    const L = [];
    L.push("[contactImpulse] the closure the shim header promised, and why it is not there");
    L.push("");
    if (!st.ready) { L.push("  box3d wasm not loadable: " + st.reason); return L; }
    if (!contactsAvailable()) { L.push("  contact exports absent -- rebuild with build-box3d-wasm-clang.sh"); return L; }

    L.push("  STATIC CLOSURE -- a resting box's contact must cancel gravity exactly:");
    L.push("    dt      ss    m*g*dt      sum/2       closure   last/total   1/(2*ss)");
    for (const [dt, ss] of [[1 / 60, 4], [1 / 120, 4], [1 / 240, 4], [1 / 240, 1], [1 / 240, 2], [1 / 240, 8], [1 / 240, 16]]) {
        const r = restingBudget({ dt, substeps: ss });
        L.push("    1/" + String(Math.round(1 / dt)).padEnd(4) + " " + String(ss).padStart(3) + "  " +
               r.need.toFixed(6) + "  " + (r.total / 2).toFixed(6) + "   " + r.closure.toFixed(4) +
               "     " + r.fieldRatio.toFixed(5) + "    " + (1 / (2 * ss)).toFixed(5));
    }
    L.push("");
    L.push("  IMPACT TRACE -- the same sum against the momentum actually delivered:");
    L.push("    step   needed     reported    ratio");
    for (const r of impactTrace().slice(0, 6))
        L.push("    " + String(r.step).padStart(4) + "  " + r.needed.toFixed(5).padStart(9) + "  " +
               r.reported.toFixed(5).padStart(9) + "   " + r.ratio.toFixed(3));
    L.push("    *** 1.74 at impact, then 14 to 30 while settling, and 2 only at rest. NOT A CONSTANT. ***");
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of await reportLines()) console.log(l);
    process.exit(0);
}
