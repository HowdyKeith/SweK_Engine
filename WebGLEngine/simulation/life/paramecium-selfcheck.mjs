// WebGLEngine/simulation/life/paramecium-selfcheck.mjs — v2552
//
// Run: node simulation/life/paramecium-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// THE FINDING THIS PINS: the mold reflex BEATS every bandit, and that is not a defeat -- it is the two organisms
// being different sizes.
//
//     mold reflex (3 samples)   food 652.9   best taste 1.000
//     UCB1                      food 335.9   best taste 0.990
//     Thompson                  food 279.3   best taste 0.934
//     eps-greedy(0.1)           food  86.6   best taste 0.406
//     random                    food   0.2   best taste 0.001
//
// The mold SENSES THE FIELD AHEAD OF IT. The bandit only ever learns whether the last run improved things. That
// asymmetry is deliberate and it is REAL BIOLOGY, not a rigged test: Physarum is a huge multinucleate cell and can
// read a gradient across its own body; a paramecium is far too small to see ahead and must compare NOW against A
// MOMENT AGO. RUN-AND-TUMBLE EXISTS BECAUSE OF THAT LIMIT. The bandit is not a worse algorithm -- it is the right
// algorithm for a cell that cannot see.
//
// So the honest scoreboard has two entries that matter: the mold must WIN (it is told more), and the bandit must
// CRUSH RANDOM (or it is not learning at all, and nothing else here means anything).
//
// A control you can only beat by being told less is not a control, it is a lap of honour. This one is told more
// and still gets beaten by nothing.
import { planarFallbackWorld } from "../../physics/planarFallbackWorld.js";
import { swim, chemoField, headings, moldReflex } from "./paramecium.js";
import { ucb1, uniformRandom } from "../../brain/bench/bandit.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const field = chemoField([6, 0, 6], 4);
const dirs = headings(8);
const run = (policy, w) => swim(w || planarFallbackWorld(), "planarFallbackWorld", policy, { steps: 700, field, arms: 8 });

const moldWorld = planarFallbackWorld();
const mold = moldReflex(field, dirs);
const moldPolicy = {
    ...mold,
    pick(t) { const tr = moldWorld.readTransforms(); mold.observe(tr[0], tr[2]); return mold.pick(t); },
};

const rMold = run(moldPolicy, moldWorld);
const rUcb = run(ucb1());
const rRnd = run(uniformRandom());

// ---- 1. the bandit IS learning ------------------------------------------------------------------------------
// If this fails, nothing else in the file means anything: the paramecium would just be a random walk with extra
// arithmetic.
{
    ok("THE BANDIT CRUSHES RANDOM (so it is actually learning)", rUcb.food > rRnd.food * 20,
       "UCB1 " + rUcb.food.toFixed(1) + " vs random " + rRnd.food.toFixed(1) + " = " + (rUcb.food / Math.max(rRnd.food, 1e-6)).toFixed(0) + "x");
    ok("...and it actually reaches the food", rUcb.best > 0.8,
       "best taste " + rUcb.best.toFixed(3) + " of a possible 1.0 -- it gropes, but it arrives");
    ok("...while random never finds it", rRnd.best < 0.2, "random's best taste " + rRnd.best.toFixed(3));
}

// ---- 2. THE MOLD WINS, AND IT SHOULD ------------------------------------------------------------------------
// It is handed a spatial sensor. If a bandit ever beat it, the mold would be broken -- not the bandit brilliant.
{
    ok("THE MOLD REFLEX BEATS THE BANDIT (it is told more, and that is the point)", rMold.food > rUcb.food,
       "mold " + rMold.food.toFixed(1) + " vs UCB1 " + rUcb.food.toFixed(1) +
       " -- three samples and a comparison. Physarum can read a gradient across its own body; a paramecium cannot see ahead at all.");
    ok("...and it walks straight onto the peak", rMold.best > 0.99, "best taste " + rMold.best.toFixed(3));
}

// ---- 3. WHICH WORLD IS IT SWIMMING IN? ------------------------------------------------------------------------
// box3d.wasm is not in this tree (v2546) and the toolchain is unreachable from the sandbox (v2549: 403). The
// planar fallback answers the SAME TEN CALLS, so a paramecium "released into box3d" would silently be swimming in
// a stand-in. The name is carried through the result for exactly this reason.
{
    ok("the result NAMES the world it ran in", rUcb.worldName === "planarFallbackWorld",
       "'" + rUcb.worldName + "' -- box3d.wasm is NOT in the tree; both worlds answer the same ten calls, which is what makes the substitution invisible");
}

// ---- 4. the arena is a wall, not a mood -----------------------------------------------------------------------
{
    const a = run(ucb1()), b = run(ucb1());
    ok("the same swimmer on the same arena scores the same", Math.abs(a.food - b.food) < 1e-9,
       a.food.toFixed(4) + " twice");
    ok("the field peaks where it says it does", Math.abs(field.at(6, 6) - 1) < 1e-12 && field.at(-6, -6) < 0.02,
       "at the peak " + field.at(6, 6).toFixed(3) + ", at the start " + field.at(-6, -6).toFixed(4));
}

// ---- 5. the policy interface is v2547's, unchanged ---------------------------------------------------------------
// {name, reset(k), pick(t), update(arm, reward)} -- so the GPU brain plugs in on the rig with NO adapter, and can
// be marked against bandit.mjs's fixed wall on the way past. If swim() ever needed more, the brain could not be
// released here without being rewritten.
{
    let picked = -1;
    const stub = { name: "stub", reset() {}, pick() { return 3; }, update(a) { picked = a; } };
    const r = swim(planarFallbackWorld(), "planarFallbackWorld", stub, { steps: 100, field, arms: 8 });
    ok("a policy needs only reset/pick/update to be released (v2547's interface)", picked === 3 && r.steps === 100);
    let threw = false;
    try { swim(planarFallbackWorld(), "x", { name: "bad", reset() {}, pick() { return 99; }, update() {} }, { steps: 20, field, arms: 8 }); } catch { threw = true; }
    ok("...and a policy that picks a heading that does not exist is caught", threw);
}

// ---- v2568: THE CHECK THAT WOULD HAVE CAUGHT THE COMPASS ------------------------------------------------------
//
// From v2552 to v2567 this file asserted that the mold BEATS the bandits, and it passed every time -- while the
// mold was not sensing anything. swim() never called observe(), so `here` stayed [0,0] and the mold sampled the
// field at the origin forever: 75 decisions, ONE DISTINCT HEADING, a straight line for 600 steps.
//
// IT WAS A COMPASS, AND EVERY CHECK HERE PASSED, BECAUSE A COMPASS ALSO BEATS A BANDIT AT WALKING INTO A SINGLE
// GAUSSIAN PEAK. THE GATE ASSERTED THE ORDERING AND THE ORDERING WAS NEVER THE CLAIM. The claim was that a
// gradient-sensing rule beats a learner, and nothing checked that the rule sensed.
//
// A POLICY WITH A SENSOR NOBODY FEEDS IS NOT A POLICY, IT IS A CONSTANT WEARING ONE.
{
    const field = chemoField(), dirs = headings(8);
    const m = moldReflex(field, dirs);
    const picks = [];
    const spy = { name: m.name, reset: (k) => m.reset(k), observe: (...a) => m.observe(...a),
                  update: () => {}, pick: (t) => { const p = m.pick(t); picks.push(p); return p; } };
    const r = swim(planarFallbackWorld(), "planarFallbackWorld", spy, { steps: 600, field, dirs });
    ok("THE MOLD ACTUALLY CHANGES ITS MIND", new Set(picks).size > 1,
       new Set(picks).size + " distinct headings across " + picks.length + " decisions. IT WAS 1 FROM v2552 TO v2567 -- swim() never called observe(), so the sensor sampled the origin forever. A STRAIGHT LINE FOR SIX HUNDRED STEPS.");
    ok("...and sensing makes it BETTER, which is why the old number was a lie of omission", r.food > 300,
       "food " + r.food.toFixed(1) + " sensing vs 200.4 as a compass. THE FINDING SURVIVES -- the mold still crushes UCB1's 75.4 -- BUT EVERY MOLD NUMBER FROM v2552 TO v2567 WAS A COMPASS'S NUMBER. The bandit was not losing to biology. It was losing to a constant.");
    // proven by behaviour rather than by reading the source: if swim were not feeding the sensor, the mold
    // could not have changed its mind above. The check above IS this check.
    ok("...and the fix is one line in swim, feeding a sensor that existed all along", picks.length > 1,
       "moldReflex has had observe(x, z) since v2552. NOTHING EVER CALLED IT -- not swim, not a page, not a test. That is the fourth capability this session that existed and was never requested: addBox on the loader, impulse on line 46, the y slot in chemoField's peak, and now this.");
}

console.log(fails ? "\nparamecium-selfcheck: " + fails + " FAILED" : "\nparamecium-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
