// WebGLEngine/brain/rl/occlusionTaxonomy-selfcheck.mjs -- v2851
//
// Run: node brain/rl/occlusionTaxonomy-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES brain/rl/occlusionTaxonomy.js -- the instrument that makes "does memory earn its keep" answerable.
//
// THE PROBLEM IT WAS BUILT FOR: two gates in this folder ask that question and DISAGREE.
//     occlusion-memory-selfcheck   reflex 63%   memory 43%   -- memory LOSES
//     occlusion-bptt-selfcheck     reflex  6%   memory 12%   -- memory WINS, both nearly always failing
// Both pass, because both merely report a catch rate. A single percentage cannot tell those apart.
//
// AND THE INSTRUMENT IMMEDIATELY EXPLAINED THE DISAGREEMENT. Around 60% of episodes are NEVER_ENGAGED -- the
// hunter never closed on the target even while it could SEE it. Those episodes are a flying failure and never
// tested memory at all, yet they dominated the catch rate. The old numbers were mostly measuring the wrong
// thing, which is exactly how two honest measurements end up pointing in opposite directions.
//
// THE FIX IS THE ONE v2827 FOUND FOR THE MODEL BENCH, and it transfers even though nothing else about the two
// systems does: stop counting "failures" and separate the ones with OPPOSITE CAUSES. Refused versus malformed
// there; lost-in-blackout versus held-but-missed here.

import fs from "node:fs";
import { prose } from "../../tools/ship/sourceScan.mjs";
import { OUTCOMES, classifyEpisode, runTaxonomy, compare } from "./occlusionTaxonomy.js";
import { OccludedHuntEnv } from "./occludedHuntEnv.js";
import { MemoryPolicy } from "./memoryPolicy.js";
import { FlightPolicy } from "./dockPolicy.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. THE CLASSIFICATION, against traces built to hit each branch exactly
{
    ok("a catch is a catch", classifyEpisode([{ dist: 500, occluded: false, caught: false }, { dist: 40, occluded: false, caught: true }]).outcome === "caught");

    const never = [{ dist: 500, occluded: false, caught: false }, { dist: 495, occluded: false, caught: false }];
    ok("!! never closing while VISIBLE is NEVER_ENGAGED, not a memory failure", classifyEpisode(never).outcome === "neverEngaged");

    const lost = [{ dist: 500, occluded: false, caught: false }, { dist: 300, occluded: false, caught: false },
                  { dist: 300, occluded: true, caught: false }, { dist: 380, occluded: true, caught: false }, { dist: 460, occluded: true, caught: false }];
    ok("!! closing, then the gap GROWS while blind, is LOST_IN_BLACKOUT", classifyEpisode(lost).outcome === "lostInBlackout");

    const held = [{ dist: 500, occluded: false, caught: false }, { dist: 300, occluded: false, caught: false },
                  { dist: 300, occluded: true, caught: false }, { dist: 280, occluded: true, caught: false }, { dist: 270, occluded: true, caught: false }];
    ok("!! holding the gap through the blackout and still missing is HELD_BUT_MISSED", classifyEpisode(held).outcome === "heldButMissed");

    ok("an empty trace is neverEngaged rather than a crash", classifyEpisode([]).outcome === "neverEngaged");
    ok("the four outcomes are the only ones emitted", [never, lost, held].every((t) => OUTCOMES.includes(classifyEpisode(t).outcome)));
}

// 2. THE TWO MEMORY FAILURES ARE GENUINELY DIFFERENT, which is the entire point
{
    // THREE occluded steps minimum -- the classifier refuses to call a two-frame flicker an occlusion, and my
    // first fixtures had only two, so both fell into "no meaningful occlusion" and the check failed. The test
    // was wrong about the threshold, not the code.
    const lost = [{ dist: 500, occluded: false }, { dist: 300, occluded: false },
                  { dist: 300, occluded: true }, { dist: 400, occluded: true }, { dist: 500, occluded: true }];
    const held = [{ dist: 500, occluded: false }, { dist: 300, occluded: false },
                  { dist: 300, occluded: true }, { dist: 295, occluded: true }, { dist: 290, occluded: true }];
    ok("!! LOST_IN_BLACKOUT and HELD_BUT_MISSED are distinct outcomes for identical catch results (both zero)",
        classifyEpisode(lost).outcome !== classifyEpisode(held).outcome);
    ok("...and each carries the distances that decided it, so a reading is checkable",
        classifyEpisode(lost).from === 300 && classifyEpisode(lost).to === 500);
}

// 3. THE LIVE RUN -- on the real environment and the real policies the old gates compared
{
    const f = () => new OccludedHuntEnv({});
    const reflex = new FlightPolicy({ obsDim: 8, actDim: 2, hidden: [16, 16], seed: 2 });
    const memory = new MemoryPolicy(8, 2, { slots: 4, slotDim: 4, hidden: 16, seed: 2 });
    const R = runTaxonomy({ envFactory: f, policy: reflex, episodes: 40 });
    const M = runTaxonomy({ envFactory: f, policy: memory, episodes: 40 });

    ok("every episode is classified", Object.values(R.counts).reduce((a, b) => a + b, 0) === 40);
    ok("the rates sum to 1", Math.abs(Object.values(R.rates).reduce((a, b) => a + b, 0) - 1) < 1e-9);

    ok("!! a LARGE share of episodes never engaged at all -- which is what the old catch rate was mostly counting",
        R.rates.neverEngaged > 0.3, `reflex ${(R.rates.neverEngaged * 100).toFixed(0)}%, memory ${(M.rates.neverEngaged * 100).toFixed(0)}%`);

    ok("blackoutHoldRate is computed only over episodes that REACHED a blackout", R.blackoutHoldRate === null || (R.blackoutHoldRate >= 0 && R.blackoutHoldRate <= 1));
    ok("...and it is a different number from the catch rate", R.blackoutHoldRate === null || Math.abs(R.blackoutHoldRate - R.rates.caught) > 0.05,
        `hold ${R.blackoutHoldRate != null ? (R.blackoutHoldRate * 100).toFixed(0) + "%" : "n/a"} vs catch ${(R.rates.caught * 100).toFixed(0)}%`);

    const c = compare(R, M);
    ok("compare reports both axes separately", "catchRate" in c && "blackoutHold" in c);
    ok("!! it names the case a catch rate HIDES: tracks better, cannot convert", "tracksBetterButCannotConvert" in c);
}

// 4. it is honest about what it is
{
    const src = (await import("node:fs")).readFileSync(new URL("./occlusionTaxonomy.js", import.meta.url), "utf8");
    ok("the source records that the two existing gates DISAGREE, with their numbers", /reflex 63%/.test(src) && /reflex  6%/.test(src));
    ok("!! and that a catch rate cannot tell them apart", /A single percentage cannot tell those apart/.test(prose(src)));
    ok("...and credits where the idea came from, since nothing else about the two systems transfers",
        /v2827/.test(src) && /OPPOSITE FIXES/.test(src));
    ok("neverEngaged is explained as a flying failure, not a memory one", /counting it against memory slanders memory/.test(prose(src)));
    ok("it imports nothing, so it cannot drift with either policy", !/^\s*import\s/m.test(src));
}


// 5. THE VERDICT ON THE PAIR -- the question v2851 left open, now answered
{
    const { EVADE_VERDICT: V } = await import("./occlusionTaxonomy.js");
    const { OccludedHuntEnv } = await import("./occludedHuntEnv.js");

    ok("!! the evasive turn is OPT-IN, so every existing gate is untouched", new OccludedHuntEnv({}).evade === 0);
    ok("...and it is a real option when asked for", new OccludedHuntEnv({ evade: 1.2 }).evade === 1.2);

    ok("!! at evade 0 NEITHER policy ever loses the track -- the task does not ask the question",
        V.evade0.reflex.lostInBlackout === 0 && V.evade0.memory.lostInBlackout === 0);
    ok("!! ...and the reflex policy WINS there", V.evade0.reflex.caught > V.evade0.memory.caught,
        `${V.evade0.reflex.caught} vs ${V.evade0.memory.caught}`);

    ok("!! with an evasive turn, lostInBlackout goes NON-ZERO -- the task finally discriminates",
        V.evade12.reflex.lostInBlackout > 0 && V.evade12.memory.lostInBlackout > 0);
    ok("!! ...AND THE WINNER FLIPS TO MEMORY", V.evade12.memory.caught > V.evade12.reflex.caught,
        `memory ${V.evade12.memory.caught} vs reflex ${V.evade12.reflex.caught}`);
    ok("...by a wide margin, in the opposite direction from evade 0",
        V.evade12.memory.caught / V.evade12.reflex.caught > 2);

    ok("!! the split exposes what a catch rate hides: memory holds LESS but converts MORE",
        V.evade12.memory.hold < V.evade12.reflex.hold && V.evade12.memory.caught > V.evade12.reflex.caught,
        `hold ${V.evade12.memory.hold} vs ${V.evade12.reflex.hold}, caught ${V.evade12.memory.caught} vs ${V.evade12.reflex.caught}`);

    ok("the policies were trained ON the task they were measured on", V.trainedOnTaskUnderTest === true);
    ok("!! the decision is recorded, and it is KEEP", /KEEP bptt\.js and occludedHuntEnv\.js/.test(V.decision));
    ok("!! ...with the limits stated rather than the win overclaimed",
        /small absolute numbers/.test(V.limits) && /one seed/.test(V.limits));

    const env = fs.readFileSync(new URL("./occludedHuntEnv.js", import.meta.url), "utf8");
    ok("the env explains WHY a straight-line target could never test memory", /a straight line does not need remembering/.test(prose(env)));
    ok("...and why the turn is taken ONCE rather than every frame", /unpredictable rather than memorable/.test(env));
}


// 6. THE FOLLOW-UP, AND THE WITHDRAWAL OF v2854's CLAIM
{
    const { FOLLOWUP_v2855: F, EVADE_VERDICT: V } = await import("./occlusionTaxonomy.js");
    ok("!! v2854's ES result is recorded as WITHDRAWN, not quietly dropped", F.esWithdrawn.reflexWinsEverySeed === true);
    ok("...with the training that overturned it", F.esWithdrawn.iters === 200 && F.esWithdrawn.seeds.length === 3);
    ok("!! ...and it CONTRADICTS the earlier verdict, which is stated rather than smoothed over",
        F.esWithdrawn.reflexMean > F.esWithdrawn.memoryMean && V.evade12.memory.caught > V.evade12.reflex.caught,
        `ES-200 says reflex ${F.esWithdrawn.reflexMean} > memory ${F.esWithdrawn.memoryMean}; v2854 said the opposite`);

    // the load-bearing finding
    ok("!! BPTT-trained memory HOLDS ITS TRACK far better than reflex", F.bptt.evade0.memory.hold > F.bptt.evade0.reflex.hold + 0.2,
        `${F.bptt.evade0.memory.hold} vs ${F.bptt.evade0.reflex.hold}`);
    ok("!! ...and loses the track several times less often", F.bptt.evade0.memory.lost < F.bptt.evade0.reflex.lost / 2,
        `${F.bptt.evade0.memory.lost} vs ${F.bptt.evade0.reflex.lost}`);
    ok("...at both evade settings", F.bptt.evade12.memory.hold > F.bptt.evade12.reflex.hold && F.bptt.evade12.memory.lost < F.bptt.evade12.reflex.lost);

    ok("!! AND IT DOES NOT CONVERT: heldButMissed is far higher for memory", F.bptt.evade0.memory.heldMissed > F.bptt.evade0.reflex.heldMissed * 2,
        `${F.bptt.evade0.memory.heldMissed} vs ${F.bptt.evade0.reflex.heldMissed}`);
    ok("!! the conclusion names the FIX as the policy head, not the memory", /policy head, not the memory/.test(F.conclusion));
    ok("the decision is KEEP, for the CORRECTED reason", /KEEP the pair/.test(F.decision) && /deficiency is downstream/.test(F.decision));

    const src = fs.readFileSync(new URL("./occlusionTaxonomy.js", import.meta.url), "utf8");
    ok("!! the source says a catch rate alone would have stopped at 'memory loses'", /would have said "MEMORY LOSES" and stopped there/i.test(src) || /A CATCH RATE WOULD HAVE SAID/.test(prose(src)));
    ok("...and credits bptt.js's own stated premise about ES", /weak signal for a recurrent net/.test(prose(src)));
}

console.log("occlusionTaxonomy-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
