// WebGLEngine/physics/upAxis-selfcheck.mjs — v2557
//
// Run: node physics/upAxis-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// "is everything a 2d plain for it? Do we have anything that will include up?"
//
// YES, AND IT WAS NEVER THE CREATURE'S FAULT. planarFallbackWorld.js:12:
//
//     setVelocity(i, v) { if (bs[i]) bs[i].vel = [v[0], 0, v[2]]; }
//
// v[1] is DISCARDED AT THE DOOR. Push a body straight up at 5 m/s for a full second and it moves 0.0000. The
// paramecium's headings are a circle and its food field is at(x, z) -- but that is downstream. THE CREATURE IS
// FLAT BECAUSE THE WORLD IS FLAT, and no work on the creature changes that.
//
// !! AND v2553's CONFORMANCE CHECKER PASSED THAT WORLD FOR FOUR VERSIONS. It contains a deliberate fake called
// "silently drops z" and CATCHES it -- because a sabotage forced the velocity test to push diagonally. IT STILL
// ONLY EVER PUSHED x AND z. THE SAME HOLE WAS OPEN FOR UP THE WHOLE TIME, in the very file whose comment says
// "an axis you never test is an axis a backend is free to ignore".
//
// So dimensionality is now the ELEVENTH call in the contract, and the checker MAKES A WORLD PROVE ITS CLAIM by
// pushing it up and measuring. A claim is not a check.
import { conform, CONTRACT } from "./backendConformance.mjs";
import { planarFallbackWorld } from "./planarFallbackWorld.js";
import { freeSpaceWorld } from "./freeSpaceWorld.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. THE FINDING: the flat world eats the up axis, and now says so ----------------------------------------
{
    const w = planarFallbackWorld();
    const i = w.addShip({ x: 0, z: 0, half: 0.5 });
    w.setVelocity(i, [0, 5, 0]);
    for (let s = 0; s < 60; s++) w.step(1 / 60);
    ok("planarFallbackWorld EATS the up axis (pushed at 5 m/s for 1s, moved 0)",
       Math.abs(w.readTransforms()[1]) < 1e-9,
       "y = " + w.readTransforms()[1].toFixed(4) + " -- setVelocity discards v[1] on the way in. THIS IS WHY THE PARAMECIUM IS FLAT.");
    ok("...and it now DECLARES that instead of surprising a creature with it", w.dimensionality() === "planar",
       '"' + w.dimensionality() + '"');
}

// ---- 2. a world that actually has up ------------------------------------------------------------------------
{
    const w = freeSpaceWorld();
    const i = w.addShip({ x: 0, y: 0, z: 0, half: 0.5 });
    w.setVelocity(i, [0, 5, 0]);
    for (let s = 0; s < 60; s++) w.step(1 / 60);
    ok("freeSpaceWorld RISES when pushed up", Math.abs(w.readTransforms()[1] - 5) < 0.3,
       "y = " + w.readTransforms()[1].toFixed(3) + " after 1s at 5 m/s");
    ok("...and it conforms to the whole contract", conform(freeSpaceWorld(), "freeSpaceWorld").ok,
       "it is a STAND-IN like the planar one -- free space, no collisions, no gravity -- and it says so. What it is FOR is letting a creature have three dimensions of choice so 'does the brain need up?' can be MEASURED.");
    ok("dimensionality is in the contract now", CONTRACT.includes("dimensionality"), CONTRACT.length + " calls");
}

// ---- 3. A CLAIM IS NOT A CHECK ------------------------------------------------------------------------------
// The whole point. A planar world that CLAIMS "spatial" is worse than one that honestly offers two axes: a
// creature would be handed three dimensions of choice and silently allowed only two.
{
    const liar = planarFallbackWorld();
    liar.dimensionality = () => "spatial";
    const r = conform(liar, "a planar world claiming to be spatial");
    ok("CAUGHT: a planar world that CLAIMS to be spatial", !r.ok,
       r.ok ? "*** IT PASSED. The checker takes the world's word for it. ***"
            : "-> " + r.checks.filter((c) => !c.ok)[0].detail);
    const honest = conform(planarFallbackWorld(), "planarFallbackWorld");
    ok("...while the honest planar world still conforms", honest.ok,
       "offering two axes is FINE. Offering two while claiming three is a substitution.");
}

console.log(fails ? "\nupAxis-selfcheck: " + fails + " FAILED" : "\nupAxis-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
