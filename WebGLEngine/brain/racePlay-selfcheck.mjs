// WebGLEngine/brain/racePlay-selfcheck.mjs -- v4827 (beside brain/racePlay.mjs and race-lockstep.html)
//
// Run: node brain/racePlay-selfcheck.mjs
//
// A HUMAN AT THE WHEEL OF A LOCKSTEP CAR: the keys, the commands they make, the pacing that turns a frame into a tick, and the page that puts a canvas around them.
//
// Section 1, THE KEYS (pure): which codes mean what, an unmapped key ignored, a blurred window letting go of everything, and the drive command each combination makes
// on a car at rest and at speed -- forward, brake, reverse, the brake key, left against right, the steer shrinking with speed. Section 2, THE KEYS REACH THE CAR: a
// solo race through the real lockstep session (one peer, a bot in the other car): an idle car stays where it is while the bot drives away; W drives it; A turns it to
// ITS LEFT and D to its right, MEASURED on the road (the first draft of the constant had the sign backwards); the brake key stops it; S at rest reverses; Z and X
// reach the wire as a slick and a flame on top of the gunner; and the gunner brain still works the turret of a car whose driver is a human. Section 3, TWO PEOPLE OVER
// A WIRE: two peers on their own wasm instances and a mock wire two rounds long, a different set of keys on each, race ten seconds; the hashes agree on every tick,
// the cars did what their OWN player's keys said, each player's keys are in the other machine's stepped log, and the commands they stepped replayed on a third instance
// reach the same fingerprint -- the keyboard is a replay log arriving live. Section 4, THE PACING: a frame is a tick of wall clock and no more, a stall costs a quarter
// of a second at most and loses nothing, the loop stops at the end of the race, and a peer that is not heard from is "waiting" and recovers. Section 5, THE PAGE:
// race-lockstep.html in a real browser (countdown=0 so the gate does not wait three seconds) -- one player (the keys move the car on the canvas, the picture is painted, the race ends with a fingerprint that the commands
// the browser stepped reproduce IN NODE), two players through a real relay on two iframes (both end AGREED on one fingerprint, each car followed its own player), two
// players who opened different races (both stop, naming it), and a relay that is not there (said, not hung).
//
// SABOTAGE LOG -- v4827, twenty-three, each applied to the file named, the gate run, the file restored. Reds are rows (`grep -c '^  FAIL'`).
//   A  racePlay.mjs: LEFT_STEER back to -1, the first draft             2 red: the turn-on-the-road row (A went to +z, D to -z: a RIGHT turn on a north-up map) and the row that reads A's steer off the other machine's log
//   B  racePlay.mjs: down while rolling reverses instead of braking     1 red (the key table)
//   C  racePlay.mjs: the steer not scaled by speed                      1 red (the shrink row: 1.000 at 20 m/s)
//   D  racePlay.mjs: the keys ignored for driving                       10 red (every row that moves a car)
//   E  racePlay.mjs: the gunner's own drop replaced by the key's        1 red (the gunner's slick survives the keys: 0 ticks of 240)
//   F  racePlay.mjs: every owned car is the human's                     1 red (the bot's car did not drive away: 0.00 m)
//   G  raceLockstep.mjs: createRacePeer ignores opts.inputFn            10 red (the same rows as D: the keys never reach the wire)
//   H1 racePlay.mjs: the play loop with no backlog cap                  1 red (the stall row: 24 ticks over three frames, not 15)
//   H2 racePlay.mjs: the play loop with no per-frame pump cap           1 red (the stall row: 15 in the first frame, not 8)
//   I  racePlay.mjs: the play loop pumps past the stop tick             3 red (the stop row, and in the browser the replay-in-node row and the pair row: ticks past the end)
//   J  racePlay.mjs: "waiting" never reported                           1 red (a peer not heard from is 'running', tick 0, waits 40)
//   K  racePlay.mjs: the signature ignores the seed                     3 red (the five-signatures row, the node halt-on-different-races row, the browser one)
//   T  racePlay.mjs: solo gives car 1 to a peer that is not there       1 red (the bot did not drive: 0.00 m)
//   L  race-lockstep.html: no final word sent                           3 red (the pair never agrees; each car follows its player; the AGREED row)
//   M  race-lockstep.html: AGREED printed without comparing             1 red (handed a final word off by one bit it still says AGREED)
//   N  racePlay.mjs: KeyA is "right"                                    3 red (the key table, the turn on the road, the steer in the other machine's log)
//   O  race-lockstep.html: draw() returns at once                       1 red (the red car's pixels are not on the canvas)
//   P  race-lockstep.html: nothing said when the relay is unreachable   1 red (the no-relay row)
//   Q  race-lockstep.html: the halting page does not tell the other     1 red, DETERMINISTIC ONLY AFTER THE COUNTDOWN. The first form of this row started both pages at once, and the bug (a page that
//      halts on a mismatch never announces its own identity, because the net stops pumping, so the OTHER page waits forever for a peer that has stopped) showed or hid depending on which
//      page pumped first: three runs of the sabotage were 0, 1 and 1 red. B now opens with countdown=2, so A has always pumped first and B hears it before it has pumped itself.
//   U  raceLockstep.mjs: the session ignores its stop tick              2 red (the 600-tick row: 765 ticks, and the confirmed-whole-race row)
//   V  race-lockstep.html: the page does not hand the session its stop tick   1 red (the session reports Infinity)
//   W  race-lockstep.html: the countdown ignored                        0 red the first time (the gate started every page at countdown=0 and the mismatch row passes with or without the delay once the
//      fix is in); a row added that boots a page at countdown=2 and reads it 0.7 s in (tick 0, no pumps, 'starting in 2...') and then 1 red.
//   A FIRST BATTERY OF TWENTY WENT WRONG IN A WAY WORTH SAYING: the pair row ("both pages print AGREED on one fingerprint") also went red under sabotages that cannot touch it (A, C, E, N, Q), and
//   not under others. It was not the sabotage. Looping the UNSABOTAGED gate ten times found three reds in ten, of two kinds: (1) the harness read the result block in the same breath as the last
//   message, one frame before the page redrew it (waits 500 ms now); (2) A REAL BUG -- one pump can step a dozen ticks it already holds commands for, so a page paced by the clock ran past the end
//   of the race by a different number of ticks on each machine, and printed a final fingerprint, log and results from there (the AGREED check compared the right tick, so it said AGREED
//   over two different printed fingerprints). createRaceSession takes a stopTick now and never steps it; the pair row reads the tick, the log length and the stop each page holds. Ten
//   unsabotaged runs after: ten clean.
"use strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { initNode, mod, VENDOR_DIR } from "../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../render/slugTicker.mjs";
import * as G from "./gunnerPolicy.mjs";
import * as D from "./drivePolicy.mjs";
import * as C from "../physics/raceCar.mjs";
import { createRacePeer } from "./raceLockstep.mjs";
import * as P from "./racePlay.mjs";
import { startRelay } from "../tools/ship/lockstepRelay.mjs";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);
const log0 = console.log; console.log = (...a) => { if (!/\[CityGen\]|\[box3d\]|\[GLBParser\]/.test(String(a[0]))) log0(...a); };

const st = await initNode(); if (!st.ready) { ok("box3d's wasm", false, st.reason); process.exit(1); }
const factory = (await import(pathToFileURL(path.join(VENDOR_DIR, "box3d.js")).href)).default;
const newModule = () => factory({ locateFile: (f) => pathToFileURL(path.join(VENDOR_DIR, f)).href });
const fleet = D.machineFingerprint(mod());
const TICK = C.CAR.dt;

sec("1. THE KEYS (pure): what each code means and the drive command each combination makes");
{
    const k = P.createKeys();
    ok("W and the up arrow are the same key, S and the down arrow, A and left, D and right; Space brakes, Z drops a slick, X lights it", ["KeyW", "ArrowUp"].every((c) => P.KEYMAP[c] === "up") && ["KeyS", "ArrowDown"].every((c) => P.KEYMAP[c] === "down") && ["KeyA", "ArrowLeft"].every((c) => P.KEYMAP[c] === "left") && ["KeyD", "ArrowRight"].every((c) => P.KEYMAP[c] === "right") && P.KEYMAP.Space === "brake" && P.KEYMAP.KeyZ === "drop" && P.KEYMAP.KeyX === "ignite");
    k.press("KeyW"); k.press("ArrowLeft");
    const a = k.snapshot(); k.release("KeyW"); const b = k.snapshot();
    ok("pressing holds and releasing lets go, and the snapshot is a copy (a later press does not change one already taken)", a.up && a.left && !b.up && b.left && a.up === true);
    ok("an unmapped key is ignored and says so (press and release both return false), and clear() lets go of everything (a blurred window)", k.press("KeyQ") === false && k.release("Enter") === false && (k.press("KeyD"), k.clear(), Object.values(k.snapshot()).every((v) => v === false)));
    const at = (v) => ({ yaw: 0, vel: [0, 0, v], pos: [0, 0, 0] });   // heading +z (yaw 0), v m/s along the nose
    const keys = (o) => ({ up: false, down: false, left: false, right: false, brake: false, drop: false, ignite: false, ...o });
    const run = (o, v = 0) => P.driveFromKeys(keys(o), at(v));
    ok("nothing held is nothing commanded; up is full throttle", run({}).throttle === 0 && run({}).brake === 0 && run({}).steer === 0 && run({ up: true }).throttle === 1);
    ok("down while rolling forward BRAKES (no throttle), and at rest REVERSES", run({ down: true }, 10).brake === 1 && run({ down: true }, 10).throttle === 0 && run({ down: true }, 0).throttle === -1 && run({ down: true }, 0).brake === 0);
    ok("up and down together is nothing; the brake key beats the throttle", run({ up: true, down: true }).throttle === 0 && run({ up: true, brake: true }, 10).brake === 1 && run({ up: true, brake: true }, 10).throttle === 0);
    const L = run({ left: true }), R = run({ right: true });
    ok("left and right are opposite signs, equal in size, and full at rest; both together cancel", L.steer === P.LEFT_STEER && R.steer === -P.LEFT_STEER && run({ left: true, right: true }).steer === 0);
    ok("the steer SHRINKS with speed (digital steering at 25 m/s is a spin) and never below 40%", Math.abs(run({ left: true }, 20).steer) < 0.6 && Math.abs(run({ left: true }, 20).steer) > 0.5 && Math.abs(run({ left: true }, 80).steer) === 0.4 && Math.abs(run({ left: true }, -20).steer) === Math.abs(run({ left: true }, 20).steer), `${run({ left: true }, 20).steer.toFixed(3)} at 20 m/s, ${run({ left: true }, 80).steer} at 80`);
    ok("the forward speed is the velocity ON THE NOSE: sideways is not forward, backwards is negative", Math.abs(P.forwardSpeed({ yaw: 0, vel: [9, 0, 0] })) < 1e-9 && P.forwardSpeed({ yaw: Math.PI / 2, vel: [7, 0, 0] }) > 6.99 && P.forwardSpeed({ yaw: 0, vel: [0, 0, -4] }) === -4);
}

// ---- a solo race through the real lockstep session, one wasm instance, driven by a script of (tick, keys) -----------------------------------------------------------
function playSolo(script, seconds, { gun = "hand", seed = 1 } = {}) {
    const cfg = P.playableRace({ seconds, solo: true, gunners: gun, seed }), keys = P.createKeys(), stop = Math.round(seconds / TICK);
    const peer = createRacePeer({ selfId: "A", peers: cfg.peers, owner: cfg.owner, worldFrom: () => worldFromModule(mod(), [0, -9.81, 0]), drivers: cfg.drivers, gunners: cfg.gunners, seed, seconds, fleet, city: cfg.city, send: () => {}, backendId: fleet + "|" + P.configSignature(cfg), inputDelay: 0, inputFn: P.humanInputFn("A", keys, { human: cfg.human.A }) });
    const trail = [];
    for (let t = 0; t < stop; t++) { script(t, keys); peer.pump(); if (t % 30 === 0 || t === stop - 1) { const p = peer.session.race.poses(); trail.push(p.map((q) => ({ pos: q.pos.slice(), yaw: q.yaw, v: P.forwardSpeed(q) }))); } }
    const shots = peer.session.race.turrets.map((t) => t.shots), log = peer.session.log.slice(), fin = peer.session.race.finish();
    return { cfg, trail, shots, log, fingerprint: fin.fingerprint, results: fin.results };
}
const dist = (a, b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]);

sec("2. THE KEYS REACH THE CAR: a solo race through the real lockstep session");
{
    // zero gunners for the two rows that read positions and the wire: a hand gunner on the bot BEHIND the human's car shoots it (a shell has knockback), which is the game and not what these rows ask
    const idle = playSolo(() => {}, 3, { gun: "zero" }), s0 = idle.trail[0][0], e0 = idle.trail[3][0], e1 = idle.trail[3][1], b1 = idle.trail[0][1];
    ok("!! with no key held the human's car stays where it started (within 1 m after 1.5 s) while the bot's car behind it drives off (over 1.5 m)", dist(s0, e0) < 1 && dist(b1, e1) > 1.5, `human ${dist(s0, e0).toFixed(2)} m, bot ${dist(b1, e1).toFixed(2)} m`);
    const fwd = playSolo((t, k) => { if (t === 0) k.press("KeyW"); }, 4), f0 = fwd.trail[0][0], fe = fwd.trail[fwd.trail.length - 1][0];
    ok("!! holding W drives the car: over 15 m in 4 s, and the throttle on the wire is 1 from the first tick", dist(f0, fe) > 15 && fwd.log[5][0].throttle === 1 && fwd.log[200][0].throttle === 1, `${dist(f0, fe).toFixed(1)} m, speed ${fe.v.toFixed(1)} m/s`);
    const straight = playSolo((t, k) => { if (t === 0) k.press("KeyW"); }, 3.5), left = playSolo((t, k) => { if (t === 0) k.press("KeyW"); if (t === 120) k.press("KeyA"); }, 3.5), right = playSolo((t, k) => { if (t === 0) k.press("KeyW"); if (t === 120) k.press("KeyD"); }, 3.5);
    const z = (r) => r.trail[r.trail.length - 1][0].pos[2], zs = z(straight), zl = z(left), zr = z(right);
    ok("!! A turns the car to ITS LEFT and D to its right, measured on the road: the car starts heading east (+x, the track's direction), and on this map (north up, z down) its left is toward -z", zl < zs - 1.5 && zr > zs + 1.5, `z after 3.5 s: straight ${zs.toFixed(2)}, A ${zl.toFixed(2)}, D ${zr.toFixed(2)}`);
    const brake = playSolo((t, k) => { if (t === 0) k.press("KeyW"); if (t === 150) { k.release("KeyW"); k.press("Space"); } }, 6), bv = brake.trail[brake.trail.length - 1][0].v, bm = brake.trail[5][0].v;
    ok("Space brakes: the car at speed (about " + bm.toFixed(0) + " m/s at 2.5 s) is nearly stopped 3.5 s later", bm > 5 && Math.abs(bv) < 1.0, `${bm.toFixed(2)} -> ${bv.toFixed(2)} m/s`);
    const rev = playSolo((t, k) => { if (t === 0) k.press("KeyS"); }, 3), rv = rev.trail[rev.trail.length - 1][0].v;
    ok("S at rest reverses: the speed along the nose goes negative", rv < -1, `${rv.toFixed(2)} m/s`);
    const slick = playSolo((t, k) => { if (t === 40) k.press("KeyZ"); if (t === 45) k.release("KeyZ"); if (t === 80) k.press("KeyX"); if (t === 85) k.release("KeyX"); }, 2, { gun: "zero" });
    ok("Z and X reach the WIRE as a drop and an ignite on the human's car (and only while held), on top of whatever the gunner commands (the zero gunner commands neither)", slick.log[42][0].drop === 1 && slick.log[30][0].drop === 0 && slick.log[60][0].drop === 0 && slick.log[82][0].ignite === 1 && slick.log[100][0].ignite === 0 && slick.log[42][0].ignite === 0, `drop@42 ${slick.log[42][0].drop}, ignite@82 ${slick.log[82][0].ignite}`);
    const own = playSolo(() => {}, 4), ownDrops = own.log.filter((r) => r[0].drop === 1).length;
    ok("the gunner's OWN slick survives the keys: with no key held the hand gunner (a pursuer is right behind) still drops oil from the human's car", ownDrops > 0, `${ownDrops} ticks of 240 with a drop on car 0`);
    const gun = playSolo(() => {}, 30), nogun = playSolo(() => {}, 30, { gun: "zero" });
    ok("!! the GUNNER BRAIN still works the turret of a car with a human driver: over 30 s the idle human's car took shots with the hand gunner and none with the zero gunner", gun.shots[0] > 0 && nogun.shots[0] === 0, `hand gunner ${gun.shots[0]} shots, zero gunner ${nogun.shots[0]}`);
    const a1 = playSolo((t, k) => { if (t === 0) k.press("KeyW"); if (t === 90) k.press("KeyA"); }, 4), a2 = playSolo((t, k) => { if (t === 0) k.press("KeyW"); if (t === 90) k.press("KeyA"); }, 4), a3 = playSolo((t, k) => { if (t === 0) k.press("KeyW"); if (t === 91) k.press("KeyA"); }, 4);
    ok("the same keys at the same ticks are the same race to the bit, and one tick later is another race", a1.fingerprint === a2.fingerprint && a1.fingerprint !== a3.fingerprint, `${a1.fingerprint} / ${a2.fingerprint} / one tick later ${a3.fingerprint}`);
}

sec("3. TWO PEOPLE OVER A WIRE: each machine's keys, the other machine's cars, one fingerprint");
const SECONDS3 = 10, TICKS3 = Math.round(SECONDS3 / TICK);
let two = null;
{
    const cfg = P.playableRace({ seconds: SECONDS3 }), mA = await newModule(), mB = await newModule(), sg = P.configSignature(cfg), keyA = P.createKeys(), keyB = P.createKeys();
    const q = { A: [], B: [] }; let clock = 0;
    const sendFrom = (from) => (msg) => q[from === "A" ? "B" : "A"].push({ msg: JSON.parse(JSON.stringify(msg)), due: clock + 2 });
    const mk = (id, m, keys, cfgx = cfg) => createRacePeer({ selfId: id, peers: cfgx.peers, owner: cfgx.owner, worldFrom: () => worldFromModule(m, [0, -9.81, 0]), drivers: cfgx.drivers, gunners: cfgx.gunners, seed: cfgx.seed, seconds: SECONDS3, fleet, city: cfgx.city, stopTick: TICKS3, send: sendFrom(id), backendId: fleet + "|" + P.configSignature(cfgx), inputDelay: 4, inputFn: P.humanInputFn(id, keys, { human: cfgx.human[id] }) });
    const A = mk("A", mA, keyA), B = mk("B", mB, keyB);
    const round = () => { for (const [id, p] of [["A", A], ["B", B]]) { const due = q[id].filter((e) => e.due <= clock); q[id] = q[id].filter((e) => e.due > clock); for (const e of due) p.receive(e.msg); } A.pump(); B.pump(); clock++; };
    const trail = { A: [], B: [] };
    for (let r = 0; r < TICKS3 + 300 && Math.min(A.session.tick, B.session.tick) < TICKS3; r++) {
        // each player's keys follow THAT machine's own tick: A holds W from the start and steers left over ticks 120-150, B waits until tick 240 and then holds W
        const ta = A.session.tick, tb = B.session.tick;
        if (ta === 0) keyA.press("KeyW");
        if (ta >= 120 && ta < 150) keyA.press("KeyA"); else keyA.release("KeyA");
        if (tb >= 240) keyB.press("KeyW");
        round();
        if (r % 30 === 0) { trail.A.push(A.session.race.poses()); trail.B.push(B.session.race.poses()); }
    }
    for (let extra = 0; extra < 100; extra++) round();   // a hundred more rounds with commands still flowing: a session that has been told where the race ends must not go on
    const overA = A.session.tick, overB = B.session.tick, lenA = A.session.log.length, lenB = B.session.log.length;
    const n = Math.min(A.session.tick, B.session.tick), a = A.session, b = B.session;
    let bad = -1; for (let t = 0; t < n; t++) if ((a.localHash(t) >>> 0) !== (b.localHash(t) >>> 0)) { bad = t; break; }
    two = { A, B, n, bad };
    report(`${n} ticks over ${clock} rounds; fingerprint A ${a.localHash(n - 1).toString(16)} B ${b.localHash(n - 1).toString(16)}; lead ${A.net.lead()} / ${B.net.lead()}`);
    ok("!! both machines confirmed the whole race (10 s) with a human at each wheel, one hash on both for every confirmed tick, and no desync", n === TICKS3 && bad === -1 && !a.desync() && !b.desync(), `${n} ticks, first disagreement ${bad}`);
    ok("!! neither machine steps PAST the end of the race: told the race is 600 ticks long (stopTick) and given a hundred more rounds of commands, both stop at exactly 600, their logs are 600 long, and the running fingerprint the session reports at finish() is the one at tick 599 (a page that paced the race by the clock ran a few ticks over, on a different number of them per machine, and printed results from there)", overA === TICKS3 && overB === TICKS3 && lenA === TICKS3 && lenB === TICKS3 && A.session.fingerprint() === a.localHash(TICKS3 - 1).toString(16).padStart(8, "0"), `ticks ${overA} / ${overB}, logs ${lenA} / ${lenB}, fingerprint ${A.session.fingerprint()} against tick 599 ${a.localHash(TICKS3 - 1).toString(16).padStart(8, "0")}`);
    ok("the commands each machine stepped are identical (A's log and B's log are the same), so the keyboard is the replay log arriving live", JSON.stringify(a.log.slice(0, n)) === JSON.stringify(b.log.slice(0, n)));
    const last = trail.A.length - 1, v1 = P.forwardSpeed(trail.A[last][1]), far0 = Math.max(...trail.A.map((p) => dist(trail.A[0][0], p[0])));
    ok("!! each car did what its OWN player's keys said: A held W the whole race and car 0 got far from the grid (over 20 m at its farthest); B held nothing until tick 240 and then W, and car 1 is driving at the end (over 2 m/s along its nose)", far0 > 20 && v1 > 2, `car 0 ${far0.toFixed(1)} m at its farthest; car 1 ${v1.toFixed(1)} m/s at the end`);
    ok("!! each player's keys are in the OTHER machine's stepped log, as that machine's command: on A's own log car 1's throttle is 0 until B pressed W (by tick 235) and 1 after (tick 260); car 0's steer is 0, then left over A's window, then 0 again -- a key crossed the wire", a.log[100][1].throttle === 0 && a.log[235][1].throttle === 0 && a.log[260][1].throttle === 1 && a.log[100][0].steer === 0 && a.log[135][0].steer > 0 && a.log[145][0].steer > 0 && a.log[170][0].steer === 0 && a.log[100][0].throttle === 1, `car 1 throttle @235 ${a.log[235][1].throttle} @260 ${a.log[260][1].throttle}; car 0 steer @100 ${a.log[100][0].steer} @135 ${a.log[135][0].steer.toFixed(2)} @170 ${a.log[170][0].steer}`);
    const mC = await newModule(), rep = G.raceWithGunners(() => worldFromModule(mC, [0, -9.81, 0]), cfg.drivers.map(() => D.zeroWeights()), cfg.gunners.map(() => G.zeroWeights()), { seed: 1, seconds: n * TICK, fleet, inputsLog: a.log.slice(0, n), city: {} });
    ok("!! the commands the two people typed, fed to raceWithGunners on a THIRD instance as a replay log, reach the same fingerprint: a keyboard race is a replay", rep.fingerprint === a.localHash(n - 1).toString(16).padStart(8, "0"), `replay ${rep.fingerprint}, race ${a.localHash(n - 1).toString(16).padStart(8, "0")}`);
    const cfgSeed2 = P.playableRace({ seconds: SECONDS3, seed: 2 });
    ok("the race two people opened is part of the identity the lockstep announces: another seed, another gunner, one player against two are three different signatures, so a pair on different links halts before the first step", new Set([P.configSignature(cfg), P.configSignature(cfgSeed2), P.configSignature(P.playableRace({ seconds: SECONDS3, gunners: "zero" })), P.configSignature(P.playableRace({ seconds: SECONDS3, solo: true })), P.configSignature(P.playableRace({ seconds: 20 }))]).size === 5, sg);
    const mD = await newModule(), mE = await newModule(); let seen = null;
    const cfgB = P.playableRace({ seconds: 2, seed: 2 }), cfgA = P.playableRace({ seconds: 2 }), qq = { A: [], B: [] };
    const mkx = (id, m, cx, onMis) => createRacePeer({ selfId: id, peers: cx.peers, owner: cx.owner, worldFrom: () => worldFromModule(m, [0, -9.81, 0]), drivers: cx.drivers, gunners: cx.gunners, seed: cx.seed, seconds: 2, fleet, city: cx.city, send: (msg) => qq[id === "A" ? "B" : "A"].push(JSON.parse(JSON.stringify(msg))), backendId: fleet + "|" + P.configSignature(cx), inputDelay: 4, inputFn: P.humanInputFn(id, P.createKeys(), { human: cx.human[id] }), onBackendMismatch: onMis });
    const xa = mkx("A", mD, cfgA, (h) => { seen = h; }), xb = mkx("B", mE, cfgB, null);
    for (let r = 0; r < 20; r++) { for (const m of qq.A.splice(0)) xa.receive(m); for (const m of qq.B.splice(0)) xb.receive(m); xa.pump(); xb.pump(); }
    ok("!! two peers on different races HALT before the first step on BOTH sides, with the two signatures in the reason (the page turns it into 'you opened different races')", xa.net.halted() && xb.net.halted() && xa.session.tick === 0 && xb.session.tick === 0 && seen && /seed1/.test(seen.ours) && /seed2/.test(seen.theirs), seen ? `${seen.ours} against ${seen.theirs}` : "no mismatch seen");
}

sec("4. THE PACING: a frame is a tick of wall clock and no more");
{
    const mkSolo = (seconds) => { const cfg = P.playableRace({ seconds, solo: true }), keys = P.createKeys(); return { cfg, keys, stop: Math.round(seconds / TICK), peer: createRacePeer({ selfId: "A", peers: cfg.peers, owner: cfg.owner, worldFrom: () => worldFromModule(mod(), [0, -9.81, 0]), drivers: cfg.drivers, gunners: cfg.gunners, seed: 1, seconds, fleet, city: cfg.city, send: () => {}, inputDelay: 0, inputFn: P.humanInputFn("A", keys, { human: cfg.human.A }) }) }; };
    const S = mkSolo(2), loop = P.createPlayLoop(S.peer, { stopTick: S.stop }), t = () => S.peer.session.tick;
    loop.frame(TICK); const one = t();
    loop.frame(0); const zero = t();
    loop.frame(3 * TICK); const three = t();
    ok("!! a frame as long as a tick steps one tick, a frame of no time steps none, and three ticks' worth steps three", one === 1 && zero === 1 && three === 4, `${one} / ${zero} / ${three}`);
    const before = t(); loop.frame(5); const stall = t() - before; loop.frame(0); loop.frame(0); const settled = t() - before;
    ok("!! a stall (a frame five seconds long) is capped at a quarter of a second of catching up, spread over frames (8 pumps in one, the rest after) -- it costs time, never a tick: 15 ticks in all, and no more however many frames follow", stall === 8 && settled === 15, `first frame ${stall}, after two more ${settled}`);
    while (loop.frame(TICK) !== "finished" && t() < S.stop + 50) { /* run to the end */ }
    const at = t(); for (let i = 0; i < 20; i++) loop.frame(TICK * 4);
    ok("the loop stops at the end of the race (tick " + S.stop + "), says 'finished', and steps nothing past it however many frames come", at === S.stop && t() === S.stop && loop.state() === "finished", `stopped at ${at}, state ${loop.state()}`);
    S.peer.session.race.finish();

    // a peer that is not heard from: two peers, the second never delivers
    const cfg = P.playableRace({ seconds: 2 }), mA = await newModule(), mB = await newModule(), qa = [];
    const pa = createRacePeer({ selfId: "A", peers: cfg.peers, owner: cfg.owner, worldFrom: () => worldFromModule(mA, [0, -9.81, 0]), drivers: cfg.drivers, gunners: cfg.gunners, seed: 1, seconds: 2, fleet, city: cfg.city, send: () => {}, inputDelay: 4, inputFn: P.humanInputFn("A", P.createKeys(), { human: cfg.human.A }) });
    const pb = createRacePeer({ selfId: "B", peers: cfg.peers, owner: cfg.owner, worldFrom: () => worldFromModule(mB, [0, -9.81, 0]), drivers: cfg.drivers, gunners: cfg.gunners, seed: 1, seconds: 2, fleet, city: cfg.city, send: (m) => qa.push(JSON.parse(JSON.stringify(m))), inputDelay: 4, inputFn: P.humanInputFn("B", P.createKeys(), { human: cfg.human.B }) });
    const lp = P.createPlayLoop(pa, { stopTick: 120 }); pa.net.announceBackend && 0;
    for (let i = 0; i < 40; i++) lp.frame(TICK);
    const silent = lp.status();
    ok("!! a peer that is not heard from is WAITING (the loop pumped 40 times and stepped nothing: tick 0), and says so rather than running", silent.state === "waiting" && silent.tick === 0 && silent.waits >= 30, `${silent.state}, tick ${silent.tick}, waits ${silent.waits}`);
    // B finally speaks: its inputs (sent ahead) reach A
    for (let i = 0; i < 5; i++) pb.pump();
    for (const m of qa.splice(0)) pa.receive(m);
    const sendBack = []; for (let i = 0; i < 12; i++) lp.frame(TICK);
    ok("...and RECOVERS when the other peer's commands arrive: the loop steps again and is running", lp.status().tick > 0 && lp.state() === "running", `tick ${lp.status().tick}, ${lp.state()}`);
    pa.session.race.finish(); pb.session.race.finish();
}

sec("5. THE PAGE: race-lockstep.html in a real browser");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const relay = await startRelay({ port: 0, host: "127.0.0.1" }), RELAY = "ws://127.0.0.1:" + relay.port;
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 280000, args: { RELAY }, script: `async (args) => {
            const frames = []; const mk = (query) => { const f = document.createElement("iframe"); f.style.cssText = "width:420px;height:420px;border:0;position:fixed;left:" + (frames.length * 430) + "px;top:0"; f.src = "/race-lockstep.html" + query; document.body.appendChild(f); frames.push(f); return f; };
            const waitFor = async (fn, ms, what) => { const t = performance.now(); while (performance.now() - t < ms) { try { if (fn()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } globalThis.__swekStep = "timed out: " + what; return false; };
            const key = (win, code, down) => win.dispatchEvent(new win.KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));
            const txt = (f, id) => (f.contentDocument.getElementById(id) || {}).textContent || "";
            const rl = (f) => f.contentWindow.__raceLockstep;
            const out = {};
            // ---- one player ----
            const S = mk("?seconds=5&countdown=0");
            out.soloBooted = await waitFor(() => rl(S) && rl(S).peer && rl(S).loop && rl(S).snap, 90000, "solo boot");
            if (out.soloBooted) {
                const w = S.contentWindow, R = rl(S);
                out.soloSig = R.sig; out.soloPeers = R.config.peers.length;
                const p0 = R.snap.poses[0].pos.slice(); await new Promise((r) => setTimeout(r, 600));
                out.idleMoved = Math.hypot(R.snap.poses[0].pos[0] - p0[0], R.snap.poses[0].pos[2] - p0[2]);
                key(w, "KeyW", true); await waitFor(() => R.snap.tick > 150, 20000, "solo ticks");
                out.afterW = { moved: Math.hypot(R.snap.poses[0].pos[0] - p0[0], R.snap.poses[0].pos[2] - p0[2]), tick: R.snap.tick, throttle: R.peer.session.log[R.peer.session.log.length - 1][0].throttle };
                // the picture: count the pixels of the red car's colour on the canvas
                const cv = S.contentDocument.getElementById("c"), id = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let red = 0, road = 0;
                for (let i = 0; i < id.length; i += 4) { if (Math.abs(id[i] - 228) < 8 && Math.abs(id[i + 1] - 87) < 8 && Math.abs(id[i + 2] - 46) < 8) red++; if (id[i] === 43 && id[i + 1] === 47 && id[i + 2] === 44) road++; }
                out.redPx = red; out.roadPx = road;
                out.soloFinished = await waitFor(() => R.summary, 60000, "solo finish");
                if (out.soloFinished) { out.soloFingerprint = R.summary.fingerprint; out.soloLog = R.peer.session.log; out.soloResult = txt(S, "result"); out.soloState = txt(S, "state"); out.soloKeysAfter = null; }
            }
            // ---- the countdown: nothing is stepped or sent until it has run out ----
            const CD = mk("?seconds=3&countdown=2");
            out.cdBooted = await waitFor(() => rl(CD) && rl(CD).peer && rl(CD).loop, 90000, "countdown boot");
            if (out.cdBooted) { const t0 = performance.now(); await new Promise((r) => setTimeout(r, 700)); out.cdEarly = { tick: rl(CD).peer.session.tick, text: txt(CD, "state"), sentPumps: rl(CD).loop.status().pumps }; out.cdRan = await waitFor(() => rl(CD).peer.session.tick > 20, 15000, "countdown over"); out.cdAfter = { tick: rl(CD).peer.session.tick, ms: Math.round(performance.now() - t0) }; }
            // ---- two players through the real relay ----
            const q = (peer, extra) => "?relay=" + encodeURIComponent(args.RELAY) + "&room=" + extra.room + "&peer=" + peer + "&seconds=6&countdown=" + (extra.countdown != null ? extra.countdown : 0) + (extra.more || "");
            const FA = mk(q("A", { room: "ok" })), FB = mk(q("B", { room: "ok" }));
            out.pairBooted = await waitFor(() => rl(FA) && rl(FB) && rl(FA).peer && rl(FB).peer, 90000, "pair boot");
            if (out.pairBooted) {
                key(FA.contentWindow, "KeyW", true);
                out.pairFinished = await waitFor(() => rl(FA).summary && rl(FB).summary && rl(FA).state.peerFin && rl(FB).state.peerFin, 120000, "pair finish");
                await new Promise((r) => setTimeout(r, 500));   // the result block is redrawn on the page's next frame; read it after, not in the same breath as the last message
                const A = rl(FA), B = rl(FB);
                out.pair = { aStop: A.peer.session.stopTick(), bStop: B.peer.session.stopTick(), soloStop: S.contentWindow.__raceLockstep.peer.session.stopTick(), aTick: A.peer.session.tick, bTick: B.peer.session.tick, aLogLen: A.peer.session.log.length, bLogLen: B.peer.session.log.length, aFp: A.summary.fingerprint, bFp: B.summary.fingerprint, aText: txt(FA, "result"), bText: txt(FB, "result"), aHalt: A.state.halt, bHalt: B.state.halt, sameLog: JSON.stringify(A.peer.session.log) === JSON.stringify(B.peer.session.log), aCar0: A.summary.rows[0].metres, aCar1: A.summary.rows[1].metres, bCar0: B.summary.rows[0].metres, bCar1: B.summary.rows[1].metres, aHuman: A.config.human.A, bHuman: B.config.human.B, ticks: A.stopTick };
            }
            // the page's comparison is a comparison: hand page A a final word from B that disagrees by one bit and it says so
            if (out.pairFinished) { const A = rl(FA), saved = A.state.peerFin; A.state.peerFin = { ...saved, hash: (saved.hash ^ 1) >>> 0 }; await new Promise((r) => setTimeout(r, 300)); out.pairDisagree = txt(FA, "result"); A.state.peerFin = saved; await new Promise((r) => setTimeout(r, 200)); out.pairAgainAgree = txt(FA, "result"); }
            // ---- two players on different races ----
            const MA = mk(q("A", { room: "mis" })), MB = mk(q("B", { room: "mis", countdown: 2, more: "&seed=2" }));   // B starts 2 s after A: A pumps (and announces its race) first, B hears it before B has pumped, halts without ever announcing its own -- the order that left the other page waiting forever until the halting page told it
            out.misBooted = await waitFor(() => rl(MA) && rl(MB) && rl(MA).peer && rl(MB).peer, 90000, "mismatch boot");
            if (out.misBooted) {
                await waitFor(() => rl(MA).state.halt && rl(MB).state.halt, 30000, "mismatch halt");
                out.mis = { aHalt: rl(MA).state.halt, bHalt: rl(MB).state.halt, aTick: rl(MA).peer.session.tick, bTick: rl(MB).peer.session.tick, aText: txt(MA, "state") };
            }
            // ---- a relay that is not there ----
            const NR = mk("?relay=" + encodeURIComponent("ws://127.0.0.1:1") + "&room=x&peer=A");
            out.noRelay = await waitFor(() => rl(NR) && rl(NR).state.halt, 40000, "no relay") ? rl(NR).state.halt : null;
            return out;
        }` });
        await relay.close();
        const ok1 = r.ok && r.result;
        ok("the harness booted race-lockstep.html and drove it", ok1, r.ok ? "" : String(r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 300));
        if (ok1) {
            const p = r.result;
            ok("!! ONE PLAYER: the page boots with no relay as one peer against a bot (a one-peer session), with the idle car still where it started", p.soloBooted && p.soloPeers === 1 && p.idleMoved < 3, `peers ${p.soloPeers}, idle moved ${p.idleMoved && p.idleMoved.toFixed(2)} m, sig ${p.soloSig}`);
            ok("!! holding W on the page drives the car (over 3 m, and the throttle on the wire is 1), and the canvas shows it: the red car's pixels are painted and so is the road", p.afterW && p.afterW.moved > 3 && p.afterW.throttle === 1 && p.redPx > 30 && p.roadPx > 2000, p.afterW ? `moved ${p.afterW.moved.toFixed(1)} m by tick ${p.afterW.tick}; red ${p.redPx} px, road ${p.roadPx} px` : "");
            let replayOk = false, why = "";
            if (p.soloFinished) {
                const mR = await newModule(), cfg = P.playableRace({ seconds: 5, solo: true }), n = p.soloLog.length;
                const rep = G.raceWithGunners(() => worldFromModule(mR, [0, -9.81, 0]), cfg.drivers.map(() => D.zeroWeights()), cfg.gunners.map(() => G.zeroWeights()), { seed: 1, seconds: n * TICK, fleet: p.soloFingerprint ? undefined : undefined, inputsLog: p.soloLog.slice(0, n), city: {} });
                replayOk = n === 300 && rep.fingerprint === p.soloFingerprint; why = `browser ${p.soloFingerprint}, node replay ${rep.fingerprint}, ${n} ticks`;
            }
            ok("!! THE BROWSER'S RACE REPLAYS IN NODE: the commands the page stepped (a human's W through a canvas in a browser) fed to raceWithGunners in node reach the browser's own final fingerprint, tick for tick", replayOk, why || "the solo race did not finish");
            ok("the finished page says so: the result block lists both cars and the final fingerprint, and the state line reads 'finished'", p.soloFinished && /final fingerprint [0-9a-f]{8}/.test(p.soloResult) && /1\. |2\. /.test(p.soloResult) && /finished/.test(p.soloState), (p.soloResult || "").split("\n").slice(0, 2).join(" | "));
            ok("the page COUNTS DOWN before it starts: 0.7 s after the peer exists with countdown=2 nothing has been stepped or pumped and the state line says 'starting in', and the race then runs (tick over 20 within 15 s, no sooner than the countdown)", p.cdBooted && p.cdEarly.tick === 0 && p.cdEarly.sentPumps === 0 && /starting in/.test(p.cdEarly.text) && p.cdRan && p.cdAfter.ms >= 1900, p.cdEarly ? `at 0.7 s: tick ${p.cdEarly.tick}, pumps ${p.cdEarly.sentPumps}, "${p.cdEarly.text}"; tick ${p.cdAfter && p.cdAfter.tick} after ${p.cdAfter && p.cdAfter.ms} ms` : "no boot");
            const q2 = p.pair || {};
            ok("!! TWO PLAYERS through a real relay, two browser instances (each its own wasm): both pages finish the 6 s race and print AGREED, on ONE fingerprint, with the same commands stepped on both", p.pairFinished && q2.aFp === q2.bFp && /AGREED/.test(q2.aText) && /AGREED/.test(q2.bText) && q2.sameLog && !q2.aHalt && !q2.bHalt && q2.aStop === q2.ticks && q2.bStop === q2.ticks && q2.soloStop === 300 && q2.aTick === q2.ticks && q2.bTick === q2.ticks && q2.aLogLen === q2.ticks && q2.bLogLen === q2.ticks, `finished ${p.pairFinished}; ticks ${q2.aTick}/${q2.bTick} of ${q2.ticks}; A ${q2.aFp} B ${q2.bFp}, same log ${q2.sameLog}, halts ${q2.aHalt} / ${q2.bHalt}; A says ${(q2.aText || "").split("\n").slice(-1)[0]}; B says ${(q2.bText || "").split("\n").slice(-1)[0]}`);
            ok("!! each car followed its OWN player: A held W (car 0 drove, over 15 m on both pages) and B held nothing (car 1 went less than half as far, on both pages), and A's page drives the red car and B's the green", p.pairFinished && q2.aCar0 > 15 && q2.bCar0 === q2.aCar0 && q2.aCar1 < q2.aCar0 / 2 && q2.aHuman[0] === 0 && q2.bHuman[0] === 1, p.pairFinished ? `car 0 ${q2.aCar0} m / ${q2.bCar0} m, car 1 ${q2.aCar1} m / ${q2.bCar1} m` : "");
            ok("the page's AGREED is a comparison and not a constant: handed a final word from the other machine that differs by one bit it prints DID NOT AGREE, and AGREED again when the true word is back", /DID NOT AGREE/.test(p.pairDisagree || "") && !/AGREED/.test((p.pairDisagree || "").replace(/DID NOT AGREE/g, "")) && /AGREED/.test(p.pairAgainAgree || ""), (p.pairDisagree || "").split("\n").slice(-1)[0]);
            const m = p.mis || {};
            ok("!! TWO PLAYERS ON DIFFERENT RACES (B opened ?seed=2): both pages STOP before the first step and name it ('different races', with the two signatures)", p.misBooted && /different races/.test(m.aHalt || "") && /different races/.test(m.bHalt || "") && m.aTick === 0 && m.bTick === 0 && /seed1/.test(m.aHalt) && /seed2/.test(m.aHalt), m.aHalt ? m.aHalt.slice(0, 150) : "no halt");
            ok("a relay that is not there is SAID, not waited on forever: the page names the address and what to check", /could not reach the relay at ws:\/\/127\.0\.0\.1:1/.test(p.noRelay || "") || /closed the connection/.test(p.noRelay || ""), p.noRelay || "nothing said");
        }
    }
}

console.log(fails ? `\nracePlay-selfcheck: ${fails} FAILED` : "\nracePlay-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
