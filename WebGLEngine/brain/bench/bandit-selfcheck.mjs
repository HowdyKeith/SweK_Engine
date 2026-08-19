// WebGLEngine/brain/bench/bandit-selfcheck.mjs — v2547
//
// Run: node brain/bench/bandit-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A growth chart has exactly one rule: THE WALL DOES NOT MOVE. If INSTANCES changes, every mark ever made
// against it becomes meaningless -- which is precisely what is wrong with marking the brain against its own hit
// rate in a game that keeps changing. So the wall is pinned here, by value, and editing it fails the build.
//
// Everything else in this file exists because the FIRST version of this benchmark reported Thompson at 0.45x of
// a PROVEN LOWER BOUND and I nearly shipped it with a comment explaining that away.
import { run, ucb1, thompson, epsilonGreedy, uniformRandom, laiRobbinsFloor, klBernoulli, INSTANCES } from "./bandit.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. THE WALL DOES NOT MOVE -----------------------------------------------------------------------------
// Pinned by value. Not "roughly these numbers" -- these numbers. A benchmark you can tune is a benchmark you
// will tune, on the day the result is disappointing.
{
    ok("the easy wall is unchanged", JSON.stringify(INSTANCES.easy) === "[0.9,0.6,0.6,0.6,0.6]", JSON.stringify(INSTANCES.easy));
    ok("the hard wall is unchanged", JSON.stringify(INSTANCES.hard) === "[0.55,0.5,0.5,0.5,0.5]", JSON.stringify(INSTANCES.hard));
    ok("the wide wall is unchanged", JSON.stringify(INSTANCES.wide) === "[0.35,0.3,0.3,0.3,0.3,0.3,0.3,0.3,0.3,0.3]", JSON.stringify(INSTANCES.wide));
}

// ---- 2. the same run twice gives the same mark ---------------------------------------------------------------
// A mark you cannot reproduce is a smudge.
{
    const a = run(ucb1(), INSTANCES.easy, 3000);
    const b = run(ucb1(), INSTANCES.easy, 3000);
    ok("the same policy on the same wall marks the same spot", a.regret === b.regret,
       a.regret.toFixed(6) + " vs " + b.regret.toFixed(6));
    const c = run(ucb1(), INSTANCES.easy, 3000, 999);
    ok("...and a different seed moves it (the seed is not decoration)", c.regret !== a.regret);
}

// ---- 3. the wall can tell good from bad ---------------------------------------------------------------------
// If random scored like UCB1, the wall would be measuring nothing.
{
    const u = run(ucb1(), INSTANCES.easy, 5000);
    const r = run(uniformRandom(), INSTANCES.easy, 5000);
    ok("UCB1 beats uniform random by a mile (the wall discriminates)", r.regret > u.regret * 4,
       "random " + r.regret.toFixed(0) + " vs UCB1 " + u.regret.toFixed(0));
    ok("...and random really does pick uniformly (1/5 of the time on 5 arms)",
       Math.abs(r.bestArmShare - 0.2) < 0.03, "best arm chosen " + (100 * r.bestArmShare).toFixed(1) + "%");
}

// ---- 4. the KL divergence is the KL divergence ---------------------------------------------------------------
// The floor is stated in terms of it, so it is not decoration even though the floor is only a reference.
{
    ok("KL(p||p) = 0", Math.abs(klBernoulli(0.4, 0.4)) < 1e-12);
    ok("KL is not symmetric (it is a divergence, not a distance)",
       Math.abs(klBernoulli(0.4, 0.9) - klBernoulli(0.9, 0.4)) > 0.1,
       "KL(.4||.9)=" + klBernoulli(0.4, 0.9).toFixed(4) + "  KL(.9||.4)=" + klBernoulli(0.9, 0.4).toFixed(4));
    ok("KL >= 0 always", [[0.1, 0.9], [0.5, 0.5001], [0.99, 0.01]].every(([p, q]) => klBernoulli(p, q) >= 0));
    // hand-computed: d(0.6, 0.9) = 0.6*ln(0.6/0.9) + 0.4*ln(0.4/0.1) = -0.2433 + 0.5545 = 0.3112
    ok("KL matches a hand computation", Math.abs(klBernoulli(0.6, 0.9) - 0.3112) < 1e-3,
       klBernoulli(0.6, 0.9).toFixed(6) + " vs 0.3112 by hand");
}

// ---- 5. THE HONEST ONE: the bound does NOT bite, and this file says so -------------------------------------
// The first draft of the benchmark presented `ratio` as a score and Thompson scored 0.45x -- BELOW A PROVEN
// LOWER BOUND. A lower bound everything beats is not a lower bound, and the honest move was to measure whether
// the ratio climbs with T (it does not) rather than to explain it away in a comment (which I nearly did).
{
    const r1 = run(thompson(), INSTANCES.easy, 1000);
    const r2 = run(thompson(), INSTANCES.easy, 20000);
    ok("Thompson is BELOW the Lai-Robbins bound at practical T (the bound does not bite)",
       r1.ratio < 1 && r2.ratio < 1,
       "T=1000 -> " + r1.ratio.toFixed(2) + "x,  T=20000 -> " + r2.ratio.toFixed(2) + "x");
    ok("...and it does NOT climb toward 1 with T (so 'the run was too short' is false)",
       Math.abs(r2.ratio - r1.ratio) < 0.3,
       "flat at ~" + ((r1.ratio + r2.ratio) / 2).toFixed(2) + "x -- THIS IS WHY `ratio` IS A REFERENCE, NOT A SCORE");
    // If either of those ever flips, the bound started biting and `ratio` could be promoted to a score. That
    // would be a real discovery about the benchmark, and it should fail loudly rather than pass quietly.
}

// ---- 6. the floor is still arithmetic, whatever we call it ---------------------------------------------------
{
    const f = laiRobbinsFloor([0.9, 0.6, 0.6, 0.6, 0.6], 20000);
    // 4 arms * (0.3 * ln(20000) / 0.3112) = 4 * 0.3 * 9.9035 / 0.3112 = 38.2
    ok("the floor matches a hand computation", Math.abs(f - 38.2) < 1.0, f.toFixed(2) + " vs 38.2 by hand");
    ok("a wall with no suboptimal arms has a floor of zero", laiRobbinsFloor([0.5, 0.5, 0.5], 10000) === 0,
       "nothing to regret");
    ok("a longer horizon raises the floor (it is log T)", laiRobbinsFloor([0.9, 0.6], 100000) > laiRobbinsFloor([0.9, 0.6], 1000));
}

// ---- 7. the policy interface is the brain's shape ------------------------------------------------------------
// { name, reset(k), pick(t), update(arm, reward) } -- deliberately what brain.js already does: choose an option,
// find out if it hit. If run() ever demanded more, the brain could not be marked without being rewritten.
{
    let picked = -1;
    const stub = { name: "stub", reset() {}, pick() { return 0; }, update(a) { picked = a; } };
    const r = run(stub, [0.1, 0.9], 50);
    ok("a policy needs only reset/pick/update to be marked", picked === 0 && r.pulls[0] === 50);
    ok("...and regret is EXPECTED regret, not sampled reward", Math.abs(r.regret - 50 * 0.8) < 1e-9,
       r.regret.toFixed(2) + " = 50 pulls x 0.8 gap. Sampled reward would be noisy and would make a lucky run look like skill.");
    let threw = false;
    try { run({ name: "bad", reset() {}, pick() { return 7; }, update() {} }, [0.1, 0.9], 5); } catch { threw = true; }
    ok("a policy that picks a nonexistent arm is caught, not silently ignored", threw);
}

console.log(fails ? "\nbandit-selfcheck: " + fails + " FAILED" : "\nbandit-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
