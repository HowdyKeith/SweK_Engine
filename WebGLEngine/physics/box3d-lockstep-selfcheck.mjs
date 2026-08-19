// WebGLEngine/physics/box3d-lockstep-selfcheck.mjs — v2271
//   run: node physics/box3d-lockstep-selfcheck.mjs

import { createLockstepSession } from "./box3dLockstep.js";
import { planarFallbackWorld } from "./planarFallbackWorld.js";

const STATS = { turn: 90, accel: 200, speed: 300 };
// two fleets, ids owner-prefixed so we know who drives them. Fresh objects per session (sync mutates them).
function shipDefs() {
    const d = [];
    for (let i = 0; i < 4; i++) d.push({ ship: { id: "A" + i, x: -600 + i * 40, y: i * 30, heading: 90 }, owner: "A", stats: { ...STATS } });
    for (let i = 0; i < 4; i++) d.push({ ship: { id: "B" + i, x: 600 - i * 40, y: i * 30, heading: 270 }, owner: "B", stats: { ...STATS } });
    return d;
}
const OWNED = { A: ["A0", "A1", "A2", "A3"], B: ["B0", "B1", "B2", "B3"] };
// deterministic "AI": a peer's inputs for its ships are a pure function of (tick, id) -- same on every machine.
function inputsFor(owner, tick) {
    return OWNED[owner].map((id) => ({ shipId: id, turn: ((tick + id.charCodeAt(1)) % 3) - 1, thrust: (tick % 3) !== 0 }));
}

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };

console.log("box3d-lockstep-selfcheck: two peers stepping the same inputs stay bit-identical");
{
    // s1, s2 stand in for peer A's machine and peer B's machine. Both register the same ships, both receive
    // both peers' inputs each tick, both gate + step. Their per-tick hashes must match exactly.
    const s1 = createLockstepSession({ peers: ["A", "B"], world: planarFallbackWorld(), shipHalf: 40 });
    const s2 = createLockstepSession({ peers: ["A", "B"], world: planarFallbackWorld(), shipHalf: 40 });
    s1.addShips(shipDefs()); s2.addShips(shipDefs());
    ok("both sessions registered all 8 ships", s1.shipCount() === 8 && s2.shipCount() === 8);

    let diverged = false, steps = 0;
    for (let t = 0; t < 120; t++) {
        const ia = inputsFor("A", t), ib = inputsFor("B", t);
        // gating check: with only A's inputs, neither can step yet
        s1.submitInputs("A", t, ia);
        if (t === 0) ok("cannot step with a peer's inputs missing (lockstep gate)", s1.tryStep() === null);
        s2.submitInputs("A", t, ia);
        // now deliver B's inputs to both
        s1.submitInputs("B", t, ib); s2.submitInputs("B", t, ib);
        const r1 = s1.tryStep(), r2 = s2.tryStep();
        if (!r1 || !r2) { diverged = true; break; }
        if ((r1.hash >>> 0) !== (r2.hash >>> 0)) { diverged = true; break; }
        // exchange hashes both ways -- no desync should ever be flagged
        s1.checkPeerHash("B", r2.tick, r2.hash); s2.checkPeerHash("A", r1.tick, r1.hash);
        steps++;
    }
    ok("120 ticks advanced in lockstep", steps === 120, "steps=" + steps);
    ok("every tick's hash matched across the two peers", !diverged);
    ok("no desync flagged on either peer", !s1.desync() && !s2.desync());
}
{
    // desync detection: feed s2 a corrupted input on one tick; the hash must diverge and be caught.
    const s1 = createLockstepSession({ peers: ["A", "B"], world: planarFallbackWorld(), shipHalf: 40 });
    const s2 = createLockstepSession({ peers: ["A", "B"], world: planarFallbackWorld(), shipHalf: 40 });
    s1.addShips(shipDefs()); s2.addShips(shipDefs());
    let caught = false;
    for (let t = 0; t < 20; t++) {
        const ia = inputsFor("A", t); let ib = inputsFor("B", t);
        const ib2 = (t === 10) ? ib.map((x) => ({ ...x, thrust: !x.thrust })) : ib;   // s2 gets tampered inputs at t=10
        s1.submitInputs("A", t, ia); s1.submitInputs("B", t, ib);
        s2.submitInputs("A", t, ia); s2.submitInputs("B", t, ib2);
        const r1 = s1.tryStep(), r2 = s2.tryStep();
        if (r1 && r2 && !s1.checkPeerHash("B", r2.tick, r2.hash)) caught = true;
    }
    ok("a divergent input is caught as a desync via stateHash", caught && !!s1.desync());
}

console.log(`\nbox3d-lockstep-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
