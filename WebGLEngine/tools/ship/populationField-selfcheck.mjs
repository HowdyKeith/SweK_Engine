// tools/ship/populationField-selfcheck.mjs
//
// Run: node tools/ship/populationField-selfcheck.mjs   (instant)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3118 -- POPULATION STATE AS A TEXTURE, AND THE ARITHMETIC OF GETTING AN ANSWER BACK OUT.
//
// Keith's design: population state in a large texture, stepped on the GPU, rendered to a target, pixels read
// back to decide what spawns and where. The pattern is right. The GPU half cannot be exercised here -- no
// WebGL, no device -- so it is not written yet. WHAT IS WRITTEN IS EVERYTHING THAT DECIDES ANYTHING, which is
// the same split v3116 made for the face worker and for the same reason.
//
// *** THE READBACK IS THE WHOLE PROBLEM. *** gl.readPixels on a 1024x1024 RGBA32F target is 16 MB AND A
// GPU-TO-CPU STALL: the pipeline drains and the frame is gone. That is this tree's oldest lesson for the FOURTH
// time -- the poller, /sync/status walking the asset tree on the server thread, detectForVideo blocking a rAF
// tick, and now this. Reducing to 32-square tiles first turns 1,048,576 texels into 1024, and the measurement
// below says what that is worth.
//
// AND THE RULE THAT MATTERS MOST: A READBACK THAT NEVER LANDS MUST READ AS UNKNOWN, NEVER AS AN ANSWER.
// Spawning on a stalled pipeline invents population from nothing; NOT spawning on it gives a world that quietly
// stops growing and looks like a design choice. Both are wrong. The caller has to be told which it is in.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { codeOnly } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);

const P = await import(pathToFileURL(path.join(ENG, "sim", "populationField.js")).href);
const src = codeOnly(fs.readFileSync(path.join(ENG, "sim", "populationField.js"), "utf8"));

// ---- 1. WHAT THE REDUCTION BUYS ------------------------------------------------------------------------------------
{
    const f = P.fieldPlan({ side: 1024 }), t = P.tilePlan(f, { tile: 32 });
    const c = P.readbackCost(f, t);
    say("1024-square field = " + f.slots.toLocaleString() + " slots, " + (f.bytes / 1048576).toFixed(0) +
        " MB full readback; 32-square tiles = " + t.tiles + " numbers, " + (t.bytes / 1024).toFixed(0) + " KB. " +
        "Reduction " + c.ratio.toFixed(0) + "x.");
    ok("!! reducing before readback is worth two orders of magnitude",
        c.ratio > 100,
        "16 MB and a sync stall versus 16 KB. You do not need a million texels to answer 'how many should " +
        "spawn and roughly where' -- you need per-region counts, which is what a tiling IS");

    ok("...and the current population makes the scale argument",
        fs.readFileSync(path.join(ENG, "simulation", "AmbientNPCs.js"), "utf8").includes("start(count = 12)"),
        "simulation/AmbientNPCs.js manages TWELVE NPCs in a plain array on the main thread. The field is " +
        f.slots.toLocaleString() + " slots -- five orders of magnitude, which is the only reason the readback " +
        "discipline is worth having. At twelve, none of this would be");
}

// ---- 2. THE GEOMETRY REFUSES TO LOSE AGENTS ------------------------------------------------------------------------
{
    let threwSide = false, threwTile = false;
    try { P.fieldPlan({ side: 1000 }); } catch { threwSide = true; }
    try { P.tilePlan(P.fieldPlan({ side: 1024 }), { tile: 33 }); } catch { threwTile = true; }
    ok("!! a field that tiles unevenly is REFUSED at the plan, not at the edge",
        threwSide && threwTile,
        "a 1000-square field with 32-square tiles leaves an 8-pixel margin whose agents are silently never " +
        "counted -- and a population that under-reports only at the edges is the hardest kind of bug to see");

    const s = P.packSlot(1234, true), u = P.unpackSlot(s);
    ok("!! the slot packing INVERTS exactly",
        u.kind === 1234 && u.alive === true && P.unpackSlot(P.packSlot(0, false)).alive === false,
        "RGB is spoken for by position, so kind and liveness share A. An encoding you cannot invert is a place " +
        "for state to rot");
}

// ---- 3. A SHORT BUFFER IS NOT AN EMPTY WORLD -------------------------------------------------------------------------
{
    const f = P.fieldPlan({ side: 256 }), t = P.tilePlan(f, { tile: 32 });
    let threw = false;
    try { P.spawnIntents(new Float32Array(3), t, {}); } catch { threw = true; }
    ok("!! a wrong-sized readback THROWS rather than reporting no spawns",
        threw,
        "returning [] would read as 'nothing to spawn' when the truth is 'the readback was the wrong size', " +
        "and the population would quietly stop growing while every log stayed clean");

    const counts = new Float32Array(t.tiles).fill(8); counts[5] = 0; counts[9] = 3;
    const ints = P.spawnIntents(counts, t, { target: 8 });
    ok("...and a correct one yields the deficits, biggest first",
        ints.length === 2 && ints[0].spawn === 8 && ints[1].spawn === 5 && ints[0].tx === 5,
        JSON.stringify(ints));
}

// ---- 4. THE RULE THAT MATTERS MOST ------------------------------------------------------------------------------------
{
    const f = P.fieldPlan({ side: 256 }), t = P.tilePlan(f, { tile: 32 });
    const counts = new Float32Array(t.tiles).fill(0);
    const silent = P.intentsOrUnknown("silent", counts, t, {});
    const idle = P.intentsOrUnknown("idle", null, t, {});
    const alive = P.intentsOrUnknown("alive", counts, t, { target: 4 });

    ok("!! a SILENT readback pipeline reports UNKNOWN, not zero spawns",
        silent.known === false && silent.intents === null && /unknown/i.test(silent.why),
        "spawning on a stalled pipeline invents population from nothing; refusing to spawn gives a world that " +
        "quietly stops growing and LOOKS LIKE A DESIGN CHOICE. The caller is told which situation it is in");

    ok("...IDLE is distinguished from SILENT",
        idle.known === false && /no readback has landed yet/.test(idle.why) && idle.why !== silent.why,
        "'nothing has happened yet' is not a fault, and reporting it as one makes every startup look broken");

    ok("...and an ALIVE pipeline with genuinely empty tiles DOES spawn",
        alive.known === true && alive.intents.length === t.tiles,
        "the whole point of separating them: an empty world and an unreadable one produce opposite actions");
}

// ---- 5. IT DOES NOT CLONE THE PUMP -----------------------------------------------------------------------------------
{
    ok("!! the readback lifecycle is NOT reimplemented here",
        !/inFlight|shouldSend|setInterval/.test(src) && /detectPump/.test(fs.readFileSync(path.join(ENG, "sim", "populationField.js"), "utf8")),
        "face/detectPump.js already decides exactly this -- at most one request in flight, drop rather than " +
        "queue, idle/alive/silent kept apart. A GPU FENCE AND A WORKER REPLY ARE THE SAME PROBLEM WEARING " +
        "DIFFERENT HARDWARE, and a second copy would drift from the first. FIVE INSTANCES OF ONE SHAPE IS A " +
        "MISSING PRIMITIVE -- this is the second, and the primitive already existed");
    console.log("  NOTE   NOT BUILT AND NOT CLAIMED: the ping-pong textures, the update shader, the tile reduction");
    console.log("         pass, and the PBO + fenceSync readback itself. Those need a device. What is here is the");
    console.log("         arithmetic and the decisions -- and the boundary is worth stating: A TILE COUNT GIVES");
    console.log("         HOW MANY AND ROUGHLY WHERE, NEVER WHICH. Exact per-agent identity needs a prefix sum or");
    console.log("         an append buffer, which is a bigger structure and a different round.");
}

// ---- 6. THE FRONT DOOR -----------------------------------------------------------------------------------------------
// v3115 cost a whole version establishing that a module with no caller is unfinished work wearing a finished
// shape. This one ships with its page in the same round.
{
    const page = fs.readFileSync(path.join(ENG, "population.html"), "utf8");
    ok("!! the module has a page",
        /from "\/sim\/populationField\.js"/.test(page) && /readbackCost/.test(page),
        "population.html is a PLANNER, not a simulation -- it answers the question that decides whether the " +
        "design is affordable at all, which is how many bytes have to cross the bus per decision");
    ok("...and the page states what a tile count CANNOT tell you",
        /never <i>which<\/i>/.test(page) && /prefix\s+sum\s+or\s+an\s+append\s+buffer/.test(page),
        "how many and roughly where, never WHICH. A reader who discovers that limit after building on it has " +
        "been misled by an omission");
    ok("...and that the GPU half is not built",
        /is <i>not built yet<\/i>/.test(page),
        "the ping-pong textures, update shader, reduction pass and PBO readback need a device. Saying so on " +
        "the page is the difference between a plan and a claim");
}

// ---- 7. v3123: THE SPAWN SIDE IS WIRED --------------------------------------------------------------------------------
// spawnIntents has produced intents since v3118 and NOTHING CONSUMED THEM. The field could report crowding and
// could not act on it, which is a system in the shape of one half.
{
    const f = P.fieldPlan({ side: 8 }), t = P.tilePlan(f, { tile: 4 });
    const counts = new Float32Array(t.tiles); counts[0] = 1; counts[1] = 16; counts[2] = 0; counts[3] = 0;
    const free   = new Float32Array(t.tiles); free[0] = 3; free[1] = -1; free[2] = 32; free[3] = 36;
    const intents = P.spawnIntents(counts, t, { target: 4 });
    const mk = (tx, ty, slot) => ({ x: tx * 4, y: ty * 4, z: 0, packed: P.packSlot(7, true) });
    const writes = P.planSpawns(intents, free, t, mk).writes;   // v3149 -- planSpawns returns a REPORT now, not a bare array

    ok("!! intents become CONCRETE SLOT WRITES",
        writes.length === 3 && writes.every((w) => Number.isInteger(w.slot) && w.slot >= 0),
        JSON.stringify(writes.map((w) => w.slot)) + ". The reduction reports a free slot per tile ON THE PASS " +
        "THAT ALREADY COUNTS -- the answer was being computed and thrown away, the same shape as v3104's " +
        "rr.bytes and v3114's blendshapes");

    ok("!! a FULL tile reports -1 and is skipped, never spawned into",
        !writes.some((w) => w.slot === -1) && counts[1] === 16 && free[1] === -1,
        "spawning into a full tile would OVERWRITE A LIVING AGENT, and the symptom -- population stable while " +
        "births are reported -- would look like the birth rule not working");

    ok("!! the budget is enforced HERE, not trusted to the caller",
        P.planSpawns(intents, free, t, mk, { budget: 1 }).writes.length === 1,
        "one texel per GL call is the right tool for placing a handful of agents AND it is unbounded if nobody " +
        "bounds it");

    ok("...and the caller owns what an agent IS",
        P.planSpawns(intents, free, t, (tx) => ({ x: 99, y: 0, z: 0, packed: 3 })).writes[0].x === 99,
        "this module knows about crowding and slots. It knows nothing about where a game wants its creatures " +
        "or what kind they are, and inventing that here would put game design in a spatial index");

    // *** THE RATE LIMIT IS STATED, NOT HIDDEN. ***
    ok("!! one free slot per tile per readback is a REAL rate limit and is written down",
        /ONE FREE SLOT PER TILE PER READBACK IS A REAL RATE LIMIT/.test(fs.readFileSync(path.join(ENG, "sim", "populationField.js"), "utf8")),
        "a tile needing eight agents gets ONE per cycle, so a sparse world fills over several cycles rather " +
        "than in a frame. That is the price of buying the free slot for nothing, and somebody watching the " +
        "fill rate deserves to find the reason in the file rather than in a profiler");
}

// ---- v3149: THE SHORTFALL IS RETURNED, AND A SLOT IS NEVER USED TWICE -------------------------------------------
{
    const f2 = P.fieldPlan({ side: 64 }), t2 = P.tilePlan(f2, { tile: 32 });
    const ints = P.spawnIntents(new Float32Array(t2.tiles), t2, { target: 8 });
    const free2 = new Float32Array(t2.tiles).map((_, i) => i * 10);
    const r = P.planSpawns(ints, free2, t2, () => ({ x: 0, y: 0, z: 0, packed: 3 }));

    ok("!! a tile wanting eight gets ONE, and the return value SAYS SO",
        r.wanted === 32 && r.delivered === 4 && r.unmet === 28 && r.limitedBy === "one-slot-per-tile",
        "wanted " + r.wanted + ", delivered " + r.delivered + ", unmet " + r.unmet + ". The rate limit is " +
        "DELIBERATE -- the free slot rides along on a pass that was already counting, and finding N free slots " +
        "per tile needs a prefix sum and a different round. But the return used to be a BARE ARRAY, so a " +
        "caller saw four writes and could not tell thirty-two births were asked for. A WORLD GROWING EIGHT " +
        "TIMES SLOWER THAN ITS POLICY INTENDS LOOKS EXACTLY LIKE A WORLD WHOSE POLICY IS WORKING");

    ok("!! two intents in ONE tile do not share a slot",
        (() => {
            const d = P.planSpawns([{ tx: 0, ty: 0, spawn: 2 }, { tx: 0, ty: 0, spawn: 2 }],
                new Float32Array([100, 0, 0, 0]), t2, () => ({ x: 0, y: 0, z: 0, packed: 3 }));
            return d.writes.length === 1 && d.noSlot === 1;
        })(),
        "MEASURED BEFORE THE FIX: three intents where two shared a tile planned slots [100, 100, 200] -- the " +
        "second write would overwrite the first, giving ONE agent for TWO births while the caller counted two. " +
        "spawnIntents emits one intent per tile so this is unreachable from it TODAY; planSpawns is EXPORTED, " +
        "takes any intent list, and would have been silently wrong for the next caller");

    ok("...and the budget is reported as the limit when IT is what bit",
        (() => { const b = P.planSpawns(ints, free2, t2, () => ({ x: 0, y: 0, z: 0, packed: 3 }), { budget: 2 });
                 return b.cappedAt === 2 && b.limitedBy === "budget" && b.delivered === 2; })(),
        "'we ran out of free slots' and 'we hit our own cap' are two different worlds -- one needs a bigger " +
        "field, the other a bigger number");
}

console.log();
if (fails) { console.log("populationField-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("populationField-selfcheck: all checks pass");
