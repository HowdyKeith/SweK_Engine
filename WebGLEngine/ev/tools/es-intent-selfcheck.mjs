// WebGLEngine/ev/tools/es-intent-selfcheck.mjs — v2252
//
// The intent-broadcast change has four pure pieces; this proves each without a network:
//   1. packNpc carries intent (and stats) only when the owner set it, and it survives sanitize.
//   2. intentGhostAt traces the CURVED path -- it matches a real flight rollout, where the old linear ray drifts.
//   3. packNpcsDirty stays quiet on unchanged intent and speaks on change or keepalive (the bandwidth win).
//   4. retainGhosts keeps un-re-sent ships alive, and drops them when the owner leaves / dies / goes stale.
//
//   run: node ev/tools/es-intent-selfcheck.mjs

import { packNpc, sanitizeNpc, packNpcsDirty, retainGhosts, ghostAt, wingId } from "../esAuthority.js";
import { intentGhostAt } from "../npcGhost.js";
import { stepFlight } from "../flightModel.js";

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

console.log("es-intent-selfcheck: packing carries intent");
{
    const stats = { turn: 90, accel: 240, speed: 340 };
    const withIntent = { id: "z:1", x: 10.4, y: -3.6, vx: 5, vy: 0, heading: 12, shield: 40, armor: 30, _intent: { tu: 1, tt: 1 }, stats };
    const plain = { id: "z:2", x: 0, y: 0, vx: 0, vy: 0, heading: 0, shield: 40, armor: 30 };
    const p = packNpc(withIntent);
    ok("intent ship packs tu/tt + the 3 stats", p.tu === 1 && p.tt === 1 && p.st === 90 && p.sa === 240 && p.ss === 340);
    ok("a ship with no intent packs none", packNpc(plain).tu === undefined);
    const s = sanitizeNpc(p);
    ok("intent survives sanitize (bounded)", s.tu === 1 && s.tt === 1 && s.st === 90 && s.ss === 340);
    ok("sanitize clamps a junk turn to the flight range", sanitizeNpc({ id: "z:3", tu: 99, tt: 1, st: 90, sa: 1, ss: 1 }).tu === 1);
}

console.log("es-intent-selfcheck: curved extrapolation tracks a real rollout; the linear ray drifts");
{
    const T0 = 100000;                                          // real packets are stamped with Date.now(), never 0
    const stats = { turn: 90, accel: 240, speed: 340 };
    const input = { turn: 1, thrust: true };                    // turning hard while thrusting -> a real curve
    // ground truth: integrate the engine's flight model forward 0.8s from a moving start
    let truth = { x: 0, y: 0, vx: 0, vy: -220, heading: 0 };
    for (let t = 0; t < 0.8; t += 1 / 30) truth = stepFlight(truth, input, stats, Math.min(1 / 30, 0.8 - t));
    const packet = { id: "z:9", x: 0, y: 0, vx: 0, vy: -220, heading: 0, tu: 1, tt: 1, st: 90, sa: 240, ss: 340, t: T0 };
    const curved = intentGhostAt(packet, T0 + 800);
    const linear = ghostAt(packet, T0 + 800);
    const eCurved = dist(curved, truth), eLinear = dist(linear, truth);
    ok("curved ghost matches the rollout (<2 units)", eCurved < 2, "err=" + eCurved.toFixed(2));
    ok("linear ray misses the curve by far more", eLinear > eCurved * 5, "curved=" + eCurved.toFixed(1) + " linear=" + eLinear.toFixed(1));
    // no intent -> intentGhostAt IS the linear ghost (backward compatible)
    const noIntent = { id: "z:9", x: 0, y: 0, vx: 100, vy: 0, heading: 0, t: T0 };
    ok("no-intent packet falls back to linear ghostAt", dist(intentGhostAt(noIntent, T0 + 300), ghostAt(noIntent, T0 + 300)) < 1e-6);
}

console.log("es-intent-selfcheck: dirty pack is quiet on steady course, speaks on change/keepalive");
{
    const stats = { turn: 90, accel: 240, speed: 340 };
    const id = wingId("me", "1");
    const e = { id, x: 0, y: 0, vx: 0, vy: 0, heading: 0, shield: 40, armor: 30, stats, _intent: { tu: 0, tt: 1 } };
    const memo = {};
    ok("first sight -> sent", packNpcsDirty([e], "me", ["me"], memo, 1000).length === 1);
    ok("same intent within keepalive -> quiet", packNpcsDirty([e], "me", ["me"], memo, 1200).length === 0);
    e._intent = { tu: 1, tt: 1 };
    ok("intent change -> sent", packNpcsDirty([e], "me", ["me"], memo, 1300).length === 1);
    ok("unchanged past the keepalive -> re-anchored", packNpcsDirty([e], "me", ["me"], memo, 2400).length === 1);
}

console.log("es-intent-selfcheck: ghost retention holds the quiet, drops the gone");
{
    const id = wingId("owner", "1");
    const fresh = new Map([[id, { id, x: 5, y: 5, dead: false }]]);
    const store = retainGhosts(new Map(), fresh, ["owner", "me"], 1000);
    ok("a fresh ghost is stored", store.has(id));
    retainGhosts(store, new Map(), ["owner", "me"], 2500);                 // owner still here, not re-sent, within ttl
    ok("un-re-sent ghost survives while owner is present", store.has(id));
    retainGhosts(store, new Map(), ["me"], 3000);                          // owner left the ring
    ok("ghost drops when its owner leaves", !store.has(id));
    const store2 = retainGhosts(new Map(), new Map([[id, { id, x: 0, y: 0, dead: true }]]), ["owner"], 1000);
    ok("an owner-declared-dead ghost is dropped", !store2.has(id));
    const store3 = retainGhosts(new Map(), new Map([[id, { id, x: 0, y: 0, t: 1000 }]]), ["owner"], 9000);
    ok("a stale ghost (past ttl) is dropped", !store3.has(id));
}

console.log(`\nes-intent-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
