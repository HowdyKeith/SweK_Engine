// physics/lockstep-selfcheck.mjs
//
// Run: node physics/lockstep-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Lockstep has two halves and the gate proves both. Determinism: two peers handed the same input timeline compute
// byte-identical state every frame, so they stay in perfect step on nothing but a trickle of inputs. Detection: when
// one peer's state differs -- here, an extra impulse on one frame -- the per-frame checksum catches it and names the
// exact frame it happened, so a desync is a located bug rather than a silent unravelling. Two capabilities fall out of
// the same headless step function: replay, where a recorded timeline reproduces the match bit-for-bit, and catch-up,
// where a peer behind by many frames fast-forwards through them instantly to rejoin. The sabotage blinds the detector
// so it always reports in-sync, and the desync check fails -- an undetected desync is the exact silent failure lockstep
// exists to prevent.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeSession, stepFrame, runTimeline, firstDivergence, verifyLockstep } from "./lockstep.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const BODIES = [{ m: 1, r: [-1, 0, 0], v: [0, -0.3, 0] }, { m: 1, r: [1, 0, 0], v: [0, 0.3, 0] }, { m: 0.5, r: [0, 1.2, 0], v: [0.4, 0, 0] }];
const fresh = () => BODIES.map((b) => ({ ...b, r: [...b.r], v: [...b.v] }));
const timeline = (extra) => { const T = []; for (let f = 0; f < 600; f++) { const inp = []; if (f === 100) inp.push({ body: 0, dvx: 0.05 }); if (f === 300) inp.push({ body: 1, dvy: 0.05 }); if (extra && f === extra.frame) inp.push(extra.input); T.push(inp); } return T; };

// ---- 1. SYNC: two peers on the same inputs stay byte-identical every frame -------------------------------
{
    const v = verifyLockstep(fresh(), timeline(), { dt: 0.01 });
    ok("!! two peers on the same inputs stay in perfect lockstep", v.inSync && v.desyncFrame === -1,
       "over " + v.frames + " frames the two peers' state hashes match every single frame -- same inputs, same physics, byte-identical, so they run together on a trickle of bandwidth.");
}

// ---- 2. DESYNC LOCALISED: a divergence is caught at the exact frame --------------------------------------
{
    const A = runTimeline(makeSession(fresh(), { dt: 0.01 }), timeline());
    const B = runTimeline(makeSession(fresh(), { dt: 0.01 }), timeline({ frame: 250, input: { body: 2, dvx: 0.001 } }));
    const d = firstDivergence(A, B);
    ok("!! a desync is caught at the exact frame it happens", d === 250,
       "an extra impulse on one peer at frame 250 makes the hashes first differ at frame " + d + " -- the checksum turns a silent desync into a named frame.");
}

// ---- 3. REPLAY: a recorded timeline reproduces the match bit-for-bit -------------------------------------
{
    const T = timeline();
    const live = runTimeline(makeSession(fresh(), { dt: 0.01 }), T);
    const replay = runTimeline(makeSession(fresh(), { dt: 0.01 }), T);   // same inputs, replayed
    ok("!! a recorded input timeline replays bit-for-bit", firstDivergence(live, replay) === -1 && live[live.length - 1] === replay[replay.length - 1],
       "replaying the recorded inputs reproduces every frame's hash exactly -- a whole match stored as a few numbers per frame and played back to the bit.");
}

// ---- 4. CATCH-UP: a peer behind fast-forwards through queued inputs to rejoin ----------------------------
{
    const T = timeline();
    const ahead = makeSession(fresh(), { dt: 0.01 }); for (let f = 0; f < 600; f++) stepFrame(ahead, T[f]);
    const behind = makeSession(fresh(), { dt: 0.01 }); for (let f = 0; f < 200; f++) stepFrame(behind, T[f]);   // 400 frames behind
    for (let f = 200; f < 600; f++) stepFrame(behind, T[f]);                                                     // fast-forward the queue
    ok("!! a peer behind can fast-forward through its input queue and rejoin", ahead.hashes[599] === behind.hashes[599],
       "a peer 400 frames behind replays its queued inputs headless and lands on the identical state -- the catch-up that makes real lockstep survivable.");
}

// ---- 5. DETERMINISTIC + pure + genuinely headless (fast) ------------------------------------------------
{
    const N = 8000, S = makeSession(fresh(), { dt: 0.01 }), empty = Array.from({ length: N }, () => []);
    const t0 = Date.now(); runTimeline(S, empty); const fps = N / ((Date.now() - t0) / 1000 || 0.001);
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "lockstep.js"), "utf8").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const clean = !/Math\.(sin|cos|tan|exp|log|pow|hypot|random|acos|asin|atan)\b/.test(src);
    ok("!! lockstep runs headless far faster than realtime and is pure", fps > 60 * 20 && clean,
       "with no render the session runs about " + Math.round(fps).toLocaleString() + " frames/sec, over " + Math.round(fps / 60) + "x realtime, in +,-,*,/ and sqrt -- the same step that syncs two peers also fast-forwards, replays, and simulates ahead.");
}

console.log(fails ? "\nlockstep-selfcheck: " + fails + " FAILED" : "\nlockstep-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
