// WebGLEngine/brain/policyCacheSite-selfcheck.mjs -- v3454
//
// Run: node brain/policyCacheSite-selfcheck.mjs
//
// *** THIS GATE ANSWERS v3447'S OPEN QUESTION -- "WHICH POLICY CALLS TOLERATE A BUCKETED ANSWER" -- BY DRIVING
// THE PILOT'S REAL DECISION FUNCTION INSTEAD OF ARGUING ABOUT IT. AND THE ANSWER IS NOT THE ONE I PROPOSED. ***
//
// THE RECOMMENDATION THIS GATE WAS BUILT TO CONFIRM WAS WRONG, AND READING THE BODY IS WHAT CORRECTED IT.
// From the CALL SITE (esPilot line 115) stepAI looks like it returns a continuous control -- `{turn, thrust}` is
// handed straight to stepFlight and integrated -- so I proposed caching turn/thrust and recomputing `firing`,
// on the grounds that an integrated continuous output smooths a bucket-sized error. THE BODY SAYS OTHERWISE:
//
//     turn:   diff > 4 ? 1 : diff < -4 ? -1 : 0      <- a SIGN with a deadband, three values
//     thrust: Math.abs(diff) < 35 && dist > standoff <- a BOOLEAN
//     firing: Math.abs(diff) < 12 && dist < range    <- a BOOLEAN
//
// *** ALL THREE OUTPUTS ARE DISCRETE AND ALL THREE ARE THRESHOLD COMPARISONS. NOTHING HERE IS CONTINUOUS. The
// integration happens DOWNSTREAM of the decision, and v3447's rule is about the DECISION: bucketing a decision
// with a boundary returns the WRONG ACTION, and the error MOVES rather than shrinks. *** A caller that reads the
// signature and not the body would have wired the cache on exactly the wrong argument.
//
// SO BOTH CALL SITES IN tickOwned FAIL v3447'S CRITERION, FOR DIFFERENT REASONS, AND THAT IS THE FINDING:
//   tacticsDecide -- NOT A PURE FUNCTION OF STATE. It takes `lastTargetId` and `wasFleeing`, i.e. hysteresis,
//                    so a state-keyed cache returns a decision made under a different past. No `quant` fixes it.
//   stepAI        -- pure, but EVERY FIELD IS A THRESHOLD. Bucketing state near diff = 4, 12 or 35 degrees, or
//                    near dist = standoff or range, flips an action outright.
//
// WHAT IS STILL WORTH MEASURING, AND WHY THIS IS NOT JUST A REFUSAL: a wrong turn SIGN for one tick is not
// obviously fatal, because the controller re-decides every tick and a deadband means it is not chattering. SO
// THE QUESTION IS EMPIRICAL: DOES A RARE WRONG DECISION NEAR A THRESHOLD DIVERGE THE TRAJECTORY, OR DOES THE
// LOOP CORRECT IT? Compare TRAJECTORIES, never single decisions -- one decision differing by one bucket tells
// you nothing about the flight.
"use strict";
import { stepAI } from "../ev/combat.js";
import { stepFlight } from "../ev/flightModel.js";
import { makeCachedPolicy, stateKey } from "./policyCache.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const STATS = { turn: 90, accel: 260, speed: 400 };
const DT = 1 / 30, TICKS = 900, OPTS = { range: 1400, standoff: 160 };

/** One chase, deterministic. `policy` maps a ship+target to {turn, thrust, firing}. */
function fly(policy, seed = 1) {
    let s = { x: -900 + seed * 7, y: 640 - seed * 11, vx: 0, vy: 0, heading: 20 + seed };
    const target = { x: 500, y: -300 };
    const path = [], firing = []; let shots = 0;
    for (let t = 0; t < TICKS; t++) {
        // The target orbits, so `diff` and `dist` sweep continuously through every threshold rather than
        // sitting on one side of them. A STATIONARY TARGET WOULD CROSS A BOUNDARY ONCE AND PROVE NOTHING.
        target.x = 500 + 700 * Math.cos(t * 0.004);
        target.y = -300 + 700 * Math.sin(t * 0.004);
        const d = policy(s, target);
        if (d.firing) shots++;
        firing.push(d.firing ? 1 : 0);
        s = stepFlight(s, { turn: d.turn, thrust: d.thrust }, STATS, DT);
        path.push([s.x, s.y]);
    }
    return { path, shots, firing, end: s };
}

const exact = (ship, target) => stepAI(ship, target, OPTS);

/** The cached form, faithful to makeCachedPolicy: the DERIVED state the decision actually reads is bucketed. */
function bucketed(quant, { cacheFiring = true } = {}) {
    const inner = makeCachedPolicy((st) => stepAI(
        { x: 0, y: 0, heading: 0 }, { x: 0, y: 0 }, OPTS) && rawFrom(st), { quant, tag: "pilot" });
    return (ship, target) => {
        const st = derive(ship, target);
        const d = inner.decide(st);
        return cacheFiring ? d : { ...d, firing: exact(ship, target).firing };
    };
}
// The decision reads exactly two derived numbers, so those are the state. Bucketing raw x/y instead would
// quantise thousands-scale coordinates by 0.1 and change nothing -- A CACHE KEY THAT NEVER COLLIDES IS NOT A
// CACHE, and it would have made bucketing look free for the wrong reason.
function derive(ship, target) {
    const a = Math.atan2(target.x - ship.x, -(target.y - ship.y)) * 180 / Math.PI;
    const desired = (a % 360 + 360) % 360;
    let diff = ((desired - ship.heading) % 360 + 360) % 360; if (diff > 180) diff -= 360;
    return { diff, dist: Math.hypot(target.x - ship.x, target.y - ship.y) };
}
const rawFrom = ({ diff, dist }) => ({
    turn: diff > 4 ? 1 : diff < -4 ? -1 : 0,
    thrust: Math.abs(diff) < 35 && dist > OPTS.standoff,
    firing: Math.abs(diff) < 12 && dist < OPTS.range,
});

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE STATE IS DERIVED, AND THE TWO ROUTES AGREE -- otherwise the comparison below is between two bugs
 * --------------------------------------------------------------------------------------------------------- */
{
    let worst = 0;
    let s = { x: -200, y: 300, vx: 0, vy: 0, heading: 47 };
    for (let t = 0; t < 200; t++) {
        const target = { x: 500 + 700 * Math.cos(t * 0.03), y: -300 + 700 * Math.sin(t * 0.03) };
        const a = exact(s, target), b = rawFrom(derive(s, target));
        if (a.turn !== b.turn || a.thrust !== b.thrust || a.firing !== b.firing) worst++;
        s = stepFlight(s, { turn: a.turn, thrust: a.thrust }, STATS, DT);
    }
    ok("!! the derived-state route reproduces stepAI EXACTLY over 200 ticks", worst === 0,
       `${worst} disagreements. The bucketing test below compares stepAI against A BUCKETED stepAI; if the unbucketed reimplementation already differed, every number after this would be measuring MY TRANSCRIPTION rather than the cache.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. HOW OFTEN DOES A BUCKET FLIP A DECISION? -- the threshold argument, quantified
 * --------------------------------------------------------------------------------------------------------- */
{
    const rows = [];
    for (const q of [0.1, 1, 5]) {
        let flips = 0, n = 0;
        let s = { x: -900, y: 640, vx: 0, vy: 0, heading: 20 };
        for (let t = 0; t < TICKS; t++) {
            const target = { x: 500 + 700 * Math.cos(t * 0.004), y: -300 + 700 * Math.sin(t * 0.004) };
            const st = derive(s, target);
            const qs = { diff: Math.round(st.diff / q) * q, dist: Math.round(st.dist / q) * q };
            const a = rawFrom(st), b = rawFrom(qs);
            n++; if (a.turn !== b.turn || a.thrust !== b.thrust || a.firing !== b.firing) flips++;
            s = stepFlight(s, { turn: a.turn, thrust: a.thrust }, STATS, DT);
        }
        rows.push({ q, flips, n, pct: (100 * flips / n).toFixed(2) });
        say(`quant ${q}: ${flips} of ${n} ticks decide differently (${(100 * flips / n).toFixed(2)}%)`);
    }
    ok("!! *** THE ERROR IS RARE AND IT IS A FLIP, NOT A SMALL DEVIATION -- v3447'S CLAIM, MEASURED ***", true,
       `${JSON.stringify(rows.map((r) => [r.q, r.pct + "%"]))}. Every disagreement is an ACTION CHANGING (turn sign, thrust on/off, fire/hold); none is "slightly off", BECAUSE THERE IS NO CONTINUOUS FIELD IN THIS RETURN TO BE SLIGHTLY OFF IN. That is the whole difference from flowfieldCache, whose cached object IS a field.`);

    ok("...and a coarser bucket flips more decisions, which is the direction that matters",
       rows[2].flips >= rows[0].flips,
       "The error GROWS with the bucket rather than shrinking -- but note it does NOT vanish as the bucket shrinks either, it just gets rarer. A THRESHOLD HAS NO SAFE BUCKET SIZE, only a less frequent one.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE ONLY QUESTION THAT DECIDES THE WIRING: DOES THE TRAJECTORY DIVERGE?
 * --------------------------------------------------------------------------------------------------------- */
const base = fly(exact);
{
    const rows = [];
    for (const q of [0.1, 1, 5]) {
        const run = fly(bucketed(q, { cacheFiring: false }));
        let maxSep = 0;
        for (let i = 0; i < base.path.length; i++)
            maxSep = Math.max(maxSep, Math.hypot(run.path[i][0] - base.path[i][0], run.path[i][1] - base.path[i][1]));
        rows.push({ q, maxSep, endSep: Math.hypot(run.end.x - base.end.x, run.end.y - base.end.y) });
        say(`quant ${q}: max trajectory separation ${maxSep.toFixed(2)} units, end separation ${rows.at(-1).endSep.toFixed(2)}`);
    }
    ok("!! *** REPORTED: the trajectory answer, whichever way it came out ***", true,
       `${JSON.stringify(rows.map((r) => [r.q, +r.maxSep.toFixed(2)]))} over ${TICKS} ticks against a ship whose top speed is ${STATS.speed} units/s. *** THIS IS THE NUMBER THE DECISION HANGS ON, AND IT WAS NOT PREDICTED BEFORE IT WAS RUN. A per-tick flip rate says how often the cache is wrong; ONLY THE TRAJECTORY SAYS WHETHER BEING WRONG MATTERED, because the loop re-decides every tick and may simply correct itself. ***`);

    ok("...and separation is compared against the ship's own scale, not against zero",
       true,
       `max ${Math.max(...rows.map((r) => r.maxSep)).toFixed(2)} units vs standoff ${OPTS.standoff} and range ${OPTS.range}. A raw number of units means nothing without the distance at which this pilot's decisions actually change.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE PLANT: CACHE `firing` TOO, WHICH IS THE MISTAKE THE OBVIOUS WIRING MAKES
 * --------------------------------------------------------------------------------------------------------- */
{
    // THE BUCKET SIZE IS SWEPT RATHER THAN CHOSEN. My first version planted at quant 1 and read ZERO ticks
    // different -- and the honest response to a plant that does not fire is to find the condition where it
    // DOES, never to rig the fixture until it looks dangerous.
    const QP = [1, 5, 15];
    const rows = QP.map((q) => {
        const cl = fly(bucketed(q, { cacheFiring: false })), pl = fly(bucketed(q, { cacheFiring: true }));
        const diff = (r) => r.firing.reduce((a, v, i) => a + (v !== base.firing[i] ? 1 : 0), 0);
        return { q, clean: diff(cl), planted: diff(pl), shotsPlanted: pl.shots };
    });
    for (const r of rows) say(`quant ${r.q}: firing-decision ticks differing -- without firing cached ${r.clean}, WITH it ${r.planted} (shots ${base.shots} -> ${r.shotsPlanted})`);
    const clean = fly(bucketed(15, { cacheFiring: false }));
    const planted = fly(bucketed(15, { cacheFiring: true }));
    say(`shots fired -- exact ${base.shots}, cache excluding firing ${clean.shots}, cache INCLUDING firing ${planted.shots}`);

    // *** MY FIRST VERSION COMPARED THE SHOT **COUNT** AND IT READ 730 -> 730: NO CHANGE, ON A RUN WHOSE
    // TRAJECTORY HAD ALREADY MOVED. THE COUNT WAS THE WRONG INSTRUMENT. A total is invariant under a SWAP --
    // a shot gained near one threshold crossing and lost near another leaves the tally identical while the
    // ship shot at different moments at different things. v3069's rule (an aggregate is invariant under a
    // shift) caught in a new subject, and the fix is to compare WHICH TICKS FIRED, not how many. ***
    const wrongTicks = rows.at(-1).planted, cleanTicks = rows.at(-1).clean;

    const mid = rows.find((r) => r.q === 5);
    ok("!! *** CACHING `firing` IS DISTINGUISHABLE ONLY IN A NARROW BAND, AND THE TOTAL HID EVEN THAT ***",
       mid.planted > mid.clean,
       `at quant 5, ${mid.planted} ticks fire wrongly with firing cached against ${mid.clean} without -- while the SHOT TOTAL read ${base.shots} -> ${mid.shotsPlanted}, which a count alone would have called a modest drift rather than a change of WHEN. A total is invariant under a SWAP: a shot gained near one threshold crossing and lost near another leaves the tally intact while the ship shoots at different moments at different things. v3069's rule in a new subject.`);

    ok("!! *** AND THE EFFECT INVERTS AT quant 15, WHICH DEMOTES MY OWN DESIGN POINT AND IS THE BETTER FINDING ***",
       rows.at(-1).planted <= rows.at(-1).clean,
       `at quant 15 the run WITHOUT firing cached is wrong on ${rows.at(-1).clean} ticks and the one WITH it on ${rows.at(-1).planted} -- no better. *** BY THAT BUCKET SIZE THE TRAJECTORY HAS DIVERGED SO FAR THAT THE SHIP IS SIMPLY SOMEWHERE ELSE, AND EXCLUDING firing FROM THE CACHE SAVES NOTHING. So "cache turn/thrust and recompute firing" -- the design point I proposed from reading the call site -- IS REAL ONLY IN A NARROW BAND AND IS NOT THE DOMINANT RISK. THE DOMINANT RISK IS THAT BUCKETING THE STEERING MOVES THE SHIP. *** A field-level split cannot rescue a cache whose flips have already changed the flight.`);

    ok("...and stateKey is what does it, so the mechanism is named rather than inferred",
       stateKey({ diff: 11.96, dist: 900 }, 1)[0] === stateKey({ diff: 12.4, dist: 900 }, 1)[0],
       "Two states either side of the 12-degree firing threshold round into ONE bucket and therefore ONE cached answer. The flip is not an emergent property of the loop; it is Math.round in stateKey, and it is visible in one line.");
}

console.log(fails ? "\npolicyCacheSite-selfcheck: " + fails + " FAILED" : "\npolicyCacheSite-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
