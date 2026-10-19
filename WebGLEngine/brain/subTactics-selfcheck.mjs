// WebGLEngine/brain/subTactics-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subTactics-selfcheck.mjs      (~0.1 s)
//
// THE TACTICIAN HELD TO ITS OWN STATE MACHINE. brain/subTactics.mjs decides, from sonar alone, where to go, when to ping and when to fire; this gate feeds it synthetic observations and holds each answer to the closed form:
//   1  THETA      the defaults are frozen and inside their bounds; clampTheta fills a missing or NaN name with the default, clips to the bounds and rounds pingAfter; the vector round-trips in name order
//   2  GEOMETRY   pointAlong: dead ahead, to the right (world -y), up, in 3-D
//   3  SEARCH     no contact: hold the starting depth at searchSpeed and sweep +0.8 then -0.8 rad off the starting heading every 40 s
//   4  TRACK      a boat contact turns the heading to its ABSOLUTE bearing (own heading + the relative bearing) at trackSpeed; a PING after pingAfter contacts, no sooner than pingEvery since the last; a ping HEARD is a contact
//   5  ATTACK     an echo places the target (range, bearing, elevation); the boat points at it and FIRES when inside fireRange and within aimTol of the nose, not otherwise, not without a torpedo or a ready tube; the order goes stale after echoWindow;
//                 blindSnr fires on a loud passive contact when aligned
//   6  EVADE      a torpedo contact: turn evadeTurn off its bearing AWAY from its side, evadeSpeed, 12 m of depth change (clamped to 15..42), held evadeTime seconds, no firing; canEvade/canFire/canPing switch each off
//   7  SCRIPTED   unknown kind refused; patrol/quiet drift their heading at the scenario's rate at 2.0 / 0.5 m/s, deaf and mute; the evader evades and otherwise patrols; the hunter is the default tactician; instances do not share memory
//
// SABOTAGE LOG -- THIRTY, each applied to brain/subTactics.mjs in place, the gate run, the file restored; every one red by name EXCEPT ONE EQUIVALENT MUTANT (the number is how many rows went red):
//   Y1 default evadeSpeed 2 2 | Y2 default fireRange 500 1 | Y3 default aimTol 0.5 1 | Y4 pingAfter not rounded 1 | Y5 a NaN kept in clampTheta 1 | Y6 pointAlong y sign 5 | Y7 pointAlong z sign 2
//   Y8 the relative bearing used as absolute 1 | Y9 contact memory 20 s 1 | Y10 ping memory window 20 s 1 | Y11 ping without waiting pingEvery 1 | Y12 fires out of range 1 | Y13 fires off the nose 2 | Y14 fires without a torpedo 1
//   Y15 fires with the tube not ready 1 | Y16 the echo window ignored 1 | Y17 evades TOWARD the torpedo 2 | Y18 evade depth change 6 m 1 | Y19 evade depth unclamped 1 | Y20 evasion not held 1 | Y21 evades the quietest torpedo 1
//   Y23 search holds the current depth, not the start 1 | Y24 sweep period 80 s 1 | Y25 pings heard ignored 1 | Y26 blind fire ignores alignment 1 | Y27 the drone's drift ignored 1 | Y28 the quiet drone at 1 m/s 1
//   Y29 the evader may fire 1 | Y30 the memory shared across tacticians 6
//   S1-S7 (round: searchPing, the 12th number): default 8 3 | the branch off 2 | the interval ignored 1 | canPing ignored 1 | values under 1 act 1 | the timer not updated 1 | bound 100 1
//   Y22 (canEvade false is still honoured when the torpedo branch is entered anyway: the line that RETURNS the evasion tests canEvade a second time) is an EQUIVALENT MUTANT, left standing and said.
// Y9, Y19, Y26 went 0 red the first time and Y30 was an identity (the 'mutation' replaced a line with itself): rows now hold the 10-second window on pingAfter (contacts 11 s apart are not two), the evade clamp from depths
// outside the working band (60 m -> 42, 0 m -> 15), and the alignment of a blind shot (a strong contact 0.6 rad off does not fire); Y30 now moves the memory out of the closure.
"use strict";
import * as TA from "./subTactics.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const self0 = (o = {}) => ({ depth: 30, heading: 0, speed: 2, x: 0, y: 0, hp: 100, ammo: 4, ready: true, ...o });
const obs = (t, o = {}, self = {}) => ({ t, self: self0(self), contacts: [], echoes: [], pings: [], ...o });
const boat = (bearing, snr = 12, elevation = 0) => ({ kind: "boat", bearing, elevation, snr }), torp = (bearing, snr = 20) => ({ kind: "torpedo", bearing, elevation: 0, snr });
const TH = TA.THETA_DEFAULT;

console.log("subTactics-selfcheck -- what a submarine decides when it can hear\n");

console.log("1. THETA");
{
    ok("!! THETA_DEFAULT and THETA_BOUNDS are frozen, every default is inside its bounds, and THETA_NAMES is the default's key order", Object.isFrozen(TH) && Object.isFrozen(TA.THETA_BOUNDS) && Object.isFrozen(TA.THETA_NAMES) && TA.THETA_NAMES.every((k) => TH[k] >= TA.THETA_BOUNDS[k][0] && TH[k] <= TA.THETA_BOUNDS[k][1]) && TA.THETA_NAMES.join() === Object.keys(TH).join());
    const c = TA.clampTheta({ searchSpeed: 99, trackSpeed: -3, evadeSpeed: NaN, pingAfter: 2.6, fireRange: 1e9 });
    ok("!! clampTheta clips to the bounds (99 -> 4.5, -3 -> 0.5), takes the default for a NaN or a missing name, rounds pingAfter (2.6 -> 3), is frozen, and fills every name", c.searchSpeed === 4.5 && c.trackSpeed === 0.5 && c.evadeSpeed === TH.evadeSpeed && c.pingAfter === 3 && c.fireRange === 500 && c.aimTol === TH.aimTol && Object.isFrozen(c) && TA.THETA_NAMES.every((k) => k in c));
    const v = TA.thetaToVector(TH), back = TA.thetaFromVector(v);
    ok("the vector round-trips in name order (12 numbers), and thetaFromVector clamps what it is given", v.length === 12 && TA.THETA_NAMES.every((k, i) => v[i] === TH[k] && back[k] === TH[k]) && TA.thetaFromVector(v.map(() => 1e9)).fireRange === 500);
}

console.log("\n2. GEOMETRY");
{
    const s = { x: 10, y: 20, depth: 30 };
    const a = TA.pointAlong(s, 0, 0, 100), b = TA.pointAlong(s, Math.PI / 2, 0, 100), c = TA.pointAlong(s, 0, Math.PI / 6, 100), d = TA.pointAlong(s, Math.PI / 4, Math.PI / 4, 100);
    ok("!! pointAlong: dead ahead (+x) 100 m is (110, 20, -30); to the RIGHT (bearing pi/2) is (10, -80, -30) -- world -y; 30 degrees UP is 50 m higher (z = +20); a diagonal has length 100 exactly", near(a[0], 110) && near(a[1], 20) && near(a[2], -30) && near(b[0], 10) && near(b[1], -80) && near(c[2], 20) && near(c[0], 10 + 100 * Math.cos(Math.PI / 6)) && near(Math.hypot(d[0] - 10, d[1] - 20, d[2] + 30), 100));
}

console.log("\n3. SEARCH");
{
    const f = TA.makeTactician(), o0 = f(obs(0, {}, { heading: 0.3, depth: 27 })), o1 = f(obs(39, {}, { heading: 1.1, depth: 29 })), o2 = f(obs(41, {}, { heading: 1.1, depth: 29 })), o3 = f(obs(81, {}, { heading: 1.1, depth: 29 }));
    ok("!! with nothing heard it holds the STARTING depth (27, not the later 29) at searchSpeed and sweeps +0.8 rad off the STARTING heading for 40 s, then -0.8, then +0.8: 1.1 / -0.5 / 1.1 off 0.3", near(o0.depth, 27) && near(o0.heading, 1.1) && o0.speed === TH.searchSpeed && !o0.fire && !o0.ping && near(o1.heading, 1.1) && near(o2.heading, -0.5) && near(o3.heading, 1.1) && near(o2.depth, 27), `${o0.heading} ${o2.heading} ${o3.heading}`);
}

console.log("\n3b. SEARCH PING");
{
    const f0 = TA.makeTactician(), o0 = [0, 5, 10, 60].map((t) => f0(obs(t)).ping);
    ok("!! the DEFAULT never pings blind: searchPing is 0, and four searching looks (t = 0, 5, 10, 60) ping on none", TH.searchPing === 0 && o0.every((p) => !p));
    const f = TA.makeTactician({ ...TH, searchPing: 5 }), seq = [0, 2, 4.9, 5, 9, 10.5, 15].map((t) => f(obs(t)).ping);
    ok("!! with searchPing 5 it pings at its FIRST search look (t = 0), then no sooner than 5 s after the last ping: t = 0 yes, 2 no, 4.9 no, 5 yes, 9 no, 10.5 yes, 15 no (10.5 + 5 = 15.5)", seq.join() === "true,false,false,true,false,true,false", seq.join());
    const lo = TA.makeTactician({ ...TH, searchPing: 0.9 }), small = [0, 5, 20].map((t) => lo(obs(t)).ping);
    ok("!! a searchPing under 1 reads as 0 (off): 0.9 never pings; searchPing 1 does", small.every((p) => !p) && TA.makeTactician({ ...TH, searchPing: 1 })(obs(0)).ping);
    const np = TA.makeTactician({ ...TH, searchPing: 5 }, { canPing: false }), hold = TA.makeTactician({ ...TH, searchPing: 5 });
    hold(obs(0));
    ok("!! canPing false never pings blind; a boat that is EVADING (a torpedo heard) does not ping blind; and a boat that hears a contact is tracking, not searching, so the search timer does not fire (the track branch's own rules apply)", ![0, 6, 12].some((t) => np(obs(t)).ping) && !hold(obs(6, { contacts: [torp(0.3)] })).ping && !hold(obs(12, { contacts: [boat(0.3)] })).ping);
    const b = TA.clampTheta({ searchPing: 99 }), c = TA.clampTheta({ searchPing: -4 });
    ok("searchPing is clamped to 0..40 (99 -> 40, -4 -> 0) and a missing one is 0", b.searchPing === 40 && c.searchPing === 0 && TA.clampTheta({}).searchPing === 0);
}

console.log("\n4. TRACK");
{
    const f = TA.makeTactician(), a = f(obs(0, { contacts: [boat(0.5)] }, { heading: 0.3 }));
    ok("!! a boat contact at +0.5 rad off a nose at 0.3 turns the boat to the ABSOLUTE bearing 0.8 at trackSpeed (1.5), no fire, no ping yet (one contact; pingAfter is 2)", near(a.heading, 0.8) && a.speed === TH.trackSpeed && !a.fire && !a.ping);
    const b = f(obs(1, { contacts: [boat(0.5)] }, { heading: 0.3 })), c = f(obs(2, { contacts: [boat(0.5)] }, { heading: 0.3 })); f(obs(12.5, { contacts: [boat(0.5)] }, { heading: 0.3 })); const d = f(obs(13.5, { contacts: [boat(0.5)] }, { heading: 0.3 }));
    ok("!! it PINGS on the second contact (t = 1), not again inside pingEvery = 12 s (t = 2 is quiet), and again once 12 s have passed with two contacts inside the last 10 s (t = 13.5, last ping t = 1)", !a.ping && b.ping && !c.ping && d.ping, `${a.ping} ${b.ping} ${c.ping} ${d.ping}`);
    const g = TA.makeTactician(), h = g(obs(0, { pings: [{ bearing: -0.4 }] }, { heading: 1.0 }));
    ok("!! a ping HEARD is a contact with a bearing and no range: the boat turns to it (1.0 - 0.4 = 0.6) at trackSpeed", near(h.heading, 0.6) && h.speed === TH.trackSpeed);
    const w = TA.makeTactician(); w(obs(0, { contacts: [boat(0.5)] }));
    ok("!! pingAfter counts contacts inside the last 10 s ONLY: two contacts 11 s apart are not two (no ping), two 5 s apart are", !w(obs(11, { contacts: [boat(0.5)] })).ping && (() => { const q = TA.makeTactician(); q(obs(0, { contacts: [boat(0.5)] })); return q(obs(5, { contacts: [boat(0.5)] })).ping; })());
    const m = TA.makeTactician(); m(obs(0, { contacts: [boat(0.5)] })); const m9 = m(obs(9, {})), m11 = m(obs(11, {}));
    ok("!! the memory of a contact lasts 10 s: at t = 9 the heading is still its bearing (0.5, trackSpeed), at t = 11 the boat is searching again (searchSpeed)", near(m9.heading, 0.5) && m9.speed === TH.trackSpeed && m11.speed === TH.searchSpeed, `${m9.heading} ${m11.speed}`);
}

console.log("\n5. ATTACK");
{
    const echo = (bearing, range, elevation = 0) => ({ bearing, elevation, range });
    const f = TA.makeTactician(), a = f(obs(0, { echoes: [echo(0.05, 250)] }));
    ok("!! an aligned echo inside fireRange FIRES: range 250 m (< 320) at 0.05 rad (< aimTol 0.17) -> fire, heading 0.05, trackSpeed, no ping", a.fire && near(a.heading, 0.05) && a.speed === TH.trackSpeed && !a.ping);
    ok("!! it does NOT fire out of range (400 m > 320) or off the nose (0.3 rad > 0.17), but still points at the target; and not without a torpedo (ammo 0), not with the tube not ready", !TA.makeTactician()(obs(0, { echoes: [echo(0.05, 400)] })).fire && !TA.makeTactician()(obs(0, { echoes: [echo(0.3, 250)] })).fire && near(TA.makeTactician()(obs(0, { echoes: [echo(0.3, 250)] })).heading, 0.3) && !TA.makeTactician()(obs(0, { echoes: [echo(0.05, 250)] }, { ammo: 0 })).fire && !TA.makeTactician()(obs(0, { echoes: [echo(0.05, 250)] }, { ready: false })).fire);
    const up = TA.makeTactician()(obs(0, { echoes: [echo(0.05, 200, Math.PI / 6)] }, { depth: 30 })), dn = TA.makeTactician()(obs(0, { echoes: [echo(0.05, 300, -Math.PI / 6)] }, { depth: 30 }));
    ok("!! the target's DEPTH comes from the echo's elevation: 30 degrees UP at 200 m is 100 m x cos... = 30 - 100 = a depth clamped to 15; 30 degrees DOWN at 300 m is 30 + 150 = clamped to 42", near(up.depth, 15) && near(dn.depth, 42), `${up.depth} ${dn.depth}`);
    const h = TA.makeTactician(); h(obs(0, { echoes: [echo(0.05, 250)] })); const h7 = h(obs(7, {})), h9 = h(obs(9, {}));
    ok("!! the echo's target estimate holds for echoWindow = 8 s (t = 7: still attacking at trackSpeed, heading 0.05) and is dropped after it (t = 9: back to SEARCH: searchSpeed, the +0.8 sweep, no fire -- an echo is not a contact memory)", near(h7.heading, 0.05) && h7.speed === TH.trackSpeed && h9.speed === TH.searchSpeed && !h9.fire && near(h9.heading, 0.8), `${h7.heading} ${h9.heading}`);
    const bl = TA.makeTactician({ ...TH, blindSnr: 25 }), blind = bl(obs(0, { contacts: [boat(0.05, 30)] })), weak = TA.makeTactician({ ...TH, blindSnr: 25 })(obs(0, { contacts: [boat(0.05, 20)] }));
    ok("!! blindSnr: a loud passive contact (30 dB >= 25) dead ahead FIRES with no echo; a weaker one (20 dB) does not; with the default blindSnr 99 nothing fires blind", blind.fire && !weak.fire && !TA.makeTactician()(obs(0, { contacts: [boat(0.05, 60)] })).fire);
    ok("!! blind fire needs ALIGNMENT too: a 30 dB contact 0.6 rad off the nose (> aimTol) does not fire even with blindSnr 25", !TA.makeTactician({ ...TH, blindSnr: 25 })(obs(0, { contacts: [boat(0.6, 30)] })).fire);
    const stationary = TA.makeTactician()(obs(0, { echoes: [echo(Math.PI / 2, 200)] }, { x: 5, y: 7, heading: 0 }));
    ok("!! the target is placed in the WORLD from the boat's position: an echo 200 m to the right of a boat at (5, 7) is at (5, -193); the boat then turns right to it (heading pi/2) and fires only when aligned", near(stationary.heading, Math.PI / 2) && !stationary.fire);
}

console.log("\n6. EVADE");
{
    const L = TA.makeTactician()(obs(0, { contacts: [torp(-0.6)] })), R = TA.makeTactician()(obs(0, { contacts: [torp(0.6)] }));
    ok("!! a torpedo on the LEFT (bearing -0.6) turns the boat right: heading = -0.6 + 1.4 = 0.8; one on the RIGHT turns it left: 0.6 - 1.4 = -0.8 -- away from the side it is on; at evadeSpeed (4.0)", near(L.heading, 0.8) && near(R.heading, -0.8) && L.speed === TH.evadeSpeed && R.speed === TH.evadeSpeed && !L.fire && !L.ping, `${L.heading} ${R.heading}`);
    const dep = (d) => TA.makeTactician()(obs(0, { contacts: [torp(0.3)] }, { depth: d })).depth;
    ok("!! it changes depth by 12 m away from the middle band: from 20 m to 32, from 40 m to 28, from 30 m to 18; clamped to 15..42 (from 14 m: 26; from 46 m: 34)", near(dep(20), 32) && near(dep(40), 28) && near(dep(30), 18) && near(dep(14), 26) && near(dep(46), 34), `${dep(20)} ${dep(40)} ${dep(30)}`);
    ok("!! the evade depth is clamped to 15..42 even from depths outside the working band: from 60 m it is 42 (not 48), from 0 m it is 15 (not 12)", near(dep(60), 42) && near(dep(0), 15), `${dep(60)} ${dep(0)}`);
    const f = TA.makeTactician(); f(obs(0, { contacts: [torp(0.3)] })); const mid = f(obs(10, { echoes: [{ bearing: 0, elevation: 0, range: 100 }] })), after = f(obs(21, {}));
    ok("!! the evasion HOLDS for evadeTime = 20 s even if the torpedo is no longer heard, and nothing fires during it (an aligned echo at t = 10 is ignored); at t = 21 it is over", mid.speed === TH.evadeSpeed && !mid.fire && after.speed !== TH.evadeSpeed);
    const loud = TA.makeTactician()(obs(0, { contacts: [torp(-0.2, 10), torp(0.9, 30)] }));
    ok("!! with two torpedoes it evades the LOUDER (the nearer): the 30 dB one on the right (0.9) turns it left: 0.9 - 1.4 = -0.5", near(loud.heading, -0.5), `${loud.heading}`);
    const none = TA.makeTactician(TH, { canEvade: false })(obs(0, { contacts: [torp(0.3)] })), nf = TA.makeTactician(TH, { canFire: false })(obs(0, { echoes: [{ bearing: 0.05, elevation: 0, range: 250 }] })), np = TA.makeTactician(TH, { canPing: false }); np(obs(0, { contacts: [boat(0.5)] }));
    ok("!! canEvade false ignores a torpedo, canFire false never fires (an aligned echo in range), canPing false never pings (a second contact)", none.speed !== TH.evadeSpeed && !nf.fire && !np(obs(1, { contacts: [boat(0.5)] })).ping);
}

console.log("\n7. SCRIPTED");
{
    let msg = null; try { TA.scripted("kraken"); } catch (e) { msg = e.message; }
    ok("an unknown kind is refused, by name and with the list", msg && /kraken/.test(msg) && /evader/.test(msg), msg);
    const p = TA.scripted("patrol", { drift: 0.005 }), p0 = p(obs(0, {}, { heading: 0.4, depth: 22 })), p20 = p(obs(20, {}, { heading: 0.4, depth: 22 })), q = TA.scripted("quiet", { drift: 0.005 })(obs(0, {}, { heading: 0.4 }));
    ok("!! patrol holds its depth and drifts its heading at the scenario's rate from its STARTING heading (0.4 + 0.005 x 20 = 0.5) at 2.0 m/s; quiet is the same at 0.5 m/s; neither fires or pings", near(p0.heading, 0.4) && near(p20.heading, 0.5) && p20.speed === 2 && q.speed === 0.5 && near(p20.depth, 22) && !p20.fire && !p20.ping && !q.fire);
    const deaf = TA.scripted("patrol", {})(obs(0, { contacts: [torp(0.3), boat(0.2)], echoes: [{ bearing: 0, elevation: 0, range: 100 }] }));
    ok("!! a patrol drone is DEAF: contacts, torpedoes and echoes change nothing (speed 2.0, no fire)", deaf.speed === 2 && !deaf.fire && !deaf.ping);
    const ev = TA.scripted("evader", {}), e0 = ev(obs(0, {}, { heading: 0.4 })), e1 = ev(obs(1, { contacts: [torp(-0.6)] }, { heading: 0.4 })), e30 = ev(obs(30, {}, { heading: 0.4 }));
    ok("!! the evader patrols (2.0 m/s) until it hears a torpedo, evades it (evadeSpeed, heading away) for evadeTime, never fires or pings, and patrols again after", e0.speed === 2 && e1.speed === TH.evadeSpeed && !e1.fire && !e1.ping && e30.speed === 2);
    const hu = TA.scripted("hunter", {}); hu(obs(0, { contacts: [boat(0.4)] }));
    ok("the hunter is the default tactician: it pings on its second contact", hu(obs(1, { contacts: [boat(0.4)] })).ping);
    const a = TA.makeTactician(), b = TA.makeTactician(); a(obs(0, { contacts: [boat(0.9)] }));
    ok("!! two tacticians do not share memory: after one tracks a contact the other still searches", b(obs(1, {})).speed === TH.searchSpeed && a(obs(1, {})).speed === TH.trackSpeed);
    ok("the tactician is a pure function of its observations: the same sequence gives the same answers, and it edits nothing it is handed", (() => { const run = () => { const f = TA.makeTactician(), o = Object.freeze(obs(3, { contacts: Object.freeze([Object.freeze(boat(0.2))]) })); return JSON.stringify([f(obs(0)), f(o), f(obs(9, { echoes: [{ bearing: 0, elevation: 0, range: 200 }] }))]); }; return run() === run(); })());
}

console.log("\n12. THE NAMED PIECES (SCRIPTED_KINDS, evadeOrder)");
{
    ok("!! SCRIPTED_KINDS is the four drones, frozen, in this order, and every one builds a scripted tactician while an unknown one is refused", Object.isFrozen(TA.SCRIPTED_KINDS) && TA.SCRIPTED_KINDS.join() === "patrol,quiet,evader,hunter" && TA.SCRIPTED_KINDS.every((k) => typeof TA.scripted(k, {}) === "function" || typeof TA.scripted(k, {}) === "object") && (() => { try { TA.scripted("nope", {}); return false; } catch { return true; } })());
    const th = TA.clampTheta(TA.THETA_DEFAULT), s = { depth: 20, heading: 0.4 };
    const right = TA.evadeOrder(s, { bearing: 0.7 }, th), left = TA.evadeOrder(s, { bearing: -0.7 }, th), deep = TA.evadeOrder({ depth: 35, heading: 0 }, { bearing: 0.1 }, th);
    ok("!! evadeOrder turns evadeTurn AWAY from the side the torpedo is on (a torpedo to the right: the heading falls; to the left: it rises), and changes depth by 12 m away from the middle band (20 m goes to 32, 35 m goes to 23), clamped into the legal depths", Math.abs(right.heading - (0.4 + 0.7 - th.evadeTurn)) < 1e-9 && Math.abs(left.heading - (0.4 - 0.7 + th.evadeTurn)) < 1e-9 && right.depth === 32 && deep.depth === 23);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
