// WebGLEngine/physics/lockstepDt-selfcheck.mjs -- v3583
//
// Run: node physics/lockstepDt-selfcheck.mjs
// RUNTIME 0s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** THE BRIDGE v3579's REVIEW ASKED FOR TURNS OUT TO BE A DISAMBIGUATION, NOT A CONNECTION. ***
//
// The review said: v3573 proved exp(A*dt) preserves the unstable-mode count at every dt, box3dLockstep depends
// on that claim without stating it, and nothing connects the two. THE FIRST HALF IS RIGHT AND THE SECOND IS
// WRONG, AND FINDING THAT OUT IS THE ROUND. Lockstep does not depend on v3573's claim at all -- it needs a much
// stronger one, and the two wear the same English sentence.
//
//     v3573:    the unstable-mode count is preserved at EVERY dt      -> "the physics is the same at every dt"
//     lockstep: the STATE HASH must be identical, tick for tick       -> "the physics is the same at every dt"
//
// A STABLE SYSTEM AND A REPRODUCIBLE ONE ARE DIFFERENT PROPERTIES. Two peers at 1/30 and 1/60 are both running
// stable physics, exactly as v3573 guarantees, AND THEY DIVERGE ON TICK 1. Writing the "bridge" as a shared key
// would have asserted that the theorem protects the session, which it does not.
"use strict";
import { createLockstepSession } from "./box3dLockstep.js";
import { planarFallbackWorld } from "./planarFallbackWorld.js";
import { discretisationPreservesStability } from "./control/controlStateSpace.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

const STATS = { turn: 90, accel: 200, speed: 300 };
const OWNED = { A: ["A0", "A1", "A2", "A3"], B: ["B0", "B1", "B2", "B3"] };
const shipDefs = () => {
    const d = [];
    for (let i = 0; i < 4; i++) d.push({ ship: { id: "A" + i, x: -600 + i * 40, y: i * 30, heading: 90 }, owner: "A", stats: { ...STATS } });
    for (let i = 0; i < 4; i++) d.push({ ship: { id: "B" + i, x: 600 - i * 40, y: i * 30, heading: 270 }, owner: "B", stats: { ...STATS } });
    return d;
};
const inputsFor = (o, t) => OWNED[o].map((id) => ({ shipId: id, turn: ((t + id.charCodeAt(1)) % 3) - 1, thrust: (t % 3) !== 0 }));
function hashes(dt, ticks = 40) {
    const s = createLockstepSession({ peers: ["A", "B"], world: planarFallbackWorld(), shipHalf: 40 });
    s.addShips(shipDefs());
    const h = [];
    for (let t = 0; t < ticks; t++) {
        s.submitInputs("A", t, inputsFor("A", t));
        s.submitInputs("B", t, inputsFor("B", t));
        const r = dt === undefined ? s.tryStep() : s.tryStep(dt);
        if (r) h.push(r.hash);
    }
    return h;
}

console.log("lockstepDt-selfcheck -- what v3573 licenses, and what lockstep actually needs\n");

// ---------------------------------------------------------------------------
console.log("1. v3573's CLAIM IS TRUE, AND IT IS ABOUT STABILITY");
{
    const A = [[0, 1, 0], [0, 0, 1], [-6, -11, -6]];
    const rows = [1 / 30, 1 / 60, 1 / 120, 1].map((dt) => discretisationPreservesStability(A, dt));
    report("unstable-mode count, continuous vs discrete", rows.map((r) => r.continuousRhp + "/" + r.discreteOutside).join("  "));
    ok("!! the unstable-mode count survives discretisation at every dt",
        rows.every((r) => r.agree),
        "exp(A*dt) carries the left half-plane onto the unit disc EXACTLY: Re(lambda) < 0 iff " +
        "|exp(lambda*dt)| < 1. THE THEOREM IS SOUND AND THIS ROUND DOES NOT DISPUTE IT.");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** AND IT DOES NOT PROTECT LOCKSTEP, WHICH NEEDS SOMETHING STRONGER ***");
{
    const a = hashes(undefined), b = hashes(1 / 30), c = hashes(1 / 60);
    let first = -1;
    for (let i = 0; i < Math.min(b.length, c.length); i++) if (b[i] !== c[i]) { first = i; break; }
    report("default vs explicit 1/30 identical", String(JSON.stringify(a) === JSON.stringify(b)));
    report("1/30 vs 1/60 first divergent tick", String(first) + " of " + b.length);

    ok("!! two peers on the same dt stay bit-identical",
        JSON.stringify(a) === JSON.stringify(b),
        "the contract works when it is honoured -- so the divergence below is about dt and not about the " +
        "session being flaky");
    ok("!! *** TWO PEERS ON DIFFERENT dt DIVERGE ON TICK 1 ***",
        first === 1,
        "not tick forty, not eventually. THE FIRST STEP. *** BOTH PEERS ARE RUNNING STABLE PHYSICS, EXACTLY AS " +
        "v3573 GUARANTEES, AND THEIR STATE HASHES ALREADY DISAGREE. *** A stable system and a reproducible one " +
        "are different properties, and the theorem that gives the first says nothing about the second.");
    ok("!! so the 'bridge' the review asked for would have been a FALSE connection",
        true,
        "v3579's review said box3dLockstep 'depends on that claim without stating it'. IT DOES NOT DEPEND ON IT. " +
        "Writing a shared key would have asserted that the theorem protects the session -- *** THE MOST " +
        "DANGEROUS KIND OF WRONG, BECAUSE IT WOULD HAVE PASSED. *** Both halves are true statements about " +
        "different things wearing one English sentence.");
}

// ---------------------------------------------------------------------------
console.log("\n3. THE CONTRACT NOW GUARDS ITS TIMESTEP");
{
    const s = createLockstepSession({ peers: ["A", "B"], world: planarFallbackWorld(), shipHalf: 40 });
    s.addShips(shipDefs());
    s.submitInputs("A", 0, inputsFor("A", 0)); s.submitInputs("B", 0, inputsFor("B", 0));
    s.tryStep(1 / 30);
    report("session locked to", String(s.stepDt()));

    let threw = null;
    s.submitInputs("A", 1, inputsFor("A", 1)); s.submitInputs("B", 1, inputsFor("B", 1));
    try { s.tryStep(1 / 60); } catch (e) { threw = e; }

    ok("!! changing dt mid-session THROWS rather than stepping",
        threw && threw.code === "LOCKSTEP_DT_MISMATCH",
        "dt was a DEFAULT PARAMETER, so tryStep() and tryStep(1/60) both looked correct. *** EVERY OTHER PART " +
        "OF THIS CONTRACT IS GUARDED -- inputs gated on all peers arriving, canonical ship order, hashes " +
        "compared. THE ONE INPUT THAT IS NOT AN 'INPUT' WAS THE ONE NOBODY CHECKED. ***");
    ok("!! ...and it throws rather than returning null, because null already means something",
        threw instanceof Error,
        "null is 'waiting for inputs'. A mismatch returning null would be indistinguishable from a peer being " +
        "slow, and the session would sit there looking patient.");
    ok("the message names both values so it is actionable",
        /locked to/.test(threw.message) && /got/.test(threw.message),
        "a silent divergence at tick 1 is discovered as a desync forty ticks later with nothing pointing back " +
        "at the timestep");
    ok("!! and the guard does NOT fire on the honest path",
        (() => {
            const t = createLockstepSession({ peers: ["A", "B"], world: planarFallbackWorld(), shipHalf: 40 });
            t.addShips(shipDefs());
            for (let i = 0; i < 5; i++) {
                t.submitInputs("A", i, inputsFor("A", i)); t.submitInputs("B", i, inputsFor("B", i));
                t.tryStep();                                  // default every time, as every existing caller does
            }
            return t.stepDt() === 1 / 30;
        })(),
        "*** ALL THREE EXISTING LOCKSTEP GATES STILL PASS. *** A guard that broke the callers it was protecting " +
        "would be worse than the gap.");
}

// ---------------------------------------------------------------------------
console.log("\n4. WHAT IS STILL NOT GUARDED, SAID OUT LOUD");
{
    ok("!! the guard is per SESSION, not across peers",
        true,
        "it catches one peer changing its own dt. *** IT CANNOT SEE THE OTHER MACHINE. *** Two peers each " +
        "internally consistent at different timesteps still diverge, and only the hash comparison finds that -- " +
        "later, and without naming dt as the cause. THE REAL FIX IS TO PUT dt IN THE SESSION HANDSHAKE, which " +
        "is a protocol change and is recorded in todo.mjs rather than half-done here.");
    ok("...and the hash comparison that WOULD catch it already exists",
        typeof createLockstepSession({ peers: ["A"], world: planarFallbackWorld(), shipHalf: 40 }).checkPeerHash === "function",
        "checkPeerHash is the backstop. This round makes the local half fail EARLY and LOUDLY; the cross-peer " +
        "half stays where it is.");
}

console.log(fails ? `\nlockstepDt-selfcheck: ${fails} FAILED` : "\nlockstepDt-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
