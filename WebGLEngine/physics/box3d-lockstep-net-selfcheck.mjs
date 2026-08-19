// WebGLEngine/physics/box3d-lockstep-net-selfcheck.mjs — v2274
//   run: node physics/box3d-lockstep-net-selfcheck.mjs

import { createLockstepSession } from "./box3dLockstep.js";
import { createLockstepNet } from "./box3dLockstepNet.js";
import { planarFallbackWorld } from "./planarFallbackWorld.js";

const STATS = { turn: 90, accel: 200, speed: 300 };
function shipDefs() {
    const d = [];
    for (let i = 0; i < 4; i++) d.push({ ship: { id: "A" + i, x: -600 + i * 40, y: i * 30, heading: 90 }, owner: "A", stats: { ...STATS } });
    for (let i = 0; i < 4; i++) d.push({ ship: { id: "B" + i, x: 600 - i * 40, y: i * 30, heading: 270 }, owner: "B", stats: { ...STATS } });
    return d;
}
const OWNED = { A: ["A0", "A1", "A2", "A3"], B: ["B0", "B1", "B2", "B3"] };
const ownedInputs = (owner) => (tick) => OWNED[owner].map((id) => ({ shipId: id, turn: ((tick + id.charCodeAt(1)) % 3) - 1, thrust: (tick % 3) !== 0 }));

// a world that computes DIFFERENTLY from a normal peer at one step (stands in for a real float/SIMD divergence:
// same inputs, different result). Nudges a body post-step so its position diverges and persists.
function perturbedWorld(at) {
    const w = planarFallbackWorld(); let n = 0; const _step = w.step.bind(w);
    w.step = (dt) => { _step(dt); if (n++ === at) { try { w.setVelocity(0, [999, 0, 0]); } catch {} } };
    return w;
}

// mock network: send() queues a message for the other peer, delivered `lat` rounds later.
function twoPeers(lat, perturbAt) {
    const q = { A: [], B: [] };
    let clock = 0;
    const sendFrom = (from) => (msg) => { const to = from === "A" ? "B" : "A"; q[to].push({ msg: JSON.parse(JSON.stringify(msg)), due: clock + lat }); };
    const sA = createLockstepSession({ peers: ["A", "B"], world: planarFallbackWorld(), shipHalf: 40 }); sA.addShips(shipDefs());
    const sB = createLockstepSession({ peers: ["A", "B"], world: perturbAt != null ? perturbedWorld(perturbAt) : planarFallbackWorld(), shipHalf: 40 }); sB.addShips(shipDefs());
    const dA = createLockstepNet({ session: sA, selfId: "A", inputFn: ownedInputs("A"), send: sendFrom("A"), inputDelay: 3 });
    const dB = createLockstepNet({ session: sB, selfId: "B", inputFn: ownedInputs("B"), send: sendFrom("B"), inputDelay: 3 });
    function round() {
        for (const e of q.A) if (e.due <= clock) dA.receive(e.msg); q.A = q.A.filter((e) => e.due > clock);
        for (const e of q.B) if (e.due <= clock) dB.receive(e.msg); q.B = q.B.filter((e) => e.due > clock);
        dA.pump(); dB.pump();
        clock++;
    }
    return { sA, sB, dA, dB, round };
}

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };

console.log("box3d-lockstep-net-selfcheck: two peers run box3d lockstep across a laggy net");
{
    const { sA, sB, dA, dB, round } = twoPeers(2, null);
    for (let r = 0; r < 400; r++) round();
    ok("both peers advanced a healthy number of ticks", sA.tick > 200 && sB.tick > 200, `A=${sA.tick} B=${sB.tick}`);
    ok("the two peers stayed within a couple ticks of each other", Math.abs(sA.tick - sB.tick) <= 4, `dA=${sA.tick} dB=${sB.tick}`);
    const common = Math.min(sA.tick, sB.tick);
    let allMatch = true; for (let t = 0; t < common; t++) if ((sA.localHash(t) >>> 0) !== (sB.localHash(t) >>> 0)) { allMatch = false; break; }
    ok("every confirmed tick has an identical hash on both peers", allMatch);
    ok("neither peer flagged a desync", !sA.desync() && !sB.desync());
    ok("input lead stays near the input delay (not runaway)", dA.lead() <= 5 && dB.lead() <= 5, `leadA=${dA.lead()} leadB=${dB.lead()}`);
}
{
    // one peer's world computes differently at tick 30 (a stand-in for a real desync) -> the hash exchange catches it.
    const { sA, sB, round } = twoPeers(1, 30);
    for (let r = 0; r < 200; r++) round();
    ok("a real divergence (same inputs, different result) is caught by the hash exchange", !!(sA.desync() || sB.desync()));
}
{
    const { sA, sB, round } = twoPeers(3, null);
    for (let r = 0; r < 500; r++) round();
    ok("survives higher latency (input delay absorbs it)", sA.tick > 200 && Math.abs(sA.tick - sB.tick) <= 6, `A=${sA.tick} B=${sB.tick}`);
}

console.log(`\nbox3d-lockstep-net-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
