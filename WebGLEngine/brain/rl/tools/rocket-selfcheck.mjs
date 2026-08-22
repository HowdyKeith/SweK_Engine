// brain/rl/tools/rocket-selfcheck.mjs -- v2216 -- proves the RL spike headlessly.
//
// No GPU, no game files, no RocketSim: this asserts the CONTINUOUS-CONTROL HEAD, the
// KINEMATIC STUB PHYSICS, the ROCKETSIM PROTOCOL (against a fake transport), and that the
// ES LOOP actually IMPROVES a policy on the stub -- the feasibility claim of the round.
//
//   node brain/rl/tools/rocket-selfcheck.mjs
//   deno run -A brain/rl/tools/rocket-selfcheck.mjs

import { RocketPolicy, OBS_DIM, ACT_DIM } from "../rocketPolicy.js";
import { KinematicStub, makeEnv, ENV_CONSTS } from "../rocketEnv.js";
import { makeLineFramer, RocketSimBackend } from "../rocketsimBackend.js";
import { trainES, evaluate } from "../rocketLoop.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { (cond ? pass++ : fail++); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -- " + extra : ""}`); };
const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------- 1. policy head
{
    const p = new RocketPolicy({ hidden: [16, 16], seed: 7 });
    ok("policy paramCount matches flat vector", p.paramCount() === p.getParams().length,
        `${p.paramCount()} vs ${p.getParams().length}`);
    const obs = new Float32Array(OBS_DIM).map((_, i) => Math.sin(i));
    const a1 = p.act(obs), a2 = p.act(obs);
    ok("action has ACT_DIM components", a1.length === ACT_DIM);
    ok("all actions in [-1,1]", a1.every(v => v >= -1 && v <= 1));
    ok("policy is deterministic (same obs -> same action)", a1.every((v, i) => near(v, a2[i])));
    // setParams round-trip
    const flat = p.getParams(); const q = new RocketPolicy({ hidden: [16, 16] }); q.setParams(flat);
    const b = q.act(obs);
    ok("setParams reproduces the exact policy", a1.every((v, i) => near(v, b[i])));
    // JSON round-trip
    const r = RocketPolicy.fromJSON(JSON.parse(JSON.stringify(p.toJSON())));
    const c = r.act(obs);
    ok("toJSON/fromJSON round-trips", a1.every((v, i) => near(v, c[i])));
    // wrong-length setParams throws
    let threw = false; try { p.setParams(new Float32Array(3)); } catch { threw = true; }
    ok("setParams rejects wrong length", threw);
}

// ---------------------------------------------------------------- 2. stub physics invariants
{
    const env = new KinematicStub({ seed: 42, maxSteps: 300 });
    const first = env.reset(42);
    ok("obs length is OBS_DIM", first.length === OBS_DIM);

    // gravity: high, still ball, car parked far away -> ball falls (vz<0, z decreases)
    env.reset(1);
    env.car.x = 3500; env.car.y = -4500; env.car.vx = env.car.vy = 0;   // out of the way
    env.ball.x = 0; env.ball.y = 0; env.ball.z = 1500; env.ball.vx = env.ball.vy = env.ball.vz = 0;
    const z0 = env.ball.z;
    const zero = new Float32Array(ACT_DIM);
    for (let i = 0; i < 5; i++) env.step(zero);
    ok("gravity pulls the ball down", env.ball.z < z0 && env.ball.vz < 0, `z ${z0}->${env.ball.z.toFixed(0)}`);

    // throttle accelerates the car along its heading (+Y when yaw=PI/2)
    env.reset(1);
    env.car.x = 0; env.car.y = 0; env.car.z = 17; env.car.vx = env.car.vy = env.car.vz = 0; env.car.yaw = Math.PI / 2;
    env.ball.x = 3000; env.ball.y = 4000; env.ball.z = 500;   // far from car so no collision
    const vy0 = env.car.vy;
    const fwd = new Float32Array(ACT_DIM); fwd[0] = 1;   // throttle
    env.step(fwd);
    ok("throttle accelerates car forward", env.car.vy > vy0 + 10, `vy ${vy0}->${env.car.vy.toFixed(0)}`);

    // boost accelerates MORE than throttle alone and drains the tank
    env.reset(1);
    env.car.x = 0; env.car.y = 0; env.car.z = 17; env.car.vx = env.car.vy = env.car.vz = 0; env.car.yaw = Math.PI / 2;
    env.car.boost = 1.0; env.ball.x = 3000; env.ball.y = 4000;
    const boostAct = new Float32Array(ACT_DIM); boostAct[0] = 1; boostAct[6] = 1;
    env.step(boostAct);
    ok("boost adds speed and drains boost", env.car.vy > vy0 + 20 && env.car.boost < 1.0, `boost now ${env.car.boost.toFixed(2)}`);

    // goal detection: ball just short of +Y goal, moving in, car out of the way -> scored:+1, done
    env.reset(1);
    env.car.x = -3000; env.car.y = -4000;
    env.ball.x = 0; env.ball.y = ENV_CONSTS.FIELD_Y - 120; env.ball.z = 100; env.ball.vx = 0; env.ball.vy = 1200; env.ball.vz = 0;
    const g = env.step(zero);
    ok("goal on +Y is detected", g.info.scored === 1 && g.done === true, `scored=${g.info.scored} done=${g.done}`);

    // reward is finite and a scored goal is a big positive
    ok("goal reward is a large positive", Number.isFinite(g.reward) && g.reward > 5, `reward=${g.reward.toFixed(2)}`);
}

// ---------------------------------------------------------------- 3. rocketsim protocol (fake transport)
{
    // line framer handles split + multiple lines per chunk
    const seen = [];
    const feed = makeLineFramer(o => seen.push(o));
    feed('{"a":1}\n{"b":'); feed('2}\n');
    ok("line framer reassembles split JSON lines", seen.length === 2 && seen[0].a === 1 && seen[1].b === 2);

    // a fake transport that answers each command with a canned frame
    function fakeTransport(obsFill = 0.1, obsLen = OBS_DIM) {
        return {
            onLine: null, attach() {},
            write(s) {
                const msg = JSON.parse(s);
                let resp;
                if (msg.cmd === "reset") resp = { obs: new Array(obsLen).fill(0) };
                else if (msg.cmd === "step") resp = { obs: new Array(obsLen).fill(obsFill), reward: 1.5, done: false, info: { t: 1, scored: 0 } };
                else resp = { bye: true };
                queueMicrotask(() => this.onLine(JSON.stringify(resp) + "\n"));
            },
            close() {},
        };
    }
    const be = new RocketSimBackend({ transport: fakeTransport() });
    await be.start();
    const o = await be.reset(1);
    ok("rocketsim reset returns OBS_DIM floats", o.length === OBS_DIM);
    const r = await be.step(new Float32Array(ACT_DIM));
    ok("rocketsim step returns obs+reward+done", r.obs.length === OBS_DIM && near(r.reward, 1.5) && r.done === false);
    await be.close();

    // a backend whose bridge returns a wrong-length obs must throw (protocol guard)
    const bad = new RocketSimBackend({ transport: fakeTransport(0.1, 5) });
    await bad.start();
    let threw = false; try { await bad.reset(1); } catch { threw = true; }
    ok("rocketsim backend rejects malformed obs", threw);
    await bad.close();
}

// ---------------------------------------------------------------- 4. ES loop IMPROVES on the stub
{
    const seed = 12345;
    // The objective ES optimises: a FIXED set of common-random-number seeds. We prove the
    // loop improves the policy ON THE OBJECTIVE IT OPTIMISES (the honest "loop works" claim).
    const objSeeds = [1009, 2018, 3027, 4036, 5045];
    const evalEnv = new KinematicStub({ maxSteps: 300 });

    const fresh = new RocketPolicy({ hidden: [32, 32], seed });
    const freshRet = await evaluate(fresh, evalEnv, objSeeds.length, objSeeds);

    const { policy: trained, history } = await trainES({
        backend: "stub", iters: 25, pairs: 16, episodes: objSeeds.length, sigma: 0.08, lr: 0.06, seed,
        evalSeeds: objSeeds, policy: new RocketPolicy({ hidden: [32, 32], seed }), log: () => {},
    });
    const trainedRet = await evaluate(trained, evalEnv, objSeeds.length, objSeeds);

    ok("ES history is finite", history.length === 26 && history.every(h => Number.isFinite(h.base)));
    ok("evaluate returns finite returns", Number.isFinite(freshRet) && Number.isFinite(trainedRet));
    console.log(`     objective return: fresh ${freshRet.toFixed(3)} -> trained ${trainedRet.toFixed(3)}  (delta ${(trainedRet - freshRet).toFixed(3)})`);
    ok("ES improves the policy on its objective", trainedRet > freshRet,
        `fresh ${freshRet.toFixed(3)} vs trained ${trainedRet.toFixed(3)}`);

    // Held-out seeds (never optimised) -- reported for honesty, NOT asserted. Generalisation
    // is a real RL question the stub is too crude to settle; the spike only claims the loop
    // optimises what it is pointed at.
    const holdout = [901, 902, 903, 904, 905, 906];
    const freshHO = await evaluate(fresh, evalEnv, holdout.length, holdout);
    const trainedHO = await evaluate(trained, evalEnv, holdout.length, holdout);
    console.log(`     held-out (info only): fresh ${freshHO.toFixed(3)} -> trained ${trainedHO.toFixed(3)}  (delta ${(trainedHO - freshHO).toFixed(3)})`);
}

// ---------------------------------------------------------------- 5. makeEnv factory
{
    const env = await makeEnv({ backend: "stub" });
    ok("makeEnv('stub') builds a KinematicStub", env.backend === "kinematic-stub" && env.obsDim === OBS_DIM);
    let threw = false; try { await makeEnv({ backend: "nope" }); } catch { threw = true; }
    ok("makeEnv rejects an unknown backend", threw);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (typeof process !== "undefined") process.exit(fail ? 1 : 0);
