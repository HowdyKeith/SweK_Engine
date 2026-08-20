// brain/agent/flow-selfcheck.mjs
//
// Run: node brain/agent/flow-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The flow tactic: the agent navigating by the GPU brain's own flow-field solver (the CPU mirror, FlowFieldSolverCPU,
// the same one the fleet posts). This is the brain as the agent's EXECUTOR -- the tactic does not hand-code avoidance, it
// asks the brain for a field that routes around the threats and follows it. The field must point toward the goal, the
// agent must reach the goal by it, and over many arenas the brain's field must get the agent caught LESS often and
// scoring HIGHER than a naive dash, because it steers around the danger corridors the dash walks straight into. The
// sabotage inverts the flow-following so the agent fights the field instead of riding it -- it walks away from the goal,
// reaches nothing, and loses to the dash, because trusting the brain's field is the whole tactic. Async, so this is
// gated, not fingerprinted.
import { makeArena, runEpisode, solveArenaFlow, flowTacticFrom, solveArenaFlowPerTick, flowTacticPerTick, greedyPolicy, makeRng } from "./arena.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const sign = (v) => v < 0 ? -1 : v > 0 ? 1 : 0;

// ---- 1. THE BRAIN'S FIELD POINTS TOWARD THE GOAL ---------------------------------------------------
{
    const arena = makeArena(2024); const flow = await solveArenaFlow(arena);
    const si = arena.start[1] * flow.n + arena.start[0];
    const alignX = sign(flow.fx[si]) === sign(arena.goal[0] - arena.start[0]);
    ok("!! the solved flow field points from the start toward the goal", alignX || (flow.fx[si] === 0 && flow.fz[si] === 0),
       "at the start the field reads [" + flow.fx[si].toFixed(2) + ", " + flow.fz[si].toFixed(2) + "] -- down the distance gradient the brain computed toward the goal.");
}

// ---- 2. THE AGENT REACHES THE GOAL BY FOLLOWING THE FIELD ------------------------------------------
{
    const arena = makeArena(2024); const flow = await solveArenaFlow(arena);
    const r = runEpisode(arena, flowTacticFrom(flow), makeRng(1));
    ok("!! the agent reaches the goal by stepping along the brain's field", r.reachedGoal,
       "following the flow it arrives with reward " + r.reward + " -- the brain solved the navigation, the agent executed it.");
}

// ---- 3. THE BRAIN'S FIELD BEATS A NAIVE DASH (fewer caught, higher reward) -------------------------
{
    let flowCaught = 0, greedyCaught = 0, flowRew = 0, greedyRew = 0; const N = 60;
    for (let s = 0; s < N; s++) {
        const arena = makeArena((1000 + s * 7919) >>> 0); const flow = await solveArenaFlow(arena);
        const rf = runEpisode(arena, flowTacticFrom(flow), makeRng((s + 1) * 13));
        const rg = runEpisode(arena, greedyPolicy, makeRng((s + 1) * 13));
        if (rf.caught) flowCaught++; if (rg.caught) greedyCaught++; flowRew += rf.reward; greedyRew += rg.reward;
    }
    ok("!! the brain's field gets the agent caught less and scoring higher than a naive dash", flowCaught <= greedyCaught && flowRew > greedyRew,
       "over " + N + " arenas the flow tactic is caught " + flowCaught + " times to the dash's " + greedyCaught + " and scores " + flowRew + " to " + greedyRew + " -- it routes around the danger the dash charges through.");
}

// ---- 4. DETERMINISTIC ------------------------------------------------------------------------------
{
    const arena = makeArena(55); const f1 = await solveArenaFlow(arena), f2 = await solveArenaFlow(arena);
    const same = f1.fx.every((v, i) => v === f2.fx[i]) && f1.fz.every((v, i) => v === f2.fz[i]);
    ok("!! the solve is deterministic", same,
       "the same arena solves to the same field every call -- the brain's navigation replays, so it could join the fingerprint later if the solver's async signature were made sync.");
}

// ---- 5. RE-SOLVING PER TICK (MOVING WALLS) BEATS THE STATIC FIELD ----------------------------------
{
    let statR = 0, pertR = 0, statC = 0, pertC = 0; const N = 40;
    for (let s = 0; s < N; s++) {
        const arena = makeArena((1000 + s * 7919) >>> 0);
        const sf = await solveArenaFlow(arena), pt = await solveArenaFlowPerTick(arena);
        const rs = runEpisode(arena, flowTacticFrom(sf), makeRng((s + 1) * 13));
        const rp = runEpisode(arena, flowTacticPerTick(pt), makeRng((s + 1) * 13));
        statR += rs.reward; pertR += rp.reward; if (rs.caught) statC++; if (rp.caught) pertC++;
    }
    ok("!! re-solving the field each tick (threats as moving walls) beats the static field", pertR > statR && pertC <= statC,
       "over " + N + " arenas per-tick scores " + pertR + " to the static field's " + statR + " and is caught " + pertC + " to " + statC + " -- the route bends around where the threats ARE, not their whole corridor.");
}

console.log(fails ? "\nflow-selfcheck: " + fails + " FAILED" : "\nflow-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
