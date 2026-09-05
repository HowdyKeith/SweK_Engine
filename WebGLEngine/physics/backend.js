// physics/backend.js -- the "best of both worlds" physics facade. box3d and Jolt implement the SAME world-handle
// interface, so this picks the right engine for a scene and hands back ONE API:
//   - box3d: tiny WASM, fast for many simple rigid bodies -- the lightweight default.
//   - Jolt:  AAA-grade -- constraints, ragdolls, vehicles, accurate; deterministic same-build.
// You CANNOT mix them inside one deterministic lockstep sim, so this chooses ONE backend per world, by what the
// scene NEEDS, with graceful fallback.
//
// v2477 -- this sentence was right for two hundred versions and cited the wrong proof. It used to say "proven by the
// divergence harness". The divergence harness cannot prove it: backend-qa-check RECORDS THE OBSERVED drift between
// the two engines and gates future runs against that recording. A baseline taken from the code under test can detect
// CHANGE and never WRONGNESS -- so when box3d turned out to carry no drag at all while Jolt carried 5%/s, that was
// not caught, it was RECORDED, and it became the expected envelope. The bug lived inside its own baseline for about
// two hundred versions.
//
// What actually proved it (v2468-v2470, measured on real hardware): hold EACH engine against MATHEMATICS, not
// against each other. The exact damped trajectory says 95.15632 m; Jolt said 95.15633 and box3d said 95.07456,
// which is precisely the same integrator with the drag removed. That is how the bug surfaced. Then, with the damping
// fixed and both engines agreeing to 0.05000/s and passing every exact check, two identical worlds STILL drifted
// 0.925 m apart in 2.5 seconds -- because collisions amplify the last bit of a float about 90,000x, and two
// independent codebases differ in the last bit at best. Mixed-backend lockstep is not broken; it is IMPOSSIBLE.
// Each engine is bit-identical against itself, so lockstep is perfect when every peer runs the same engine.
// See physics/damping.js, box3dSyncCompare.backendMismatch(), and the refusal in box3dLockstepNet.
// When Jolt is chosen it also exposes the Jolt-only extras (structures, ragdolls) through the same handle.
"use strict";

// *** v4400 -- box3d's ROW WAS WRONG AND THE ROUTER ACTED ON IT. ***
//
// This said `box3d: { constraints: false }` and put "constraints" in JOLT_ONLY, so selectBackend({need:
// ['constraints']}) returned ONLY Jolt. box3d has had revolute, spherical and weld joints since v2515, motors
// and limits since v4385 and a wheel joint since v4398, and box3dLoader's world advertises supportsJoints()
// by asking the artifact whether swk_joint_spherical exists -- it answers TRUE. Meanwhile JoltWorld's own
// supportsJoints() answers FALSE, because that binding never bound Jolt's constraints.
//
// So the router sent every caller who needed constraints to the one backend whose portable joint interface
// refuses them, and excluded the one that has them. Both records were readable the whole time and disagreed.
//
// *** AND THE ROWS BELOW ARE ABOUT THIS FACADE, NOT ABOUT THE ENGINES. *** That distinction is what the old
// table conflated. `ragdolls` and `vehicles` stay Jolt-only and the reason is NOT that box3d cannot do them:
// physics/ragdollFromSkeleton.mjs derives a ragdoll that box3d steps, and v4398 bound the wheel joint. It is
// that THIS FILE has a createRagdoll and no box3d equivalent, so a caller asking the facade for one can only
// be served by Jolt. A capability table for a router describes what the router can hand you.
const CAPS = {
    box3d: { constraints: true, ragdolls: false, footprint: "small", deterministic: true,
             note: "lightweight, tiny WASM, fast for many simple bodies; joints yes, no facade ragdoll factory" },
    // *** AND JOLT'S ROW MOVED THE OTHER WAY, FOR THE SAME REASON. *** `constraints` here means THE PORTABLE
    // JOINT INTERFACE, which is what a caller reading this table then calls. JoltWorld.supportsJoints()
    // returns false and says why in its own comment -- "not 'Jolt cannot', but 'our JoltWorld cannot'" -- so a
    // caller told constraints:true would get a world that answers -1 to every joint call. Jolt's constraints
    // are still reachable, through createRagdoll and world.raw(), and that is what `ragdolls: true` is for.
    //
    // Defining the field this way makes it CHECKABLE: for every backend, caps.constraints must equal what its
    // own world says. physics/backendRouting-selfcheck.mjs asserts exactly that, on both, by loading them.
    jolt: { constraints: false, ragdolls: true, vehicles: true, footprint: "large", deterministic: true,
            note: "AAA-grade: ragdolls and vehicles via createRagdoll/raw(); this binding exposes no portable joints" },
};
// Capabilities only THIS FACADE's Jolt branch can serve -- see the note above on why that is not the same
// question as which engine has the feature. "constraints" is off the list because box3d serves them.
const JOLT_ONLY = ["ragdolls", "vehicles", "destructible"];

function wrap(name, backend) {
    const api = { name, caps: CAPS[name], createWorld: (o) => backend.createWorld(o), _raw: backend };
    if (name === "jolt") {
        api.createStructures = async (world) => (await import("./jolt/joltStructures.js")).createStructures(world);
        api.createRagdoll = async (world, o) => (await import("./jolt/joltRagdoll.js")).createRagdoll(world, o);
    }
    return api;
}

// selectBackend({ need:['ragdolls'], prefer:'auto'|'box3d'|'jolt', allowFallback:true })
async function selectBackend(opts = {}) {
    const need = opts.need || [], prefer = opts.prefer || "auto";
    const needsJolt = need.some((n) => JOLT_ONLY.includes(n));
    let order;
    if (needsJolt) order = ["jolt"];                              // hard requirement -> only Jolt can do it
    else if (prefer === "jolt") order = ["jolt", "box3d"];
    else if (prefer === "box3d") order = ["box3d", "jolt"];
    else order = ["box3d", "jolt"];                               // auto: try the lighter engine first, fall back to Jolt
    const tried = [];
    for (const name of order) {
        try {
            if (name === "jolt") { const { createJoltBackend } = await import("./jolt/joltLoader.js"); return wrap("jolt", await createJoltBackend()); }
            const { box3d } = await import("./box3d/box3dLoader.js");
            if (box3d.init) { const st = await box3d.init(); if (!(st && st.ready)) { tried.push("box3d(WASM not built)"); continue; } }
            return wrap("box3d", box3d);
        } catch (e) { tried.push(name + "(" + (e.message || "load failed").slice(0, 40) + ")"); }
    }
    throw new Error("no physics backend available; tried: " + tried.join(", "));
}

// what would be chosen, without loading anything (for UI / diagnostics)
function planBackend(opts = {}) {
    const need = opts.need || [], prefer = opts.prefer || "auto";
    if (need.some((n) => JOLT_ONLY.includes(n))) return { pick: "jolt", why: "needs " + need.filter((n) => JOLT_ONLY.includes(n)).join("+") + " (Jolt-only)" };
    if (prefer === "box3d") return { pick: "box3d", why: "preferred; Jolt fallback", fallback: "jolt" };
    if (prefer === "jolt") return { pick: "jolt", why: "preferred; box3d fallback", fallback: "box3d" };
    return { pick: "box3d", why: "auto: lighter engine first", fallback: "jolt" };
}

export { selectBackend, planBackend, CAPS };
if (typeof module !== "undefined" && module.exports) module.exports = { selectBackend, planBackend, CAPS };
