// WebGLEngine/brain/tickStamp-selfcheck.mjs — v2549
//
// Run: node brain/tickStamp-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// THE CHAIN THAT MAKES TWO MACHINES COMPARABLE:
//
//     RoomWorld.advance()  ->  snapshotBody().tick  ->  the bridge's stored snapshot  ->  brain  ->  trace record
//
// Before v2549 the trace carried only `seq`: a per-process counter, the order THIS brain decided things. Two
// peers resolve outcomes as the network delivers them, so seq 400 here and seq 400 there are NOT the same moment.
// Diffing them produces a confident, meaningless answer -- which is worse than no answer, because you would
// believe it.
//
// The tick had to come from the engine and nowhere else. The page drives the loop; stepAgent moves ONE agent; the
// bridge only relays. NOTHING OWNED A CLOCK BECAUSE NOTHING OWNED THE ADVANCE. A tick invented downstream would
// be a number about the relay, not about the world.
//
// The most important assertion in this file is the last one: A TICKLESS RECORD MUST OMIT THE FIELD, not write 0.
// null is not tick 0, and a trace that quietly claims tick 0 for everything would let two machines be "aligned"
// at a moment neither of them was in.
import { RoomWorld } from "./room/roomSim.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. the sim owns a clock ---------------------------------------------------------------------------------
{
    const w = new RoomWorld({});
    w.generate(42);
    ok("a fresh world starts at tick 0", w.tick === 0, "tick " + w.tick);
    ok("advance() returns the new tick", w.advance() === 1);
    for (let i = 0; i < 4; i++) w.advance();
    ok("...and it is monotonic", w.tick === 5, "5 advances -> tick " + w.tick);
}

// ---- 2. THE CLOCK COUNTS FRAMES, NOT AGENTS ------------------------------------------------------------------
// This is why advance() is not folded into stepAgent(). Ten agents in one frame is ONE tick. A clock that counts
// agents is not a clock, and two machines with different agent counts would drift apart while both were "right".
{
    const w = new RoomWorld({});
    w.generate(7);
    w.advance();
    const before = w.tick;
    w.spawnAgent(); w.spawnAgent(); w.spawnAgent();
    ok("SPAWNING AGENTS DOES NOT MOVE THE CLOCK", w.tick === before, "tick " + w.tick + " after 3 spawns");
}

// ---- 3. the snapshot carries it (link 2 of the chain) --------------------------------------------------------
{
    const w = new RoomWorld({});
    w.generate(11);
    for (let i = 0; i < 3; i++) w.advance();
    const body = w.snapshotBody();
    ok("snapshotBody() carries the tick", body.tick === 3, "snapshot says tick " + body.tick);
    ok("...and it is JSON-safe (it crosses the wire as JSON)", JSON.parse(JSON.stringify(body)).tick === 3);
    ok("...and the rest of the snapshot still has its shape",
       body.w > 0 && body.h > 0 && Array.isArray(body.goals) && body.heights.length === body.w * body.h,
       body.w + "x" + body.h + ", " + body.heights.length + " heights, " + body.goals.length + " goal(s)");
}

// ---- 4. two worlds at the same tick are AT the same tick ------------------------------------------------------
// The whole point. Same seed, same advances -> the same clock, and the SAME WORLD, so a diff at tick N is a diff
// about the brains and not about the moment.
{
    const a = new RoomWorld({}), b = new RoomWorld({});
    a.generate(99); b.generate(99);
    for (let i = 0; i < 12; i++) { a.advance(); b.advance(); }
    ok("TWO WORLDS, SAME SEED, SAME ADVANCES -> THE SAME TICK", a.tick === b.tick, "both at " + a.tick);
    const ha = JSON.stringify(a.snapshotBody().heights), hb = JSON.stringify(b.snapshotBody().heights);
    ok("...and the same world (so a diff at tick N is about the BRAINS)", ha === hb,
       ha === hb ? "heights identical" : "the worlds diverged -- a tick would align two DIFFERENT rooms, which is worse than no tick");
}

// ---- 5. THE ONE THAT MATTERS: a tickless record OMITS the field -----------------------------------------------
// trace.mjs writes `...(tick != null ? { tick } : {})`. If that ever becomes `tick: tick ?? 0`, a page with no
// world would claim tick 0 for every decision, and two machines could be "aligned" at a moment neither was in.
{
    const src = (await import("node:fs")).readFileSync(new URL("./trace.mjs", import.meta.url), "utf8");
    ok("trace.mjs OMITS tick when there is none (null is not tick 0)",
       /\.\.\.\(tick != null \? \{ tick \} : \{\}\)/.test(src),
       "a source that does not own a world does not get to invent one");
    ok("...and traceDecision accepts a tick at all", /traceDecision\(\{[^}]*\btick\b/.test(src));
    ok("...and `seq` is still there (it is the within-session order, and replay needs it)", /seq: _n/.test(src));
}

console.log(fails ? "\ntickStamp-selfcheck: " + fails + " FAILED" : "\ntickStamp-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
