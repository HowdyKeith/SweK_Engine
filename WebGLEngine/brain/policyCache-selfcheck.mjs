// brain/policyCache-selfcheck.mjs
//
// v3146 -- THE POLICY CACHE IS AN APPROXIMATION, NOT A MEMOISATION, AND NOTHING SAID SO.
//
// brain/policyCache.mjs generalises the proven brain/flowfieldCache.mjs -- which IS live, used by esPilot.mjs --
// from flow fields to policy and tactics decisions. It had no gate and no caller. Fourth capability in four
// rounds found finished and unwired, after SSAOPass, multigridGPU and quadricDecimate.
//
// WHAT MATTERS ABOUT IT is not the hit rate. It quantises continuous state into buckets, so a hit returns the
// answer computed for a NEARBY state, not the one asked about. That makes it lossy by construction, and the
// header does not say so -- it says "near-identical situations hit the same cached action", which is true and
// reads like a free lunch. Anyone wiring this in is trading accuracy for speed and should see the exchange rate
// before agreeing to it, so this gate measures the curve instead of asserting the cache "works".
//
// MEASURED, on a policy whose action flips on sign(sin 3x + cos 3y) over a smooth 600-step trajectory:
//
//     quant   hit rate   disagreement with the uncached answer
//     0.5      92.2%      16.5%
//     0.2      79.8%       5.7%
//     0.1      59.7%       1.5%     <- the module default
//     0.05     32.5%       1.0%
//     0.01      1.7%       0.0%
//
// The bottom row is the point: exactness is available and costs the entire benefit. This is a knob with a real
// exchange rate, not a cache that is simply on or off.

import { makeCachedPolicy, stateKey } from "./policyCache.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const policy = (s) => ({ action: (Math.sin(s[0] * 3) + Math.cos(s[1] * 3)) > 0 ? "L" : "R" });
const traj = []; for (let t = 0; t < 600; t++) traj.push([Math.sin(t * 0.02) * 2, Math.cos(t * 0.017) * 2]);

function measure(q) {
    const c = makeCachedPolicy(policy, { quant: q, max: 4096 });
    let wrong = 0;
    for (const s of traj) if (c.decide(s).action !== policy(s).action) wrong++;
    const st = c.stats();
    return { q, hit: st.hits / (st.hits + st.misses), wrong: wrong / traj.length, st };
}
const curve = [0.5, 0.2, 0.1, 0.05, 0.01].map(measure);

// ---- 1. IT CACHES, AND THE HITS ARE REAL ------------------------------------------------------------------------
{
    let calls = 0;
    const counted = makeCachedPolicy((s) => { calls++; return policy(s); }, { quant: 0.1, max: 512 });
    for (const s of traj) counted.decide(s);
    ok("!! the cache absorbs most calls on a smooth trajectory",
        calls < traj.length * 0.6 && calls > 0,
        `${traj.length} decisions, the policy ran ${calls} times. A cache that never missed would mean the ` +
        "trajectory never left one bucket, and one that never hit would mean the quantisation does nothing -- " +
        "both would make the numbers below meaningless");
}

// ---- 2. IT IS LOSSY, AND BY HOW MUCH ------------------------------------------------------------------------------
{
    const dflt = curve.find((c) => c.q === 0.1);
    ok("!! a hit returns the answer for a NEARBY state -- the cache is an approximation",
        dflt.wrong > 0,
        `at the module default quant=0.1 the cached action differs from the uncached one on ` +
        `${(dflt.wrong * 100).toFixed(1)}% of states. The header says "near-identical situations hit the same ` +
        `cached action", which is true and reads like a free lunch. It is a trade`);

    ok("!! accuracy and hit rate move in opposite directions, monotonically",
        curve.every((c, i) => i === 0 || (c.hit <= curve[i - 1].hit && c.wrong <= curve[i - 1].wrong)),
        curve.map((c) => `q${c.q}: ${(c.hit * 100).toFixed(0)}%hit/${(c.wrong * 100).toFixed(1)}%wrong`).join("  ") +
        ". A knob with an exchange rate, so the right setting depends on how much a wrong action costs in the " +
        "system adopting it -- which is a question this gate cannot answer for anyone");

    const fine = curve[curve.length - 1];
    ok("!! exactness is reachable and costs the whole benefit",
        fine.wrong === 0 && fine.hit < 0.1,
        `quant=${fine.q} gives ${(fine.wrong * 100).toFixed(1)}% disagreement and only ` +
        `${(fine.hit * 100).toFixed(1)}% hits. Anyone who wants a transparent memoisation can have one, and it ` +
        "will not speed anything up. That is the honest framing of what this module is for");
}

// ---- 3. THE QUANTISER DOES WHAT IT CLAIMS ---------------------------------------------------------------------------
{
    ok("near states share a bucket; distant ones do not",
        stateKey([1.00, 2.00], 0.1) === stateKey([1.04, 1.96], 0.1) &&
        stateKey([1.00, 2.00], 0.1) !== stateKey([1.40, 2.00], 0.1),
        "0.04 apart collides at quant 0.1, 0.4 apart does not -- so bucketing is by distance rather than by " +
        "exact equality, which is the entire mechanism");

    ok("object state is ordered deterministically",
        stateKey({ b: 2, a: 1 }, 0.1) === stateKey({ a: 1, b: 2 }, 0.1),
        "keys are sorted before quantising, so two objects with the same contents cannot land in different " +
        "buckets according to insertion order -- a cache that missed on key order would look like a cache that " +
        "does not work");
}

// ---- 4. IT IS STILL UNWIRED, AND THAT IS RECORDED --------------------------------------------------------------------
{
    ok("this gate does not wire the cache into anything",
        true,
        "brain/flowfieldCache.mjs -- the pattern this generalises -- is live in esPilot.mjs, so the adoption path " +
        "is short. It is not taken here because the right quant depends on what a wrong action costs in the " +
        "consuming system, and choosing that number from taste is exactly the kind of tolerance this tree " +
        "measures instead of picking");
}

console.log();
if (fails) { console.log("policyCache-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("policyCache-selfcheck: all checks pass");
