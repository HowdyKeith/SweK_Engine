// tools/roundhouse/policyPilot-selfcheck.mjs
//
// Run: node tools/roundhouse/policyPilot-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2890 -- the first roundhouse proposer with no words. The probe's new "pilot" mode grades a CONTROL VALUE (an
// angular momentum), so a policy's weights can sit in the seat language models normally occupy -- and everything
// the roundhouse promises must survive that swap: the physics still adjudicates, wrong weights are refused like
// wrong words, and the only channel from sim to policy is the measurement. The learned policy's convergence is
// STOCHASTIC SEARCH and the bars below say so out loud: a pinned fast seed is asserted tightly, an 8-seed sweep
// is asserted at the rate the calibration actually measured (7/8 within 80 rounds; the straggler, seed 99,
// crystallises at round 127 -- slow tail, not failure), because a selfcheck that asserts luck is a coin, not a
// check.

import { buildProbe } from "./probeBind.mjs";
import { policyCaller, reflexPilotPolicy, brainPilotPolicy, brainBridgePolicy, cpuForward, mulberry32 } from "./policyPilot.mjs";
import { roundhouseDevice } from "./deviceBind.mjs";
import { getDevice } from "./devices.mjs";
import { circularL } from "../../physics/blackhole/probe.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const dev = await getDevice("probe");

// ---- 1. PILOT MODE PHYSICS: the control surface a policy steers by ----------------------------------------------
{
    const exact = circularL(1, 10);
    const spot = await buildProbe({ mode: "pilot", config: { L: exact, rTarget: 10, turns: 4 } });
    ok("!! the exactly-circular L holds the orbit with ZERO measured eccentricity", spot.pilotEcc === 0 && spot.pilotSide === 0,
        "ecc " + spot.pilotEcc + " at L = circularL(1,10) -- the sim confirms the closed form by staying put");
    const high = await buildProbe({ mode: "pilot", config: { L: exact * 1.02, rTarget: 10, turns: 4 } });
    const low = await buildProbe({ mode: "pilot", config: { L: exact * 0.98, rTarget: 10, turns: 4 } });
    ok("!! side is a faithful learning signal: L high swings OUT (+1), L low dips IN (-1)",
        high.pilotSide === 1 && low.pilotSide === -1 && high.pilotEcc > 0.01 && low.pilotEcc > 0.01,
        "+2% -> ecc " + high.pilotEcc.toExponential(2) + " side +1; -2% -> ecc " + low.pilotEcc.toExponential(2) + " side -1");
    const plunge = await buildProbe({ mode: "pilot", config: { L: 2.2, rTarget: 10, turns: 4 } });
    ok("far-low L plunges, reported loudly", plunge.pilotPlunged === true && plunge.pilotEcc === 1 && plunge.pilotSide === -1);
    const clamped = await buildProbe({ mode: "pilot", config: { L: 3.7, rTarget: 3, turns: 2 } });
    ok("a sub-ISCO target is clamped to the stable band -- the device refuses to grade an impossible mission",
        clamped.pilotTargetR >= 6.2, "rTarget 3 -> " + clamped.pilotTargetR);
}

// ---- 2. THE SPINAL CORD: reflex converges fast, through the REAL loop -------------------------------------------
{
    const out = await roundhouseDevice({ callModel: policyCaller(reflexPilotPolicy(), { rTarget: 10, eps: 1e-5 }), device: dev, question: "hold r=10", maxRounds: 20 });
    ok("!! the weightless reflex crystallises ecc < 1e-5 within 20 rounds (bisect-then-secant)",
        out.crystallized === true && out.rounds <= 12,
        out.rounds + " rounds, final ecc " + out.verdict.measured.toExponential(2) + " -- the floor every learned policy must beat");
}

// ---- 3. THE BRAIN: weights in brain/mlp.js's own format, refused until they learn -------------------------------
{
    const untrained = await roundhouseDevice({ callModel: policyCaller(brainPilotPolicy({ seed: 1337 }), { rTarget: 10, eps: 1e-6 }), device: dev, question: "q", maxRounds: 3 });
    ok("!! weights that have not learned are REFUSED by the physics like any other wrong proposer",
        untrained.crystallized === false,
        "3 rounds at eps 1e-6: no crystallisation -- being a neural network buys nothing at the verdict");

    const pol = brainPilotPolicy({ seed: 1337 });
    const trained = await roundhouseDevice({ callModel: policyCaller(pol, { rTarget: 10, eps: 2e-2 }), device: dev, question: "q", maxRounds: 30 });
    ok("!! the pinned seed learns to fly through the loop itself -- the roundhouse IS the training loop",
        trained.crystallized === true && trained.rounds <= 20,
        "crystallised in " + trained.rounds + " rounds; only teacher was the measured eccentricity");
    const layers = pol.layers();
    ok("...and the learned weights are in the GPU brain's layer-spec, ready for BatchedMLP verbatim",
        layers.every((l) => l.W instanceof Float32Array && l.b instanceof Float32Array && Number.isInteger(l.nIn) && Number.isInteger(l.nOut) && ["relu", "sigmoid", "none"].includes(l.act)),
        layers.map((l) => l.nIn + "x" + l.nOut + ":" + l.act).join(" -> "));
    const y1 = cpuForward(layers, [1, 0.5, 0.63]);
    const y2 = cpuForward(layers, [1, 0.5, 0.63]);
    ok("cpuForward is deterministic (same bits twice)", y1[0] === y2[0]);
}

// ---- 4. CONVERGENCE IS STOCHASTIC AND THE BAR SAYS SO -----------------------------------------------------------
{
    const seeds = [7, 1337, 42, 99, 2026, 5, 11, 314];
    let wins = 0;
    for (const seed of seeds) {
        const out = await roundhouseDevice({ callModel: policyCaller(brainPilotPolicy({ seed }), { rTarget: 10, eps: 2e-2 }), device: dev, question: "q", maxRounds: 80 });
        if (out.crystallized) wins++;
    }
    ok("!! at least 6 of 8 fixed seeds crystallise within 80 rounds -- the measured rate, asserted honestly",
        wins >= 6,
        wins + "/8 (calibration: 7/8, with seed 99 a slow tail at round 127 -- (1+1)-ES with restarts is search, not magic, and the bar is set where the measurement is, not where hope is)");
    ok("...and every seed's run is replayable (seeded RNG end to end)", mulberry32(7)() === mulberry32(7)());
}

// ---- 5. THE LIVE BRAIN BRIDGE: obeys when present, degrades honestly when killed --------------------------------
{
    const sent = [];
    const goodFetch = async (url, opts) => {
        sent.push({ url, body: JSON.parse(opts.body) });
        if (url.endsWith("/pilot")) return { ok: true, status: 200, json: async () => ({ L: circularL(1, 10) }) };
        return { ok: true, status: 200, json: async () => ({}) };
    };
    const bridged = await roundhouseDevice({
        callModel: policyCaller(brainBridgePolicy({ fetchImpl: goodFetch }), { rTarget: 10, eps: 1e-6 }),
        device: dev, question: "q", maxRounds: 2,
    });
    ok("!! a live brain answering the exact L crystallises through the SAME loop, no special path",
        bridged.crystallized === true && bridged.rounds === 1,
        "the bridge posted obs to /ai/brain/pilot and the sim confirmed the answer");
    ok("...and measured feedback is POSTed back to the brain (training signal flows sim -> brain, one way)",
        sent.some((s) => s.url.endsWith("/pilot/feedback") && typeof s.body.ecc === "number"));

    const deadFetch = async () => { throw new Error("ECONNREFUSED"); };
    const pol = brainBridgePolicy({ fetchImpl: deadFetch });
    const degraded = await roundhouseDevice({ callModel: policyCaller(pol, { rTarget: 10, eps: 1e-5 }), device: dev, question: "q", maxRounds: 20 });
    ok("!! a DEAD brain degrades to the reflex and the mission still crystallises -- kill it any time, the engine falls back",
        pol.isDegraded() === true && degraded.crystallized === true,
        "the GPU brain's own authority model, honoured by the seat it now sits in");
}

console.log();
if (fails) { console.log("policyPilot-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("policyPilot-selfcheck: all checks pass");
