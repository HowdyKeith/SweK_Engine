// physics/impact-selfcheck.mjs
//
// Run: node physics/impact-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// An asteroid impact, stage by stage, with only the real physics checked and no fireball anywhere. Gravity focuses the
// approach so a planet catches asteroids from a disc wider than itself, and focuses slow ones more than fast ones; by
// energy conservation nothing arrives slower than the escape speed; crossing the atmosphere a small body sheds most of
// its speed while a large one barely notices, which is why small meteors burn up and large ones reach the ground; the
// energy delivered is one-half m v-squared; and the crater grows as roughly the cube root of that energy. The sabotage
// switches off gravitational focusing -- reduces the capture radius to the planet's own width -- and the focusing check
// fails, because a planet really does reach out past its edge to pull impactors in.
import { escapeSpeed, impactSpeed, criticalImpactParameter, makeApproach, stepApproach, atmosphericEntry, sphereMass, impactEnergy, craterDiameter } from "./impact.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const GM = 1, R = 1;
const traj = (b) => { const p = makeApproach(-40, b, 1, 0); for (let i = 0; i < 20000 && !p.hit && !p.missed; i++) stepApproach(p, 0.01, GM, R); return p.hit; };

// ---- 1. GRAVITATIONAL FOCUSING: a planet catches more than its width, and focuses slow bodies more --
{
    const bcFast = criticalImpactParameter(GM, R, 1.0), bcSlow = criticalImpactParameter(GM, R, 0.5);
    const focuses = bcFast > R && bcSlow > bcFast;
    const trajOk = traj(bcFast * 0.9) === true && traj(bcFast * 1.1) === false;
    ok("!! gravity focuses the approach -- the planet catches asteroids from a disc wider than itself", focuses && trajOk,
       "the capture radius is " + bcFast.toFixed(2) + " planet-radii at speed 1 and " + bcSlow.toFixed(2) + " at half that -- slower asteroids are pulled in from further out -- and an integrated trajectory just inside the capture radius hits while one just outside sails past.");
}

// ---- 2. NOTHING ARRIVES SLOWER THAN ESCAPE SPEED ----------------------------------------------------
{
    const vFromRest = impactSpeed(GM, R, 0), vEsc = escapeSpeed(GM, R);
    ok("!! by energy conservation nothing lands slower than the escape speed", Math.abs(vFromRest - vEsc) < 1e-9 && impactSpeed(GM, R, 1) > vEsc,
       "an asteroid falling from rest still arrives at the escape speed (" + vEsc.toFixed(3) + "), and any real approach speed only adds to that -- gravity guarantees a floor on the impact velocity.");
}

// ---- 3. THE ATMOSPHERE IS SELECTIVE: small bodies burn, large ones punch through --------------------
{
    const small = atmosphericEntry(20000, 0.5, 3000, {});   // half-metre pebble at 20 km/s
    const big = atmosphericEntry(20000, 500, 3000, {});     // half-kilometre asteroid at 20 km/s
    ok("!! the thin atmosphere sheds most of a small body's speed and almost none of a large one's", small < 0.3 * 20000 && big > 0.9 * 20000,
       "the half-metre body leaves the atmosphere at " + small.toFixed(0) + " m/s and the half-kilometre one at " + big.toFixed(0) + " -- because the drag deceleration goes as one over the radius, which is exactly why small meteors burn up and large ones reach the ground.");
}

// ---- 4. IMPACT ENERGY IS ONE-HALF m v-SQUARED, and it is a real number ------------------------------
{
    const v = atmosphericEntry(20000, 500, 3000, {}); const m = sphereMass(500, 3000); const E = impactEnergy(m, v);
    ok("!! the delivered energy is one-half m v-squared -- a real, catastrophic number", E > 1e20 && E < 1e21 && Math.abs(E - 0.5 * m * v * v) < 1,
       "a 500-metre rock arrives with " + E.toExponential(2) + " joules, about " + (E / 4.184e15).toFixed(0) + " megatons of TNT -- the energy scales with mass and with the square of the speed, no theatre required to state it.");
}

// ---- 5. CRATER SIZE SCALES AS ~ THE CUBE ROOT OF ENERGY ---------------------------------------------
{
    const ratio = craterDiameter(1000) / craterDiameter(1);
    ok("!! the crater grows as roughly the cube root of the energy", ratio > 5 && ratio < 12,
       "a thousand times the energy makes a crater only " + ratio.toFixed(1) + " times wider -- the empirical gravity-regime scaling law, sublinear, so even enormous impacts leave craters far smaller than the energy ratio would suggest.");
}

// ---- 6. DETERMINISTIC -------------------------------------------------------------------------------
{
    const once = () => { const p = makeApproach(-40, 1.5, 1, 0); for (let i = 0; i < 5000 && !p.hit && !p.missed; i++) stepApproach(p, 0.01, GM, R); return p.rMin; };
    ok("!! deterministic (the vacuum approach, the fingerprinted part)", once() === once(),
       "the same approach traces the same path every run -- gravity here is add/subtract/multiply/divide and square root only, so it is bit-identical across machines and carries the fingerprint.");
}

console.log(fails ? "\nimpact-selfcheck: " + fails + " FAILED" : "\nimpact-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
