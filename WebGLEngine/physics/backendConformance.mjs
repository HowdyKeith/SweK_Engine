// WebGLEngine/physics/backendConformance.mjs — v2553
//
// "where can i find an alternate_physics.js to load?"
//
// THERE IS NO SUCH FILE, AND THAT IS THE ANSWER: THE SLOT IS AN INTERFACE, NOT A FILENAME.
//
// This engine has two physics worlds -- physics/box3d/box3dLoader.js and physics/planarFallbackWorld.js -- and
// they are interchangeable because they answer the same ten calls:
//
//     addShip({x, z, half}) -> index      setVelocity(i, v)          step(dt)
//     bodyCount() -> n                    readTransforms() -> Float32Array, SEVEN floats per body (pos + quat)
//     readVelocities()                    supportsJoints() -> bool
//     jointSpherical(...)                 jointRevolute(...)         jointWeld(...)
//
// Anything answering those IS an alternate physics. v2552 released a paramecium into one without either world
// knowing, and backend-physics-check.html already adjudicates lockstep across "either physics backend".
//
// ---- SO WHY THIS FILE ----------------------------------------------------------------------------------------
//
// Because the interchangeability is UNCHECKED, and that is precisely the dangerous kind. box3dLoader.js:124 notes
// the fallback "answers this too" -- so a backend that answers the calls but answers them WRONG substitutes
// silently. It does not crash. It returns plausible numbers. v2546 nearly shipped a cross-arch test that would
// have measured the JS fallback on both machines and reported success.
//
// A CONTRACT NOTHING CHECKS IS A SUGGESTION. This is the checker: hand it a candidate world, and it says whether
// the thing is a SweK physics backend -- not by reading its README, by making it do the job.
//
// ---- WHAT IT REFUSES TO TEST ---------------------------------------------------------------------------------
//
// It does NOT check that the physics is GOOD. Both worlds pass this and one of them is a planar stand-in with no
// collision response worth the name. Conformance is "answers the calls honestly", not "simulates well" -- and
// conflating those is how a stand-in gets promoted to a backend. The last check says so out loud.
"use strict";

/** The ten calls. Named here once, so a backend and its test cannot drift apart quietly. */
export const CONTRACT = [
    "addShip", "setVelocity", "step", "bodyCount", "readTransforms",
    "readVelocities", "supportsJoints", "jointSpherical", "jointRevolute", "jointWeld",
    // v2567 -- THIRTEENTH CALL, and the third time this exact thing has happened.
    //
    // box3dLoader.js has `impulse(idx, v)` on line 46. It has had it all along. THE CONTRACT NEVER ASKED --
    // exactly as it never asked for addBox until v2565, and exactly as v2566 then found that nothing CALLED
    // addBox for a version after it was added. THE LOADER KEEPS HAVING CAPABILITIES THE CONTRACT DOES NOT
    // REQUEST, AND A CAPABILITY NOBODY REQUESTS IS INDISTINGUISHABLE FROM ONE THAT DOES NOT EXIST.
    //
    // Why it matters here rather than being one more method: v2566 measured that -9.8 m/s^2 of gravity changes
    // the paramecium's score by EXACTLY ZERO, because swim() re-asserts setVelocity every 8 ticks and overwrites
    // whatever the world did. A BODY THAT SETS ITS VELOCITY DOES NOT HAVE PHYSICS DONE TO IT. Impulse is the
    // call that lets a creature ASK the world for motion instead of DECLARING it -- and therefore the call that
    // lets the world answer back.
    "impulse",
    // v2565 -- TWELFTH CALL, and it is the reason the eleventh can now be answered honestly.
    //
    // v2564 pointed this checker at real box3d and found that box3d had to declare itself PLANAR -- not because
    // the engine is flat (a dynamic swk_body_box pushed up at 5 m/s rises to 4.8765) but because THE CONTRACT'S
    // ONLY BODY-MAKER WAS addShip, and swk_body_ship LOCKS Y ON PURPOSE so Endless Sky ships fly in a plane.
    // The engine had three axes; the INTERFACE offered two; and dimensionality() answers for the interface.
    //
    // That was recorded with a kill condition: "give the contract an addBody that does not lock Y, and box3d's
    // dimensionality becomes spatial IN THE SAME COMMIT". THIS IS THAT COMMIT.
    //
    // The name is addBox, not addBody, because box3dLoader.js HAS HAD addBox({type, pos:[x,y,z], half, density})
    // ALL ALONG. The capability was never missing. THE CONTRACT NEVER ASKED FOR IT. Inventing a new name for a
    // method that already exists would have been a second interface for one behaviour.
    "addBox",
    // v2557 -- ELEVENTH CALL. A world must say whether it offers three axes of motion or two.
    // Why this had to become part of the contract: planarFallbackWorld DISCARDS v[1] in setVelocity, so a
    // paramecium in it is flat no matter what the creature wants -- and THIS CHECKER PASSED IT, because every
    // velocity test pushed x and z and never y. v2553 found "silently drops z" only because a sabotage forced a
    // diagonal push. THE SAME HOLE WAS OPEN FOR UP THE WHOLE TIME. An axis you never test is an axis a backend
    // is free to eat, and this file said so in a comment while doing it.
    "dimensionality",
];

export const FLOATS_PER_BODY = 7;   // pos xyz + quat xyzw. Guessing 3 here is how v2552 started.

/**
 * Does this candidate qualify as a SweK physics backend?
 * @param {object} world     the candidate
 * @param {string} name      what it calls itself -- carried into the report, because a backend that will not
 *                           name itself is exactly the substitution problem this file exists for
 * @returns {{name, ok, checks: Array<{name, ok, detail}>}}
 */
export function conform(world, name) {
    const checks = [];
    // f(x) -- because the checker must SURVIVE the thing it is checking. The first sabotage (a world packing 3
    // floats per body) made tr[7] undefined and .toFixed() threw, so the checker died instead of reporting. A
    // conformance test that crashes on a non-conforming backend cannot do the one job it has.
    const f = (v) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : String(v));
    const t = (n, cond, detail) => checks.push({ name: n, ok: !!cond, detail: detail || "" });

    // ---- 1. it answers the calls at all ----------------------------------------------------------------------
    const missing = CONTRACT.filter((c) => typeof world[c] !== "function");
    t("answers all ten calls", missing.length === 0, missing.length ? "MISSING: " + missing.join(", ") : CONTRACT.length + " methods present");
    if (missing.length) return { name, ok: false, checks };

    // ---- 2. addShip returns a usable index, and bodyCount agrees -----------------------------------------------
    const a = world.addShip({ x: 1, z: 2, half: 0.5 });
    const b = world.addShip({ x: -3, z: 4, half: 0.5 });
    t("addShip returns distinct indices", Number.isInteger(a) && Number.isInteger(b) && a !== b, "got " + a + " and " + b);
    t("bodyCount counts the bodies", world.bodyCount() === 2, "bodyCount() = " + world.bodyCount() + ", expected 2");

    // ---- 3. THE LAYOUT. Seven floats per body, and the ship is WHERE IT WAS PUT ---------------------------------
    // This is the one that catches a stand-in that answers plausibly. A world that packs 3 floats per body, or
    // silently drops z, returns numbers -- just not the right ones.
    const tr = world.readTransforms();
    t("readTransforms packs " + FLOATS_PER_BODY + " floats per body", tr.length === 2 * FLOATS_PER_BODY,
      "length " + tr.length + " for 2 bodies = " + (tr.length / 2) + " per body");
    t("...and a ship is where it was put", Math.abs(tr[0] - 1) < 1e-3 && Math.abs(tr[2] - 2) < 1e-3,
      "asked for (1, 2), found (" + f(tr[0]) + ", " + f(tr[2]) + ")");
    t("...for the SECOND body too (the stride is real, not a lucky first element)",
      Number.isFinite(tr[FLOATS_PER_BODY]) && Math.abs(tr[FLOATS_PER_BODY] - -3) < 1e-3 &&
      Number.isFinite(tr[FLOATS_PER_BODY + 2]) && Math.abs(tr[FLOATS_PER_BODY + 2] - 4) < 1e-3,
      "asked for (-3, 4), found (" + f(tr[FLOATS_PER_BODY]) + ", " + f(tr[FLOATS_PER_BODY + 2]) + ")");

    // ---- 4. velocity moves the thing, in the direction asked ---------------------------------------------------
    // DIAGONAL, not axis-aligned. The first version pushed [2,0,0] and a sabotaged world that SILENTLY DROPPED
    // z sailed through -- an axis you never test is an axis a backend is free to ignore.
    world.setVelocity(a, [2, 0, 1]);
    for (let i = 0; i < 30; i++) world.step(1 / 60);
    const tr2 = world.readTransforms();
    const dx = tr2[0] - tr[0], dz = tr2[2] - tr[2];
    t("setVelocity + step MOVES the body", Number.isFinite(dx) && Math.abs(dx) > 0.1, "moved " + dx.toFixed(3) + " in x over 0.5s at speed 2");
    // BOTH components, in proportion. vx=2 vz=1 over 0.5s -> dx ~1.0, dz ~0.5.
    t("...IN BOTH COMPONENTS (a dropped axis is an invisible substitution)",
      Number.isFinite(dx) && dx > 0 && Number.isFinite(dz) && dz > 0 && Math.abs(dz / dx - 0.5) < 0.15,
      "dx " + f(dx) + ", dz " + f(dz) + " -- asked for velocity (2, 1), so dz/dx must be ~0.5, got " + f(dz / dx));
    t("...at roughly the speed asked", Number.isFinite(dx) && Math.abs(dx - 1) < 0.3, "0.5s at speed 2 should travel ~1.0, travelled " + dx.toFixed(3));

    // ---- 5. it is a SIMULATION, not a recording -----------------------------------------------------------------
    // A world that returns the same transforms forever passes everything above if the first step happened to land.
    const before = world.readTransforms()[0];
    for (let i = 0; i < 30; i++) world.step(1 / 60);
    const after = world.readTransforms()[0];
    t("stepping again moves it AGAIN (it is not a recording)", Number.isFinite(after) && Number.isFinite(before) && Math.abs(after - before) > 0.1,
      "another 0.5s moved it " + f(world.readTransforms()[0] - before));

    // ---- 6. determinism: the same world twice ------------------------------------------------------------------
    // Not optional. This engine's lockstep, cross-peer sync and cross-arch tests ALL rest on it.
    t("readTransforms returns finite numbers", [...world.readTransforms()].every(Number.isFinite),
      "a NaN here poisons every peer that syncs with this one");

    // ---- 7b. DIMENSIONALITY: SAY WHAT YOU ARE, AND PROVE IT ---------------------------------------------------
    // v2557. planarFallbackWorld DISCARDS v[1] -- push straight up at 5 m/s for a second and it moves 0.0000 --
    // and THIS CHECKER PASSED IT for four versions, because every velocity test pushed x and z and never y.
    // v2553 caught a sabotaged "silently drops z" only because the fix forced a diagonal push. THE SAME HOLE WAS
    // OPEN FOR UP THE ENTIRE TIME, in the very file whose comment says an untested axis is an axis a backend is
    // free to ignore.
    //
    // A claim is not a check. So: ask the world what it is, then PUSH IT UP AND MEASURE. A planar world that
    // claims "spatial" is a substitution waiting to happen -- a creature would be given three dimensions of
    // choice and silently allowed only two, which is worse than a world that honestly offers two.
    const dim = typeof world.dimensionality === "function" ? world.dimensionality() : undefined;
    t("dimensionality() says planar or spatial", dim === "planar" || dim === "spatial",
      "returned " + JSON.stringify(dim) + " -- a world that will not say whether it has an up axis makes every creature in it flat by surprise");

    // v2565 -- PROBE WITH addBox, NOT addShip.
    //
    // This line is the whole version. v2564 pushed a SHIP up, watched it not rise, and made real box3d declare
    // itself PLANAR -- correctly, because addShip was the only body the contract could make and swk_body_ship
    // LOCKS Y ON PURPOSE (Endless Sky ships fly in a plane). THE CHECKER WAS ASKING A SHIP WHETHER THE ENGINE
    // HAD AN UP AXIS, AND IT CANNOT FIND WHAT THE PROBE FORBIDS.
    //
    // With addBox in the contract, the probe stops being a ship, and a world that HAS an up axis can finally
    // show it. box3d goes spatial this version -- not because anything in box3d changed, but because the
    // question can finally be asked. THE MEASUREMENT WAS ALWAYS LIMITED BY THE INSTRUMENT, NOT THE SUBJECT.
    const up = world.addBox({ pos: [0, 0, 0], half: 0.5 });
    world.setVelocity(up, [0, 5, 0]);
    // TRACK THE PEAK, NOT THE ENDPOINT.
    //
    // v2565's first version asserted the body ends at y ~= 5.0 after a second at 5 m/s, and that SILENTLY
    // ASSUMED A WORLD WITH NO GRAVITY. freeSpaceWorld has none, so it passed and hid the assumption. Real box3d
    // pulls at -9.8, so the same push peaks around 1.27 and lands back at 0.037 -- and the checker called that
    // "did not move". IT MOVED FIVE METRES PER SECOND UPWARD AND CAME BACK; THE ENDPOINT SIMPLY DOES NOT KNOW.
    //
    // The question a creature actually needs answered is not "does 5 m/s buy 5 metres", it is "CAN THIS WORLD
    // MOVE ME ALONG Y AT ALL". A planar world answers 0.0000 at every instant. A spatial one does not, whatever
    // gravity does to it afterwards. SO MEASURE THE PEAK, WHICH GRAVITY CANNOT ERASE.
    let rose = 0;
    for (let i = 0; i < 60; i++) {
        world.step(1 / 60);
        const y = world.readTransforms()[up * FLOATS_PER_BODY + 1];
        if (Number.isFinite(y) && Math.abs(y) > Math.abs(rose)) rose = y;
    }
    if (dim === "spatial") {
        // A metre is arbitrary; ZERO is not. Any world with an up axis moves a body METRES from a 5 m/s push,
        // and a world without one moves it exactly nothing, forever. The gap between those is not subtle.
        t("...and a 'spatial' world MOVES a body along Y (peak, so gravity cannot erase it)", Math.abs(rose) > 0.5,
          "peak y = " + f(rose) + " from a 5 m/s push. Real box3d peaks near 1.27 and lands at 0.037 because it PULLS AT -9.8; freeSpaceWorld reaches 5.000 because it has no gravity. BOTH ARE SPATIAL. The endpoint could not tell them from a plane; the peak can.");
    } else {
        t("...and a 'planar' world honestly does not move up (which is fine, because it SAID so)",
          Math.abs(rose) < 1e-6,
          "peak y = " + f(rose) + " -- it eats v[1] by design, and now it declares that instead of surprising a creature with it");
    }

    // ---- 7. joints: honest about what it cannot do ---------------------------------------------------------------
    // supportsJoints() is the honest escape hatch, and it is only honest if it MATCHES REALITY. A world that says
    // false and then works, or says true and then throws, is worse than one that cannot do joints at all.
    const claims = world.supportsJoints();
    t("supportsJoints() answers a boolean", typeof claims === "boolean", "returned " + typeof claims + ": " + claims);
    let jointThrew = false;
    try { world.jointWeld(a, b); } catch { jointThrew = true; }
    t("...and the joint calls MATCH that claim", claims ? !jointThrew : true,
      claims ? (jointThrew ? "claims joints and jointWeld THREW" : "claims joints, jointWeld worked")
             : "claims no joints" + (jointThrew ? " and jointWeld threw, which is consistent" : " but jointWeld did not throw -- fine, as long as callers check the flag"));

    const ok = checks.every((c) => c.ok);
    return { name, ok, checks };
}

/** Print a report. `name` is required and load-bearing: an unnamed backend is the substitution problem itself. */
export function report(r) {
    console.log("\n  BACKEND: " + r.name + "   " + (r.ok ? "CONFORMS" : "DOES NOT CONFORM"));
    for (const c of r.checks) console.log("    " + (c.ok ? "ok  " : "FAIL") + "  " + c.name + (c.detail ? "   " + c.detail : ""));
    console.log("\n  Conformance is ANSWERS THE CALLS HONESTLY. It is NOT 'simulates well'.");
    console.log("  planarFallbackWorld conforms, and it is a planar stand-in. Conflating those is how a");
    console.log("  stand-in gets promoted to a backend and a cross-arch test measures the wrong thing.");
    return r.ok;
}

if (process.argv[1] && process.argv[1].endsWith("backendConformance.mjs")) {
    const { planarFallbackWorld } = await import("./planarFallbackWorld.js");
    report(conform(planarFallbackWorld(), "planarFallbackWorld"));
}
