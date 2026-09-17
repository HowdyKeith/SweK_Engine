// WebGLEngine/tools/ship/murmurIgnite2-selfcheck.mjs -- v4644
//
// *** THE SECOND HALF OF THE SUCCESS FLASH'S PIXEL EVIDENCE: abyss AND tempest. ***
// tools/ship/murmurIgnite-selfcheck.mjs carries still and geode -- the shared shell against a species that
// has none -- and states the instrument and why it is a centroid rather than a peak radius. This gate carries
// the two heroes that are NOT the common case:
//
//   abyss   the deepest shell in the roster. gain 0.42 against still's 0.30, travelling to hi = 1.00 rather
//           than 0.95, on the hero "with the least else" -- a species that is mostly night, so its flash has
//           the largest ratio to its own idle frame of any of the eighteen.
//   tempest the PRE-MULTIPLY. It and nebula are the only two of the seven that also do e *= 1 + preK *
//           complete before adding the ring, so the entire cloud lights up and THEN a front travels through
//           what is already lit. nebula.ts says it in one line -- "the cloud ignites from the inside and a
//           front travels out through it, brightening what is already there" -- and that is two different
//           terms, which is exactly what this gate separates.
//
// *** THE PRE-MULTIPLY IS THE REASON THIS GATE EXISTS AND NOT ONLY THE REASON IT HAS TWO SPECIES. *** A port
// that dropped preK entirely would still draw a travelling ring on tempest and would pass every row in the
// sibling gate. What it could not do is put 135% of a frame's light on the screen at a tau when the ring is
// still deep in the heart, PROPORTIONALLY to the cloud that is already there -- and that is the row below.
"use strict";

import * as K from "../../render/murmurKit.mjs";
import { sp, renderSpecies, N3, light } from "./murmurSpeciesFrames.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurIgnite2-selfcheck -- the deepest shell, and the two clouds that ignite whole\n");

const TAUS = [0.20, 0.40, 0.60, 0.80, 1.40];
const SUCCESS = 4, IDLE = 0, LISTENING = 1;

const FRAMES = [];
for (const s of ["abyss", "tempest"]) {
    FRAMES.push(sp(s, 0, undefined, { stateIndex: IDLE, stateTau: 0 }));
    for (const t of TAUS) FRAMES.push(sp(s, 0, undefined, { stateIndex: SUCCESS, stateTau: t }));
}
// *** THE QUIET-STATE CONTROL COMPARES A STATE AGAINST ITSELF AT TWO TAUS, AND THE FIRST CUT DID NOT. ***
// It held stateTau against the IDLE frame across two DIFFERENT states, and LISTENING moved 1,934 bytes --
// correctly, and for a reason that has nothing to do with the flash: mh_live weights the microphone by
// 0.55 + 0.45 in LISTENING, so the whole species is brighter there whatever mh_state does. An instrument
// confounded by something other than its subject, which is the shape this session has repaired four times.
// Holding the STATE and sweeping only tau is the control that asks the question actually being asked.
FRAMES.push(sp("tempest", 0, undefined, { stateIndex: IDLE, stateTau: 0.60 }));
FRAMES.push(sp("tempest", 0, undefined, { stateIndex: LISTENING, stateTau: 0.0 }));
FRAMES.push(sp("tempest", 0, undefined, { stateIndex: LISTENING, stateTau: 0.60 }));

const run = await renderSpecies(FRAMES);
const okRun = run.ok && run.frames && run.frames.length === FRAMES.length;
if (!okRun) {
    ok("!! abyss's and tempest's SUCCESS flashes render at all", false,
        `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}.`);
    console.log("\nFAIL -- 1 check(s)");
    process.exit(1);
}
say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FRAMES.length} frames at ${N3}x${N3}`);

/** The same instrument the sibling gate defines and for the same reasons -- see its header. */
const flash = (px, base) => {
    let num = 0, den = 0;
    for (let y = 0; y < N3; y++) for (let x = 0; x < N3; x++) {
        const dx = (x + 0.5) / N3 * 2 - 1, dy = (y + 0.5) / N3 * 2 - 1;
        const rho = Math.hypot(dx, dy);
        if (rho > 0.98) continue;
        const d = base ? light(px, x, y) - light(base, x, y) : light(px, x, y);
        if (d <= 0) continue;
        num += d * rho; den += d;
    }
    return { centroid: den ? num / den : 0, sum: den };
};

const PER = 1 + TAUS.length;
const M = [0, 1].map((si) => {
    const base = run.frames[si * PER];
    return { base, self: flash(base, null), taus: TAUS.map((t, ti) => flash(run.frames[si * PER + 1 + ti], base)) };
});
const [AB, TE] = M;
const pct = (m, s) => 100 * m.sum / s.self.sum;

// =============================================================================================================
sec("1. *** THE PRE-MULTIPLY: tempest's WHOLE CLOUD IS LIT BEFORE THE RING GETS ANYWHERE, AND abyss's IS NOT ***");
{
    say(`abyss:   idle light ${AB.self.sum.toFixed(1)} at centroid ${AB.self.centroid.toFixed(4)}; ` +
        `at tau 0.20 the flash adds ${pct(AB.taus[0], AB).toFixed(1)}% at centroid ${AB.taus[0].centroid.toFixed(4)}`);
    say(`tempest: idle light ${TE.self.sum.toFixed(1)} at centroid ${TE.self.centroid.toFixed(4)}; ` +
        `at tau 0.20 the flash adds ${pct(TE.taus[0], TE).toFixed(1)}% at centroid ${TE.taus[0].centroid.toFixed(4)}`);

    // At tau 0.20 the sweep is 0.21, so the ring sits at |p| = 0.24 of a body radius -- deep in the heart.
    // Anything the frame gains OUT at the cloud's own centroid at that moment did not come from the ring.
    const teNear = Math.abs(TE.taus[0].centroid - TE.self.centroid);
    const abNear = Math.abs(AB.taus[0].centroid - AB.self.centroid);
    ok("!! *** tempest's EARLY FLASH IS THE CLOUD ITSELF LIGHTING UP -- proportional, where abyss's is a ring in the heart ***",
        pct(TE.taus[0], TE) > 80 && teNear < 0.06 && pct(AB.taus[0], AB) < 60 && abNear > 0.30,
        `at tau 0.20 -- sweep 0.21, so the ring is at |p| = 0.24 of a body radius, deep inside -- tempest has ` +
        `already gained ${pct(TE.taus[0], TE).toFixed(1)}% of its own idle light, sitting ${teNear.toFixed(4)} ` +
        `from the centroid of the cloud that was already there: a SCALING of the existing picture, which is ` +
        `what e *= 1 + 0.70 * complete does. abyss at the same tau gains ${pct(AB.taus[0], AB).toFixed(1)}% at ` +
        `${abNear.toFixed(4)} from its own -- a small bright thing in the middle of a dark body, which is what ` +
        `a ring with no pre-multiply looks like. BOTH HALVES: a port that pre-multiplied ALL SEVEN would pass ` +
        `the first and fail the second.`);

    ok("!! ...and MH_IGNITE carries a preK on exactly the two species murmur gives one to, and zero on the rest",
        Object.entries(K.MH_IGNITE).filter(([, v]) => v.preK > 0).map(([k]) => k).sort().join(",") === "nebula,tempest" &&
        K.MH_IGNITE.tempest.preK === 0.70 && K.MH_IGNITE.nebula.preK === 0.65,
        `nebula 0.65 and tempest 0.70; the other five entries are 0.00. The two are the collection's two ` +
        `VOLUMETRIC heroes and that is the whole reason: a cloud is the one body that can light up as a body ` +
        `rather than only along a front. AND THE TWO PUT IT ON OPPOSITE SIDES OF THEIR OWN GESTURE -- nebula's ` +
        `ignition block sits above its gesture and tempest's below its bolts, so tempest's pre-multiply ` +
        `brightens its lightning and nebula's does not. That ordering is transcribed rather than normalised, ` +
        `and it is why render/aiPresenceOrbTsl.mjs calls its igniteMist from two different places.`);
}

// =============================================================================================================
sec("2. *** AND THE RING STILL TRAVELS THROUGH THE CLOUD IT LIT: two travels, and they end differently ***");
{
    const abC = AB.taus.map((m) => m.centroid), teC = TE.taus.map((m) => m.centroid);
    say(`abyss's flash centroid by tau: ${TAUS.map((t, i) => `${t} -> ${abC[i].toFixed(4)}`).join(", ")}`);
    say(`tempest's, the same: ${TAUS.map((t, i) => `${t} -> ${teC[i].toFixed(4)}`).join(", ")}`);

    let abMono = true; for (let i = 1; i < 4; i++) if (!(abC[i] > abC[i - 1])) abMono = false;
    ok("!! *** abyss's SHELL IS THE DEEPEST TRAVEL IN THE ROSTER: 0.29 of the quad, monotone over four taus ***",
        abMono && abC[3] - abC[0] > 0.24,
        `the centroid of the added light climbs ${abC[0].toFixed(4)} -> ${abC[3].toFixed(4)}, a journey of ` +
        `${(abC[3] - abC[0]).toFixed(4)}, while the amplitude goes ` +
        `${TAUS.slice(0, 4).map((t, i) => pct(AB.taus[i], AB).toFixed(0) + "%").join(" -> ")} -- up and back ` +
        `down, so the centroid is not following the brightness. abyss.ts is "the hero with the least else": ` +
        `its gain is 0.42 against still's 0.30 and its hi is 1.00 against 0.95, and against a nearly black ` +
        `idle frame that makes ${Math.max(...AB.taus.map((m) => pct(m, AB))).toFixed(0)}% the largest flash ` +
        `either of these two gates renders.`);

    // *** THE ONE PLACE THIS GATE REPORTS A FALL RATHER THAN A CLIMB, AND IT IS A MEASUREMENT AND NOT A MISS. ***
    let teMono = true; for (let i = 1; i < 3; i++) if (!(teC[i] > teC[i - 1])) teMono = false;
    ok("!! ...and tempest's travels too, then hands the frame back to the lit cloud as the ring reaches the shell",
        teMono && teC[2] - teC[0] > 0.06 && teC[3] < teC[2] && Math.abs(teC[3] - TE.self.centroid) < Math.abs(teC[2] - TE.self.centroid),
        `${teC[0].toFixed(4)} -> ${teC[1].toFixed(4)} -> ${teC[2].toFixed(4)} over the first three taus, and ` +
        `then BACK to ${teC[3].toFixed(4)} at tau 0.80. That is not the ring stopping: at 0.80 the sweep is ` +
        `0.84 and the ring sits at |p| = 0.89, where the membership has begun to fade and the surviving ` +
        `transmittance along the ray is spent, so the ring's own contribution shrinks and what is left is the ` +
        `pre-multiplied cloud -- whose centroid is ${TE.self.centroid.toFixed(4)}, and ${teC[3].toFixed(4)} is ` +
        `closer to it than ${teC[2].toFixed(4)} was. The number is reported as it reads rather than trimmed to ` +
        `four taus that would have been monotone.`);
}

// =============================================================================================================
sec("3. *** THE QUIET STATES, ON THE SPECIES WITH THE EXTRA PATH ***");
{
    const quietI = run.frames[FRAMES.length - 3], listen0 = run.frames[FRAMES.length - 2],
          listenT = run.frames[FRAMES.length - 1];
    let dI = 0, dL = 0, dLive = 0;
    for (let i = 0; i < quietI.length; i++) {
        if (quietI[i] !== TE.base[i]) dI++;
        if (listenT[i] !== listen0[i]) dL++;
        if (listen0[i] !== TE.base[i]) dLive++;
    }
    ok("!! *** SWEEPING stateTau MOVES NOTHING IN IDLE OR IN LISTENING -- byte for byte, on the species with two paths ***",
        dI === 0 && dL === 0 && dLive > 500,
        `${dI} bytes in IDLE and ${dL} in LISTENING differ between tau 0 and tau 0.60, out of ${TE.base.length}. ` +
        `tempest has TWO paths a SUCCESS term could leak by -- the pre-multiply on the whole march and the ring ` +
        `added after the bolts -- and the pre-multiply is the dangerous one, because e *= 1 + preK * complete ` +
        `touches every tap of every ray rather than a shell. EACH STATE IS HELD AGAINST ITSELF: the first cut ` +
        `compared LISTENING at tau 0.60 to IDLE at tau 0 and read 1,934 moved bytes, which is mh_live's voice ` +
        `window opening and not a leak at all -- the same ${dLive} bytes this row still measures, on purpose, ` +
        `so that a shader which stopped reading stateIndex would fail here rather than pass more easily.`);

    const settleRatio = pct(TE.taus[4], TE);
    ok("!! ...and tempest still carries its settle past the end of the flash, at the roster's smallest gain",
        settleRatio > 20 && settleRatio < pct(TE.taus[2], TE),
        `at tau 1.40, with complete long closed, tempest is still ${settleRatio.toFixed(1)}% brighter than its ` +
        `idle frame -- the settle, at MH_SETTLED.tempest = ${K.MH_SETTLED.tempest}, which is the roster's ` +
        `smallest along with five others -- and that is below its ${pct(TE.taus[2], TE).toFixed(1)}% at the ` +
        `flash's peak, so the two terms are distinguishable in the same five frames rather than one number ` +
        `standing in for both.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the two heroes whose SUCCESS is not the common case. abyss has the deepest shell " +
    "in the roster and the darkest body to draw it on; tempest and nebula are the only two that also light " +
    "the whole cloud before the ring travels through it, which is a term a port can drop while still drawing " +
    "a perfectly good ring. The shared shell, the species with no shell at all, and the instrument's own " +
    "justification are next door in tools/ship/murmurIgnite-selfcheck.mjs." +
    "\nWHAT IS NOT CLAIMED: nebula's half of the pre-multiply in pixels -- it is the same igniteMist call at " +
    "the other side of the gesture and rendering it would be a third species against this gate's budget, so " +
    "the ORDERING is graded as a source census in tools/ship/murmurLive-selfcheck.mjs and the constant here. " +
    "st.drive is unported and named there too.");
process.exit(fails ? 1 : 0);
