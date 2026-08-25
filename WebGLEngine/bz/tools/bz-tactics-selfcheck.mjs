// bz/tools/bz-tactics-selfcheck.mjs — the tank policy, and the wall around it.
//
//   node bz/tools/bz-tactics-selfcheck.mjs
//
// There are two policies now: Endless Sky's, which scores a hostile ship, and BZFlag's, which scores an
// enemy tank. They share every line of the maths (brain/linearPolicy.js) and not one feature. That is the
// whole design, and this file is where it is checked from both sides:
//
//   * a tank's sample offered to the ship policy is REJECTED
//   * a ship's sample offered to the tank policy is REJECTED
//
// Not warned about, not clipped, not averaged in with a zero. Rejected. Feeding a tank's `exposed` to a
// model trained on a ship's `weakness` would corrupt a working policy with a number that is not about
// anything, and the corruption would be invisible: the weights would still be finite, still in band, still
// served. The only defence is a schema, and the only proof is a test that tries it.
//
// The learner itself was proved in brain/tools/tactics-policy-selfcheck.mjs and is not re-proved here. What
// is re-proved is that it still behaves the same way through a different schema -- in particular that the
// gradient is AVERAGED, not summed, so eighty identical samples do not drive a weight into its clamp.

import { createServer } from "http";
import { shutdownServer, liveHandles } from "../../tools/ship/serverShutdown.mjs";
import { setTimeout as sleep } from "timers/promises";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// A private state dir, so the test never touches a real pilot's learned policy.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "bztactics-"));
process.env.BRAIN_STATE_DIR = TMP;

const bz = require("../../brain/bzTacticsPolicy.js");
const es = require("../../brain/tacticsPolicy.js");
const { makePolicy } = require("../../brain/linearPolicy.js");
const bridge = require("../../ai-bridge/bzTacticsBridge.js");

const F = (near, ahead, exposed, airborne) => ({ near, ahead, exposed, airborne });
const ESF = (reach, weakness, threat, isPlayer, focus) => ({ reach, weakness, threat, isPlayer, focus });

// --- 1. the wall ------------------------------------------------------------------------------------
{
    ok("the tank policy accepts a tank's features", bz.isFeat(F(0.9, 0.8, 1, 0)));
    ok("...and rejects a ship's", !bz.isFeat(ESF(1, 0.5, 0.2, 0, 0)));
    ok("the ship policy accepts a ship's features", es.isFeat(ESF(1, 0.5, 0.2, 0, 0)));
    ok("...and rejects a tank's", !es.isFeat(F(0.9, 0.8, 1, 0)));
    ok("neither accepts junk", !bz.isFeat(null) && !bz.isFeat({}) && !bz.isFeat({ near: NaN, ahead: 1, exposed: 1, airborne: 0 }));
    ok("a partial tank sample is not half-accepted", !bz.isFeat({ near: 1, ahead: 1, exposed: 1 }));

    ok("the two schemas name different weights", bz.W_KEYS.join() !== es.W_KEYS.join());
    ok("...and different features", bz.F_KEYS.join() !== es.F_KEYS.join());
    ok("...and share not one of them", !bz.F_KEYS.some((k) => es.F_KEYS.includes(k)));
    ok("they live in different files on disk", bridge._file() !== path.join(TMP, "tactics_policy.json"));
    ok("...and the tank's is named for the tank", /bz_tactics_policy\.json$/.test(bridge._file()));
}

// --- 2. the hand policy is the pilot's ------------------------------------------------------------------
{
    const w = bz.defaultWeights();
    ok("five weights, one of them a bias", bz.W_KEYS.length === 5 && bz.W_KEYS[0] === "wBias");
    ok("the hand policy prefers a near target", w.wNear > 0);
    ok("...one it is already pointing at", w.wAhead > 0);
    ok("...one it can actually shoot", w.wExposed > 0);
    ok("...and avoids a jumping one -- a guess the learner may yet overturn", w.wAirborne < 0);

    ok("score is a plain dot product: no gate", close(bz.score({ wBias: 1, wNear: 2, wAhead: 3, wExposed: 4, wAirborne: 5 }, F(1, 1, 1, 1)), 15));
    ok("...unlike the ship policy, where `reach` multiplies everything", es.score(es.defaultWeights(), ESF(0, 1, 1, 1, 1)) === 0);
    ok("a tank out of range is still a target, only a worse one", bz.score(bz.defaultWeights(), F(0, 1, 1, 0)) > 0);
}

// --- 3. the contrastive update, through this schema --------------------------------------------------------
{
    const hand = bz.defaultWeights();
    ok("no counterfactual, no gradient", bz.update(hand, F(1, 1, 1, 0), null, 1).applied === false);
    ok("...and it says why", bz.update(hand, F(1, 1, 1, 0), null, 1).reason === "no counterfactual");
    ok("no reward, no gradient", bz.update(hand, F(1, 1, 1, 0), F(0, 0, 0, 0), 0).applied === false);

    // A death after choosing the AIRBORNE target teaches: airborne is worse than the hand thought.
    const chosen = F(0.5, 0.5, 1, 1), alt = F(0.5, 0.5, 1, 0);
    const worse = bz.update(hand, chosen, alt, -1, 0.1);
    ok("dying on an airborne target pushes wAirborne down", worse.weights.wAirborne < hand.wAirborne);
    ok("...and moves nothing else, because nothing else differed",
        close(worse.weights.wNear, hand.wNear) && close(worse.weights.wExposed, hand.wExposed));

    const better = bz.update(hand, chosen, alt, +1, 0.1);
    ok("killing one pushes it up", better.weights.wAirborne > hand.wAirborne);
    ok("the bias never moves: its feature is the same 1 on both sides", close(better.weights.wBias, hand.wBias));

    // The clamp.
    let w = hand;
    for (let i = 0; i < 500; i++) w = bz.update(w, F(1, 1, 1, 1), F(0, 0, 0, 0), 1, 0.5).weights;
    ok("weights are clamped to the policy's band, not run away", bz.W_KEYS.every((k) => w[k] <= 4 && w[k] >= -2));
}

// --- 4. AVERAGED, NOT SUMMED -------------------------------------------------------------------------------
{
    // The lesson the ES policy learned the hard way in v2167: eighty identical samples drove one weight
    // straight into its clamp. A policy should encode how CONSISTENT the evidence is, not how much of it
    // there happens to be. Ten decisions that all agree carry the same lesson as a thousand.
    const one = [{ chosen: F(1, 0, 0, 0), alt: F(0, 0, 0, 0), reward: 1 }];
    const many = Array.from({ length: 200 }, () => one[0]);
    const a = bz.trainAll(one).weights, b = bz.trainAll(many).weights;
    ok("ten identical decisions and a thousand teach the same thing", close(a.wNear, b.wNear));
    ok("...which is the hand weight plus the gain", close(a.wNear, bz.defaultWeights().wNear + 2.0));

    // Evenly split evidence moves nothing.
    const split = [
        { chosen: F(1, 0, 0, 0), alt: F(0, 0, 0, 0), reward: 1 },
        { chosen: F(1, 0, 0, 0), alt: F(0, 0, 0, 0), reward: -1 },
    ];
    ok("evidence that contradicts itself moves nothing", close(bz.trainAll(split).weights.wNear, bz.defaultWeights().wNear));
    ok("samples with no counterfactual are not counted", bz.trainAll([{ chosen: F(1, 1, 1, 1), reward: 1 }]).applied === 0);
    ok("...nor are those with no reward", bz.trainAll([{ chosen: F(1, 0, 0, 0), alt: F(0, 0, 0, 0), reward: 0 }]).applied === 0);
    ok("an empty buffer trains to the hand policy", close(bz.trainAll([]).weights.wNear, bz.defaultWeights().wNear));
}

// --- 5. one learner, two schemas, and it is really the same learner -------------------------------------------
{
    // A third schema with the same shape must behave identically. If it does not, `makePolicy` is not a
    // learner, it is two learners that happen to look alike.
    const toy = makePolicy({
        name: "toy",
        W_KEYS: ["wBias", "wA"], F_KEYS: ["a"],
        featVector: (f) => [1, f.a || 0],
        defaultWeights: () => ({ wBias: 0, wA: 1 }),
        score: (w, f) => w.wBias + w.wA * (f.a || 0),
        W_MIN: -2, W_MAX: 4, GAIN: 2.0,
    });
    ok("a fresh schema learns the same way", close(toy.trainAll([{ chosen: { a: 1 }, alt: { a: 0 }, reward: 1 }]).weights.wA, 3));
    ok("...clamps the same way", toy.trainAll(Array.from({ length: 5 }, () => ({ chosen: { a: 10 }, alt: { a: 0 }, reward: 1 }))).weights.wA === 4);
    ok("...and walls itself off the same way", !toy.isFeat(F(1, 1, 1, 1)));
}

// --- 6. the bridge, over real HTTP -------------------------------------------------------------------------
{
    const srv = createServer((req, res) => {
        if (bridge.owns(req.url)) return bridge.handle(req, res, {});
        res.writeHead(404); res.end();
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const base = "http://127.0.0.1:" + srv.address().port + "/ai/brain/bz/tactics";
    const get = async () => (await fetch(base)).json();
    const post = async (body) => (await (await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json());

    await fetch(base + "/reset", { method: "POST" });
    let j = await get();
    ok("a fresh policy is not trained", j.trained === false && j.source === "hand");
    ok("...and serves NO weights, rather than half-learned ones", j.weights === null);
    ok("...but tells you the hand policy it is using", j.handWeights.wNear === bz.defaultWeights().wNear);
    ok("...and which features it speaks", j.features.join() === "near,ahead,exposed,airborne");
    ok("...and says it is the tank policy", j.policy === "bz");

    // THE WALL, over HTTP.
    let r = await post({ samples: [{ chosen: ESF(1, 0.5, 0.2, 0, 0), alt: ESF(1, 0.1, 0, 0, 0), reward: 1 }] });
    ok("a SHIP's sample posted to the tank policy is rejected", r.taken === 0 && r.rejected === 1);
    ok("...and the buffer is untouched", r.samples === 0);

    r = await post({ samples: [{ chosen: F(1, 1, 1, 0), alt: F(0, 0, 0, 0), reward: 1 }] });
    ok("a tank's sample is taken", r.taken === 1 && r.rejected === 0);
    r = await post({ samples: [{ chosen: F(1, 1, 1, 0), reward: 1 }] });
    ok("a sample with no counterfactual is rejected, not absorbed", r.taken === 0 && r.rejected === 1);
    r = await post({ samples: [{ chosen: F(1, 1, 1, 0), alt: F(0, 0, 0, 0), reward: 0 }] });
    ok("...nor one with no reward", r.taken === 0 && r.rejected === 1);

    // Below the minimum it still will not serve.
    j = await get();
    ok("one decision is not enough to be trained", j.trained === false && j.weights === null);

    // Teach it something consistent: the exposed target is the one that dies.
    //
    // Reset first. The buffer still holds the one sample taken above, and the gradient is averaged over the
    // WHOLE buffer -- so that sample would drag `wNear` a thirteenth of the way toward its own lesson. The
    // first version of this test asserted `wNear` had not moved and was wrong, which is the averaging rule
    // working exactly as designed and a test that had forgotten it.
    await fetch(base + "/reset", { method: "POST" });
    const teach = Array.from({ length: 12 }, () => ({ chosen: F(0.5, 0.5, 1, 0), alt: F(0.5, 0.5, 0, 0), reward: 1 }));
    r = await post({ samples: teach });
    ok("twelve consistent decisions are taken", r.taken === 12);
    j = await get();
    ok("...and now the policy is trained, and served", j.trained === true && j.source === "learned" && !!j.weights);
    ok("...having learned that an exposed target is worth more", j.weights.wExposed > bz.defaultWeights().wExposed);
    ok("...and nothing else moved, because nothing else differed", close(j.weights.wNear, bz.defaultWeights().wNear, 1e-9));
    ok("the learned weights are in the clamp band", bz.W_KEYS.every((k) => j.weights[k] >= -2 && j.weights[k] <= 4));

    // A pilot's floor: it checks what it is handed.
    const { sanitizeWeights } = await import("../bzPilot.js");
    ok("a pilot accepts the bridge's weights", !!sanitizeWeights(j.weights));
    ok("...and refuses a NaN", sanitizeWeights({ ...j.weights, wNear: NaN }) === null);
    ok("...and a weight outside the band", sanitizeWeights({ ...j.weights, wNear: 99 }) === null);
    ok("...and a missing one", sanitizeWeights({ wBias: 0, wNear: 1, wAhead: 1, wExposed: 1 }) === null);

    // The buffer persists, so training is reproducible from disk.
    ok("the buffer is on disk where it says it is", fs.existsSync(bridge._file()));
    const disk = JSON.parse(fs.readFileSync(bridge._file(), "utf8"));
    ok("...with every sample that was taken", disk.samples.length === 12);
    ok("...and the served weights", close(disk.weights.wExposed, j.weights.wExposed));

    r = await post({ samples: [] });
    ok("an empty batch changes nothing", r.taken === 0 && r.samples === 12);
    const reset = await (await fetch(base + "/reset", { method: "POST" })).json();
    ok("reset forgets the buffer and returns to the hand policy", reset.samples === 0 && reset.source === "hand");
    ok("...and a GET agrees", (await get()).trained === false);

    // The ES bridge, unharmed and unreachable from here.
    const esBridge = require("../../ai-bridge/tacticsBridge.js");
    ok("the ship bridge does not own the tank's route", !esBridge.owns("/ai/brain/bz/tactics"));
    ok("...and the tank bridge does not own the ship's", !bridge.owns("/ai/brain/tactics"));
    ok("they are different files", esBridge._file() !== bridge._file());

    // v4000 -- srv.close() ALONE LEAVES THE KEEP-ALIVE SOCKETS UP, and this gate's own fetch client is what
    // holds them. Measured here immediately before process.exit(): five live Sockets and the Server, after
    // close() had already resolved. On Keith's rig that tore libuv down mid-close and fast-failed with
    // `!(handle->flags & UV_HANDLE_CLOSING)` -- 65 checks passed and the gate still reported a crash.
    // See tools/ship/serverShutdown.mjs for the measurement and the order the three steps have to happen in.
    await shutdownServer(srv);
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}

// *** THE TEARDOWN IS A CHECK, NOT A HOPE. *** The crash this fixed produced a PERFECT SCORELINE followed by a
// fast-fail, so "65 passed" was never going to catch it coming back. This asserts the thing that was actually
// wrong -- that nothing is still holding the loop open when we exit -- and it fails on THIS platform rather
// than waiting for a Windows box to fast-fail again.
{
    const live = liveHandles();
    ok("nothing is still holding the event loop open at exit", live.length === 0,
        live.length ? "STILL LIVE: " + live.join(", ") + " -- srv.close() resolves without destroying " +
                      "keep-alive sockets, and process.exit() on top of those is what tripped libuv's " +
                      "UV_HANDLE_CLOSING assert on the rig (exit 0xC0000409, after every check had passed)"
                    : "no sockets, no server, no timers");
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
