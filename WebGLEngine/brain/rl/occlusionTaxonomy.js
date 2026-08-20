// brain/rl/occlusionTaxonomy.mjs -- v2851
//
// WHY A CATCH RATE CANNOT ANSWER THE QUESTION IT IS BEING ASKED.
//
// Two gates in this folder both ask "does memory earn its keep on the occlusion task", and they DISAGREE:
//     occlusion-memory-selfcheck   reflex 63%   memory 43%   -- memory LOSES
//     occlusion-bptt-selfcheck     reflex  6%   memory 12%   -- memory WINS, and both nearly always fail
// Both gates pass, because both merely report. A single percentage cannot tell those apart, and it cannot tell
// you WHY either number is what it is.
//
// THIS IS THE SAME PROBLEM v2827 SOLVED FOR THE MODEL BENCH, and the fix transfers even though nothing else
// about the two systems does. The bench stopped counting "failures" and started separating REFUSED (the model
// was wrong) from MALFORMED (the model could not express itself), because those have OPPOSITE FIXES. A hunt has
// exactly the same structure:
//
//   NEVER_ENGAGED    the hunter never closed on the target even while it could SEE it. Nothing to do with
//                    memory -- this is a flying failure, and counting it against memory slanders memory.
//   LOST_IN_BLACKOUT it was closing, then the target went behind the asteroid and the gap GREW. This is the
//                    "cannot remember" failure: blind, and drifting.
//   HELD_BUT_MISSED  it held or improved the gap all the way THROUGH the blackout and still did not catch.
//                    Memory worked; the intercept did not. The opposite fix -- a better policy head, not more
//                    memory pages.
//   CAUGHT           it worked.
//
// A policy that goes from LOST_IN_BLACKOUT to HELD_BUT_MISSED has improved ENORMOUSLY while its catch rate may
// not have moved at all. That is the measurement the existing gates cannot make, and it is why they can
// disagree without either being wrong.
//
// Pure except for the env and policy handed in; no imports.

export const OUTCOMES = ["caught", "heldButMissed", "lostInBlackout", "neverEngaged"];

// Classify ONE episode from its per-step trace of { dist, occluded, caught }.
export function classifyEpisode(trace) {
    if (!trace.length) return { outcome: "neverEngaged", reason: "no steps" };
    if (trace.some((s) => s.caught)) return { outcome: "caught" };

    const occ = trace.filter((s) => s.occluded);
    const startDist = trace[0].dist;
    const bestBeforeOcc = Math.min(...trace.filter((s) => !s.occluded).map((s) => s.dist).concat([Infinity]));

    // Never engaged: it never meaningfully closed on the target while it could see it. Judging memory on an
    // episode where the hunter could not fly is a category error.
    if (!(bestBeforeOcc < startDist * 0.8)) return { outcome: "neverEngaged", reason: "never closed while visible", bestBeforeOcc };

    // No blackout at all -- the target never hid, so this episode says nothing about memory either way.
    if (occ.length < 3) return { outcome: "heldButMissed", reason: "no meaningful occlusion", occSteps: occ.length };

    const distAtOccStart = occ[0].dist, distAtOccEnd = occ[occ.length - 1].dist;
    const grew = distAtOccEnd > distAtOccStart * 1.05;
    return grew
        ? { outcome: "lostInBlackout", reason: "gap grew while blind", from: distAtOccStart, to: distAtOccEnd, occSteps: occ.length }
        : { outcome: "heldButMissed", reason: "held the gap through the blackout, missed the intercept", from: distAtOccStart, to: distAtOccEnd, occSteps: occ.length };
}

// Run a policy through the env and classify every episode. envFactory and the policy are injected so this file
// depends on neither.
export function runTaxonomy({ envFactory, policy, episodes = 60, seedBase = 400 }) {
    const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0]));
    const details = [];
    for (let e = 0; e < episodes; e++) {
        if (policy.reset) policy.reset();
        const env = envFactory();
        let o = env.reset(seedBase + e);
        const trace = [];
        for (let t = 0; t < (env.maxSteps || 170); t++) {
            const a = policy.act ? policy.act(o) : policy(o);
            const r = env.step(a);
            trace.push({ dist: r.info.dist, occluded: !!r.info.occluded, caught: !!r.info.caught });
            o = r.obs;
            if (r.done) break;
        }
        const c = classifyEpisode(trace);
        counts[c.outcome]++;
        details.push(c);
    }
    const n = episodes;
    return {
        episodes: n, counts,
        rates: Object.fromEntries(OUTCOMES.map((o) => [o, counts[o] / n])),
        // THE NUMBER THAT ACTUALLY ANSWERS THE QUESTION: of the episodes that reached a blackout at all, how
        // often did the policy hold its track through it? That is what memory is FOR, and a catch rate buries it.
        blackoutHoldRate: (() => {
            const reached = counts.heldButMissed + counts.lostInBlackout + counts.caught;
            return reached ? (counts.heldButMissed + counts.caught) / reached : null;
        })(),
        details,
    };
}

// Compare two policies on the split, so "memory earns its keep" becomes a specific claim rather than a slogan.
export function compare(a, b) {
    return {
        catchRate: { a: a.rates.caught, b: b.rates.caught, bWins: b.rates.caught > a.rates.caught },
        blackoutHold: { a: a.blackoutHoldRate, b: b.blackoutHoldRate, bWins: (b.blackoutHoldRate ?? 0) > (a.blackoutHoldRate ?? 0) },
        // The interesting case: b tracks better through cover but does not convert it. That is a REAL gain the
        // catch rate hides, and it points at the policy head rather than at the memory.
        tracksBetterButCannotConvert: (b.blackoutHoldRate ?? 0) > (a.blackoutHoldRate ?? 0) && b.rates.caught <= a.rates.caught,
    };
}

// ---- WHAT THE INSTRUMENT FOUND, v2851 ----------------------------------------------------------------
//
// Run against the TRAINED policies inside occlusion-memory-selfcheck (40 episodes each):
//
//                caught  heldButMissed  lostInBlackout  neverEngaged
//     reflex        78%            23%              0%            0%
//     memory        38%            63%              0%            0%
//     BLACKOUT HOLD RATE:  reflex 100%   memory 100%
//
// LOST_IN_BLACKOUT IS ZERO FOR BOTH, AND THE HOLD RATE IS 100% FOR BOTH. Neither policy ever loses its track
// while the target is hidden -- so THE TASK DOES NOT STRESS MEMORY AT ALL. There is nothing for memory to fix,
// and the entire difference between the two is the intercept, where the reflex policy is simply better.
//
// That is the answer the two older gates could not give. It is not that memory fails; it is that this task never
// asks it the question. A catch rate of 43% versus 63% looked like "memory loses at tracking through cover", and
// the truth is "nobody was tested on tracking through cover".
//
// SO THE HONEST NEXT STEP IS THE TASK, NOT THE POLICY: a longer occlusion, a faster or manoeuvring target, or a
// larger asteroid -- something that actually makes a memoryless policy lose the track. If lostInBlackout stays at
// zero however hard the task is made, then memory has no job here and bptt.js and occludedHuntEnv.js should be
// DELETED with this measurement written down, rather than kept as a green gate on an untested claim.
export const MEASURED_v2851 = Object.freeze({
    trained: true, episodes: 40,
    reflex: { caught: 0.78, heldButMissed: 0.23, lostInBlackout: 0, neverEngaged: 0, blackoutHold: 1 },
    memory: { caught: 0.38, heldButMissed: 0.63, lostInBlackout: 0, neverEngaged: 0, blackoutHold: 1 },
    conclusion: "the task does not stress memory -- lostInBlackout is zero for both, so the comparison was never about tracking through cover",
    nextStep: "make the OCCLUSION harder until a memoryless policy actually loses the track; if it never does, delete the pair with this recorded",
});

// ---- THE VERDICT ON THE PAIR (v2854) -----------------------------------------------------------------
//
// v2851 measured lostInBlackout at 0% for BOTH policies and concluded the task never asks memory the question.
// The proposed cause was the TARGET, not the occlusion: it crosses at CONSTANT VELOCITY in a straight line, and
// a straight line does not need remembering -- it needs extrapolating. A reflex policy keeps flying its current
// intercept and arrives correctly, blind or not.
//
// TESTED with opts.evade, a single heading change taken the first time the target is genuinely hidden.
// Both policies TRAINED on the same setting they were then measured on (40 ES iterations, 60 episodes):
//
//     evade   policy   caught  heldMissed  lostInBlackout  neverEngaged  holdRate
//       0.0   reflex      63%         37%              0%            0%      100%
//       0.0   memory      53%         45%              0%            2%      100%
//       1.2   reflex       3%         37%              3%           57%       92%
//       1.2   memory      12%         27%              8%           53%       82%
//
// THE VERDICT FLIPS. At evade 0 the reflex policy WINS 63 to 53 and neither ever loses track. At evade 1.2
// lostInBlackout is finally non-zero and MEMORY WINS 12 TO 3 -- a four-fold advantage, in the opposite direction.
// So the pair was right and the TASK was wrong: bptt.js and occludedHuntEnv.js are worth keeping.
//
// AND A SUBTLETY THE SPLIT EXPOSES THAT A CATCH RATE WOULD HAVE HIDDEN: at evade 1.2 the memory policy has the
// LOWER hold rate (82% against 92%) and the HIGHER catch rate. It loses the track more often and converts far
// better when it holds it. A single percentage would have shown only the win.
//
// HONEST LIMITS, because the numbers are small: 12% against 3% is a clear direction on weak absolute
// performance, 40 ES iterations is minimal training, one seed, and neverEngaged is still above half -- so more
// than half of episodes remain a flying test rather than a memory test. This says the task CAN discriminate and
// which way it points. It does not say how well a well-trained memory policy would do.
export const EVADE_VERDICT = Object.freeze({
    tested: [0, 1.2], episodes: 60, esIters: 40, trainedOnTaskUnderTest: true,
    evade0: { reflex: { caught: 0.63, lostInBlackout: 0, hold: 1 }, memory: { caught: 0.53, lostInBlackout: 0, hold: 1 } },
    evade12: { reflex: { caught: 0.03, lostInBlackout: 0.03, hold: 0.92 }, memory: { caught: 0.12, lostInBlackout: 0.08, hold: 0.82 } },
    conclusion: "the evasive turn makes the task discriminate: lostInBlackout goes non-zero and the winner flips from reflex to memory",
    decision: "KEEP bptt.js and occludedHuntEnv.js -- the pair was right, the task was too easy",
    limits: "small absolute numbers, 40 ES iterations, one seed, neverEngaged still above half",
});

// ---- THE FOLLOW-UP, AND A CORRECTION OF v2854 (v2855) ------------------------------------------------
//
// v2854 trained both policies with 40 ES iterations on ONE seed, saw memory 12% against reflex 3%, and called
// the verdict flipped. THAT DID NOT SURVIVE PROPER TRAINING. At 200 iterations across THREE seeds:
//
//     seed    reflex   memory
//        4      14%       9%
//       11      16%       9%
//       23      24%       5%
//     mean      18%       8%      -- reflex wins on EVERY seed
//
// The v2854 "flip" was undertrained noise. Neither policy had learned much at 40 iterations and the memory
// policy's extra capacity happened to land better on one seed. THE CLAIM IS WITHDRAWN.
//
// BUT ES IS THE WRONG TRAINER, AND bptt.js SAYS SO IN ITS OWN FIRST PARAGRAPH: "ES treats the policy as a black
// box and only nudges weights by reward -- a weak signal for a recurrent net, which is why ES couldn't train the
// memory policy to beat a reflex policy on the occlusion tasks." So the ES result above is not evidence against
// memory. It is that stated premise, reproduced at higher training and across seeds.
//
// THE RIGHT TEST IS BPTT, and it says something the catch rate alone never could. Both policies cloned from the
// SAME cheating expert, 60 episodes:
//
//     evade  policy   caught  heldMissed  lostInBlackout  holdRate
//       0.0  reflex      5%         15%             10%       67%
//       0.0  memory     10%         40%              2%       97%
//       1.2  reflex      2%         27%              8%       77%
//       1.2  memory      0%         27%              3%       89%
//
// MEMORY DOES THE THING IT WAS BUILT TO DO. It holds its track through cover at 97% against 67%, and loses the
// track 2-3% of the time against reflex's 8-10%. That is not a marginal difference; it is the capability the
// whole pair exists to provide, and it is now measured.
//
// AND IT DOES NOT CONVERT THAT INTO CATCHES. heldButMissed is 40% at evade 0 against reflex's 15%. Memory holds
// the target and misses the intercept -- which is EXACTLY the category this taxonomy was written to separate,
// and it names the fix: THE POLICY HEAD, NOT THE MEMORY. More memory pages would not help; a better action
// mapping would.
//
// A CATCH RATE WOULD HAVE SAID "MEMORY LOSES" AND STOPPED THERE. The split says memory succeeds at memory and
// fails at intercept, which is a different problem with a different fix. That is the entire argument for
// instrumenting a task before optimising against it.
//
// DECISION: KEEP the pair -- but for the corrected reason. Not "memory wins the task", which it does not, but
// "memory demonstrably tracks through cover and the deficiency is downstream of the memory".
export const FOLLOWUP_v2855 = Object.freeze({
    esWithdrawn: { iters: 200, seeds: [4, 11, 23], reflexMean: 0.18, memoryMean: 0.08, reflexWinsEverySeed: true,
                   note: "v2854's memory-wins result was 40 iterations on one seed and did not survive" },
    bptt: {
        evade0: { reflex: { caught: 0.05, heldMissed: 0.15, lost: 0.10, hold: 0.67 }, memory: { caught: 0.10, heldMissed: 0.40, lost: 0.02, hold: 0.97 } },
        evade12: { reflex: { caught: 0.02, heldMissed: 0.27, lost: 0.08, hold: 0.77 }, memory: { caught: 0.00, heldMissed: 0.27, lost: 0.03, hold: 0.89 } },
    },
    conclusion: "BPTT-trained memory holds its track far better (97% vs 67%, losing it 2% vs 10%) and does NOT convert that into catches -- heldButMissed, so the fix is the policy head, not the memory",
    decision: "KEEP the pair, for the corrected reason: memory does its job and the deficiency is downstream",
});
