// brain/room/tools/room-selfcheck.mjs -- v2227 -- proves the room navigation, now with TERRAIN.
//
// Drives the DOM-free RoomWorld with the SAME CPU Dijkstra solver the brain uses. Proves: the agent
// arrives, never enters a WALL (a cell it cannot stand on), never stalls -- in BOTH the flat
// walls-only room (go around) AND the terrain room (go UP AND OVER a climbable pass through a wall
// ridge). The rendering in brain-room.html is visual-only; the navigation is proven here.
//
//   node brain/room/tools/room-selfcheck.mjs

import { RoomWorld, WALL_H, FLOOR_LIFT, IMPASS_DH, RAMP_STEP, PEAK } from "../roomSim.js";
import { FlowFieldSolverCPU } from "../../flowfieldCpu.js";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -- " + extra : ""}`); };

async function solveFor(world) {
    const s = new FlowFieldSolverCPU(null, world.W, world.H, { cell: world.CELL, impassDh: IMPASS_DH });
    return await s.solve(world.solveHeights(), world.solveGoals(), { wantFlow: true, wantDist: true });
}

// Run one agent; a "wall" is a cell with height >= IMPASS_DH (can't stand on it). Track the max
// terrain height along the path (to prove it CLIMBED) and whether it crossed the mid ridge.
async function runEpisode(world, field, maxSteps = 8000) {
    const agent = world.spawnAgent();
    let arrived = false, hitWall = false, stalled = false, steps = 0, maxH = 0;
    const midWX = ((world.W / 2) | 0) * world.CELL; let sawLeft = false, sawRight = false;
    const dt = 0.05;
    for (; steps < maxSteps; steps++) {
        const st = world.stepAgent(agent, field, dt, 18);
        const c = world.cellAt(agent.x, agent.z);
        if (world.inb(c.gx, c.gy)) {
            const h = world.heights[world.idx(c.gx, c.gy)];
            if (h >= IMPASS_DH) hitWall = true;
            if (h > maxH) maxH = h;
        }
        if (agent.x < midWX - world.CELL) sawLeft = true;
        if (agent.x > midWX + world.CELL) sawRight = true;
        if (st === "arrived") { arrived = true; break; }
        if (st === "boxed-in" || st === "unreachable") { stalled = true; break; }
    }
    return { arrived, steps, hitWall, stalled, maxH, crossed: sawLeft && sawRight };
}

// -------------------------------------------------------------- 1. invariants (terrain default)
{
    const w = new RoomWorld({ seed: 1, W: 32, H: 32, CELL: 4 });
    ok("heights length is W*H", w.heights.length === 32 * 32);
    ok("spawn and goal are standable (not walls)", !w.isWall(w.spawn.gx, w.spawn.gy) && !w.isWall(w.goal.gx, w.goal.gy));
    ok("goal reachable from spawn (via the pass) by construction", w._reachable(w.spawn, w.goal));
    const body = w.snapshotBody();
    ok("snapshotBody has the brain protocol shape",
        body.w === 32 && body.h === 32 && body.impassDh === IMPASS_DH && Array.isArray(body.heights) && body.heights.length === 32 * 32 && body.goals.length === 1);
    ok("solveHeights lifts floors above water level", w.solveHeights()[0] === FLOOR_LIFT);
    ok("terrain room actually has climbable cells (0 < h < IMPASS_DH)", w.heights.some(h => h > 1 && h < IMPASS_DH));
    ok("terrain room has impassable walls (h >= IMPASS_DH)", w.heights.some(h => h >= IMPASS_DH));
    ok("isWall is slope-based: a ramp cell is NOT a wall", (() => { const i = w.heights.findIndex(h => h > 1 && h < IMPASS_DH); const gx = i % w.W, gy = (i / w.W) | 0; return w.isWall(gx, gy) === false; })());
}

// -------------------------------------------------------------- 2. FLAT room: go AROUND (unchanged behaviour)
{
    const N = 25; let arrivedAll = 0, wallHits = 0, stalls = 0;
    for (let seed = 1; seed <= N; seed++) {
        const world = new RoomWorld({ seed, W: 40, H: 40, CELL: 4, nBoxes: 16, mode: "flat" });
        const r = await runEpisode(world, await solveFor(world));
        if (r.arrived) arrivedAll++; if (r.hitWall) wallHits++; if (r.stalled) stalls++;
    }
    ok(`flat: agent arrives in all ${N} rooms`, arrivedAll === N, `${arrivedAll}/${N}`);
    ok("flat: never enters a wall", wallHits === 0);
    ok("flat: never stalls", stalls === 0);
}

// -------------------------------------------------------------- 3. TERRAIN room: go UP AND OVER
{
    const N = 25; let arrivedAll = 0, wallHits = 0, stalls = 0, climbedAll = 0, worst = 0;
    for (let seed = 1; seed <= N; seed++) {
        const world = new RoomWorld({ seed, W: 40, H: 40, CELL: 4 });   // default terrain
        const r = await runEpisode(world, await solveFor(world));
        if (r.arrived) arrivedAll++; if (r.hitWall) wallHits++; if (r.stalled) stalls++;
        if (r.maxH > PEAK * 0.5) climbedAll++;                          // it climbed well up the pass
        worst = Math.max(worst, r.steps);
    }
    ok(`terrain: agent arrives in all ${N} rooms`, arrivedAll === N, `${arrivedAll}/${N}, worst ${worst} steps`);
    ok("terrain: never enters a wall (stands on ramps, not walls)", wallHits === 0);
    ok("terrain: never stalls", stalls === 0);
    ok("terrain: agent CLIMBS the pass in every room (up and over)", climbedAll === N, `${climbedAll}/${N} climbed above ${(PEAK * 0.5) | 0}`);
}

// -------------------------------------------------------------- 4. a hand-built "must go over" ridge
{
    const w = new RoomWorld({ seed: 1, W: 24, H: 16, CELL: 4, mode: "flat" });
    w.heights.fill(0); w.boxes = [];
    const midX = 12, passY = 8, ramp = 5;
    for (let y = 0; y < 16; y++) if (Math.abs(y - passY) > 1) w.heights[w.idx(midX, y)] = WALL_H;   // full ridge, 3-wide gap
    for (let y = passY - 1; y <= passY + 1; y++) for (let dx = -ramp; dx <= ramp; dx++) { const x = midX + dx; if (x >= 0 && x < 24) w.heights[w.idx(x, y)] = Math.max(0, PEAK - RAMP_STEP * Math.abs(dx)); }
    w.spawn = { gx: 2, gy: passY }; w.goal = { gx: 21, gy: passY };
    ok("hand-built ridge: goal reachable only via the pass", w._reachable(w.spawn, w.goal));
    const field = await solveFor(w);
    const r = await runEpisode(w, field);
    ok("hand-built ridge: agent crosses to the goal", r.arrived && !r.hitWall, `arrived=${r.arrived} wall=${r.hitWall} steps=${r.steps}`);
    ok("hand-built ridge: agent climbed near the pass peak", r.maxH >= PEAK - RAMP_STEP, `maxH=${r.maxH} (peak ${PEAK})`);
    ok("hand-built ridge: agent was on BOTH sides of the ridge (went over)", r.crossed);
}

// -------------------------------------------------------------- 5. moving the goal still re-routes (terrain)
{
    const world = new RoomWorld({ seed: 9, W: 40, H: 40, CELL: 4 });
    let placed = false;
    for (let tries = 0; tries < 300 && !placed; tries++) {
        const gx = 2 + ((Math.random() * (world.W - 4)) | 0), gy = 2 + ((Math.random() * (world.H - 4)) | 0);
        if (!world.isWall(gx, gy) && world._reachable(world.spawn, { gx, gy })) placed = world.setGoal(gx, gy);
    }
    ok("placed a new reachable goal", placed);
    const r = await runEpisode(world, await solveFor(world));
    ok("agent reaches the moved goal", r.arrived && !r.hitWall, `arrived=${r.arrived} wall=${r.hitWall}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (typeof process !== "undefined") process.exit(fail ? 1 : 0);
