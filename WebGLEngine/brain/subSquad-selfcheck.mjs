// WebGLEngine/brain/subSquad-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/subSquad-selfcheck.mjs      (~6 s)
//
// A SQUAD OF DEFENDING SUBS THAT SPREAD OUT, SHARE WHAT THEY HEAR AND SEND PROBES (brain/subSquad.mjs, wired into brain/seaOgre.mjs by its `squad` option):
//   1  THE STATIONS  n boats on an arc across the threat axis, `spread` radians apart at `radius` metres, each in its own depth band (16, 24, 32 m); hand-worked at axis 0 and at axis pi/2; the waypoint sweeps
//                    about the station and is never more than 0.3 rad from it; a lone boat stands ON the axis
//   2  THE FIX       two bearings from two places cross where they should (hand-worked: (0,0) at 45 degrees and (100,0) at 135 degrees cross at (50, -50) in the engine's axes); a bearing older than 6 s is
//                    not used; two nearly parallel bearings (under 12 degrees) give nothing; one source twice is one source; three bearings that do not meet give the least-squares point
//   3  THE WRAP      a boat that hears an OGRE itself is left alone; a boat that hears nothing and has no fix is sent to its station at 2 m/s in its depth band with no fire and no ping; a boat that hears nothing
//                    but has a fix is handed an ECHO at the fix (bearing off its nose, the range, elevation 0) and its tactician decides; a probe is asked for only by a boat that carries them, has some left, has no
//                    fix and hears nothing, and no oftener than every 40 s
//   4  THE ARENA     seaOgre.fight with a squad: the probes are launched 150 m along the nose, three to a carrier and no more, live 120 s, report bearings to the datalink (a fix appears), the frame carries
//                    them and the fix, and a fight WITHOUT a squad is bit-for-bit the fight it was (the same fingerprint as before this option existed); a quiet OGRE (start.loud) is heard later
//
// SABOTAGES (each mutant breaks the thing a row guards; the row that went red, by name; an entry that went 0 red is a finding, and was fixed):
//   brain/subSquad.mjs: Q22 loiter ignored (1) | Q1 radius doubled (2) | Q2 depth step 0 (2) | Q3 sweep a full spread (2) | Q4 offsets not centred (3) | Q5 axis ignored (1) | Q6 fix window 60 s (1) | Q7 minimum angle 0 (1) | Q8 one source
//   counted twice (1) | Q9 fix y sign (3) | Q10 own ear ignored (1) | Q11 patrol keeps firing/pinging (1) | Q12 patrol speed 4 (1) | Q13 echo bearing ignores the heading (1) | Q14 echo range 0 (1) | Q15 probe cooldown 0 (2) |
//   Q16 anyone carries probes (2) | Q17 stock ignored (1) | Q18 probe sent with a fix too (2) | Q19 probe life 300 s (1) | Q20 five probes a boat (0 red THE FIRST TIME: no fight sent a fourth; the stock the arena
//   tells each look is read now, 1) | Q21 sweep period 7 s (0 red THE FIRST TIME: only the amplitude was read; the quarter-period rows now, 1). THE FIRST ROW OF THE STATIONS WAS RED ON A REAL DEFECT: the sweep of 0.3 rad
//   against a spread of 0.5 let two neighbours cross (8 m apart); the sweep is 0.3 x the spread now and the row holds 28 m. brain/seaOgre.mjs: A1 probes dropped at the boat (1) | A2 probes never listen (1) | A3 boats
//   never report (1) | A4 start.loud ignored (3) | A5 the squad option ignored (3) | A6 probes at depth 0 (1) | A7 the frame omits the fix (2) | A8 stock never decremented (0 red THE FIRST TIME; the stock row, 1) |
//   A9 a stock for non-carriers (1).
"use strict";
import * as Q from "./subSquad.mjs";
import * as G from "./seaOgre.mjs";
import * as T from "./subTournament.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const D = Math.PI / 180;
const GUNNER = { fireRange: 420, blindSnr: 22, pingAfter: 1, trackSpeed: 2.5 };

console.log("1. THE STATIONS");
{
    const sq = Q.createSquad(3, { axis: 0, radius: 160, spread: 0.5 }), at = (i, t) => sq.station(i, t);
    // the sweep is sin(2 pi t / 70 + 1.7 i): zero at t = -35 i / pi ... use the offset directly instead of a time where it vanishes
    const ang = (p) => Math.atan2(-p.y, p.x), r = (p) => Math.hypot(p.x, p.y);
    const ts = Array.from({ length: 70 }, (_, k) => k);
    ok("!! every station is `radius` out from the headquarters at every time", ts.every((t) => [0, 1, 2].every((i) => near(r(at(i, t)), 160, 1e-9))));
    ok("!! the sweep is at most 0.3 x the spread (0.15 rad) either side of the boat's own offset (-0.5, 0, +0.5 about the axis), and reaches near it", [0, 1, 2].every((i) => { const off = (i - 1) * 0.5, d = ts.map((t) => ang(at(i, t)) - off); return Math.max(...d.map(Math.abs)) <= 0.15 + 1e-9 && Math.max(...d.map(Math.abs)) > 0.14; }));
    ok("!! the sweep takes 70 s: boat 0 is on its offset at t = 0, a quarter-period (17.5 s) later 0.15 rad round (spread x 0.3), and back on it at 35 s", near(ang(at(0, 0)), -0.5, 1e-9) && near(ang(at(0, 17.5)), -0.5 + 0.15, 1e-9) && near(ang(at(0, 35)), -0.5, 1e-9));
    const mid = ts.map((t) => ang(at(1, t))); ok("the middle boat sweeps about the axis itself", Math.min(...mid) < -0.14 && Math.max(...mid) > 0.14);
    ok("!! depth bands: 16, 24, 32 m, all different", at(0, 0).depth === 16 && at(1, 0).depth === 24 && at(2, 0).depth === 32);
    const t0 = ts.map((t) => [0, 1, 2].map((i) => at(i, t))), minGap = Math.min(...t0.map((ps) => Math.min(Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), Math.hypot(ps[1].x - ps[2].x, ps[1].y - ps[2].y))));
    ok("!! the boats stay apart: stations never closer than 28 m on the chord (spread 0.5 rad at 160 m is 80 m between offsets, less two sweeps of 0.3 x spread)", minGap > 28, `${minGap.toFixed(0)} m`);
    const sq2 = Q.createSquad(2, { axis: Math.PI / 2, radius: 100, spread: 1, hq: [10, 20] }), p = sq2.station(0, 0);
    ok("the axis and the headquarters shift the whole arc (axis pi/2 is -y, hq (10, 20))", Math.abs(p.x - 10) < 100 && p.y < 20 && near(Math.hypot(p.x - 10, p.y - 20), 100, 1e-9));
    const one = Q.createSquad(1, { axis: 0.4, radius: 50 }); ok("a lone boat stands on the axis (offset 0)", near(one.offset(0), 0) && near(Q.createSquad(2, { spread: 0.6 }).offset(1), 0.3));
    let m = ""; try { Q.createSquad(0); } catch (e) { m = String(e.message); } ok("no boats is refused by name", /at least one boat/.test(m), m);
}

console.log("\n2. THE FIX");
{
    const sq = Q.createSquad(2);
    sq.report({ id: "a", x: 0, y: 0 }, -45 * D, 0); sq.report({ id: "b", x: 100, y: 0 }, -135 * D, 0);
    const f = sq.fix(1);
    ok("!! two bearings cross: a at the origin looking 45 degrees right of +x (-45 deg, y flips) and b at (100, 0) looking back at 135 cross at (50, 50) in the engine's y-flipped axes", f && near(f.x, 50, 1e-6) && near(f.y, 50, 1e-6) && f.sources === 2, f ? `${f.x.toFixed(2)}, ${f.y.toFixed(2)}` : "none");
    ok("the angle between them is reported", f && near(f.spanDeg, 90, 1e-6));
    ok("!! a bearing older than 6 s is not used (no fix at 6.5 s), one 6 s old still is", sq.fix(6.5) === null && sq.fix(6) !== null);
    ok("a fix does not exist before its own reports", sq.fix(-1) === null);
    const par = Q.createSquad(2); par.report({ id: "a", x: 0, y: 0 }, 10 * D, 0); par.report({ id: "b", x: 0, y: 50 }, 15 * D, 0);
    ok("!! two bearings 5 degrees apart give nothing (11 degrees, still nothing; 13 degrees, a fix)", par.fix(0) === null && (par.report({ id: "b", x: 0, y: 50 }, 21 * D, 0), par.fix(0) === null) && (par.report({ id: "b", x: 0, y: 50 }, 23 * D, 0), par.fix(0) !== null));
    const one = Q.createSquad(1); one.report({ id: "a", x: 0, y: 0 }, 0, 0); one.report({ id: "a", x: 5, y: 5 }, 1, 0.5);
    ok("!! one source twice is one source (the freshest wins): no fix", one.fix(1) === null);
    const tri = Q.createSquad(3); tri.report({ id: "a", x: 0, y: 0 }, -45 * D, 0); tri.report({ id: "b", x: 100, y: 0 }, -135 * D, 0); tri.report({ id: "c", x: 50, y: 100 }, 90 * D, 0);
    const ft = tri.fix(1); ok("three bearings that all meet at (50, 50) give it, with three sources", ft && near(ft.x, 50, 1e-6) && near(ft.y, 50, 1e-6) && ft.sources === 3);
    const off = Q.createSquad(3); off.report({ id: "a", x: 0, y: 0 }, -45 * D, 0); off.report({ id: "b", x: 100, y: 0 }, -135 * D, 0); off.report({ id: "c", x: 50, y: 100 }, 90 * D + 0.2, 0);
    const fo = off.fix(1); ok("three that do not quite meet give a least-squares point near (50, 50), not one of the pairs' crossings", fo && Math.hypot(fo.x - 50, fo.y - 50) < 12 && Math.hypot(fo.x - 50, fo.y - 50) > 0.5);
}

console.log("\n3. THE WRAP");
{
    const mk = (extra = {}, t = 20) => ({ t, self: { x: 0, y: 0, heading: 0, depth: 20, speed: 2, hp: 100, ammo: 6, ready: true, probes: 3, ...extra }, contacts: [], echoes: [], pings: [] });
    const base = (log) => (obs) => { log.push(obs); return { depth: 20, heading: 0.123, speed: 3, fire: true, ping: true }; };
    {
        const sq = Q.createSquad(3, { axis: 0, probes: [0] }), log = [], d = sq.wrap(1, base(log));
        const own = d({ ...mk(), contacts: [{ kind: "boat", bearing: 0.1, elevation: 0, snr: 20 }] });
        ok("!! a boat that hears the OGRE itself is left alone: the tactician's command comes back untouched", own.heading === 0.123 && own.fire === true && own.ping === true && own.speed === 3 && !own.probe);
        const lone = d(mk()), st = sq.station(1, 20), want = Math.atan2(-(st.y - 0), st.x - 0);
        ok("!! a boat that hears nothing and has no fix goes to its station: heading at it, 2 m/s, its depth band (24 m), no fire and no ping", near(lone.heading, want, 1e-9) && lone.speed === 2 && lone.depth === 24 && lone.fire === false && lone.ping === false);
        const here = d({ ...mk({ x: st.x, y: st.y }) }), near30 = d(mk({ x: st.x - 30, y: st.y })), far = d(mk({ x: st.x - 60, y: st.y }));
        ok("!! it eases in: 2 m/s from 40 m or more out, 1.5 m/s at 30 m, the 0.5 m/s creep ON the station (the speed command is what it is, whatever the tactician wanted)", far.speed === 2 && near30.speed === 1.5 && here.speed === 0.5, `${far.speed} / ${near30.speed} / ${here.speed}`);
        ok("a boat that does not carry probes never asks for one", lone.probe === undefined);
    }
    {
        const sq = Q.createSquad(2, { axis: 0, probes: [0] }), log = [], d = sq.wrap(0, base(log));
        sq.report({ id: "x", x: 200, y: 0 }, 0, 19); sq.report({ id: "y", x: 200, y: 200 }, -90 * D, 19);   // the lines y = 0 from x and x = 200 cross at (200, 0)... wait y's line runs along +y: (200, 200) looking at -90 deg -> -y direction? heading -90 is +y in the engine's flip
        const f = sq.fix(20), c = d(mk());
        ok("a fix exists for the next rows", f !== null, JSON.stringify(f));
        const e = log.at(-1).echoes;
        ok("!! with a fix and no ear of its own the tactician is handed an ECHO at the fix: range from the boat, bearing off its nose, elevation 0, marked datalink", e.length === 1 && near(e[0].range, Math.hypot(f.x, f.y), 1e-6) && near(e[0].bearing, Math.atan2(-f.y, f.x), 1e-9) && e[0].elevation === 0 && e[0].datalink === true);
        ok("the boat's own heading enters the bearing (a boat pointed along +y sees the same fix off its nose)", (() => { const l2 = [], d2 = sq.wrap(0, base(l2)); d2(mk({ heading: 1 })); return near(l2.at(-1).echoes[0].bearing, Math.atan2(-f.y, f.x) - 1, 1e-9); })());
        ok("and its tactician's own command is kept (the squad does not steer a boat that has a fix)", c.heading === 0.123 && c.fire === true && !c.probe);
    }
    {
        const sq = Q.createSquad(2, { axis: 0, probes: [0] }), d0 = sq.wrap(0, () => ({})), d1 = sq.wrap(1, () => ({}));
        const a = d0(mk({}, 0)), b = d0(mk({}, 0)), c = d0(mk({}, 39.9)), e = d0(mk({}, 40)), z = d0(mk({ probes: 0 }, 200)), o = d1(mk({}, 200));
        ok("!! a carrier with probes left asks for one when it hears nothing, then not for 40 s, then again", a.probe === true && b.probe === undefined && c.probe === undefined && e.probe === true);
        ok("!! a carrier with none left does not ask; a boat that does not carry them does not either", z.probe === undefined && o.probe === undefined);
        const sq3 = Q.createSquad(2, { probes: [0] }), d3 = sq3.wrap(0, () => ({})); sq3.report({ id: "x", x: 200, y: 0 }, 0, 100); sq3.report({ id: "y", x: 200, y: 200 }, -90 * D, 100);
        ok("a carrier with a fix does not send a probe (it already knows where)", d3(mk({}, 101)).probe === undefined);
    }
}

console.log("\n4. THE ARENA");
{
    const sides = (n) => Array.from({ length: n }, (_, i) => T.makeSide("d" + i, { theta: GUNNER }).side());
    const go = (n, seed, opts = {}) => { const trace = []; const r = G.fight(sides(n), G.scenario(seed, n), { trace, seconds: 150, ...opts }); return { r, trace }; };
    const a = go(3, 3, { squad: { probes: [0, 1, 2] }, start: { loud: -15 } }), pr = a.r.events.filter((e) => e.type === "probe");
    ok("!! three carriers send out six or more probes in 150 s and no more than nine (three each)", pr.length >= 6 && pr.length <= 9 && a.r.probes === pr.length, `${pr.length}`);
    const per = [1, 2, 3].map((id) => pr.filter((e) => e.boat === id).length);
    ok("!! no boat sends more than three", per.every((x) => x <= 3), per.join());
    const ticks = pr.filter((e) => e.boat === 1).map((e) => e.tick); const gaps = ticks.slice(1).map((t, i) => (t - ticks[i]) / 30);
    ok("!! one boat's probes are at least 40 s apart", gaps.every((g) => g >= 40 - 0.6), gaps.map((g) => g.toFixed(0)).join());
    const f = a.trace.find((q) => q.probes.length > 0);
    ok("the frame carries the live probes (id, place, depth) and a fix once there is one", f && Object.keys(f.probes[0]).sort().join() === "depth,id,x,y" && a.trace.some((q) => q.fix && q.fix.sources >= 2), `${a.trace.filter((q) => q.fix).length} frames with a fix`);
    const life = (() => { const first = {}, last = {}; for (const q of a.trace) for (const p of q.probes) { first[p.id] ??= q.tick; last[p.id] = q.tick; } return Object.keys(first).map((id) => (last[id] - first[id]) / 30); })();
    ok("!! a probe lives 120 s at most (and the first ones live out the 120 of a 150 s fight)", life.length >= 6 && life.every((x) => x <= 120.3) && life.some((x) => x > 100), life.map((x) => x.toFixed(0)).join());
    const p0 = a.trace.find((q) => q.probes.length).probes[0]; const later = a.trace.at(-1).probes.find((p) => p.id === p0.id) || a.trace.find((q) => q.tick > 600 && q.probes.find((p) => p.id === p0.id)).probes.find((p) => p.id === p0.id);
    const first = a.trace.find((q) => q.probes.length > 0 && q.tick > 0), pp = first.probes[first.probes.length - 1], pe = a.r.events.filter((e) => e.type === "probe").find((e) => Math.abs(e.tick - first.tick) <= 6), pb = first.boats.find((b) => b.id === (pe ? pe.boat : 1));
    ok("!! a probe is dropped 150 m along the launching boat's nose (within 15 m of it at the first frame)", pe && Math.abs(Math.hypot(pp.x - pb.x, pp.y - pb.y) - 150) < 15 && Math.abs(pp.depth - pb.depth) < 3, pe ? `${Math.hypot(pp.x - pb.x, pp.y - pb.y).toFixed(0)} m` : "no event");
    ok("a probe never moves", later.x === p0.x && later.y === p0.y);
    const seen = { 1: [], 2: [], 3: [] }, rec = (id, base) => ({ tactics: (o) => { seen[id].push(o.self.probes); return base.tactics(o); }, pilot: base.pilot }), recSides = [1, 2, 3].map((id, i) => rec(id, T.makeSide("r" + i, { theta: GUNNER }).side()));
    const rr = G.fight(recSides, G.scenario(3, 3), { seconds: 150, squad: { probes: [0, 1] }, start: { loud: -15 } }), sent = [1, 2, 3].map((id) => rr.events.filter((e) => e.type === "probe" && e.boat === id).length);
    ok("!! the arena counts the stock: carriers are told 3 probes at the first look and 0 once they are all gone, a boat that carries none is told 0, and the last look reads 3 less what was sent", seen[1][0] === 3 && seen[2][0] === 3 && seen[3][0] === 0 && seen[1].at(-1) === 3 - sent[0] && seen[2].at(-1) === 3 - sent[1] && sent[2] === 0 && seen[1].every((v, i) => i === 0 || v <= seen[1][i - 1]), `sent ${sent.join("/")}, last ${seen[1].at(-1)}/${seen[2].at(-1)}`);
    const nsq = { tactics: (o) => (seen.none = o.self), pilot: T.makeSide("n").side().pilot }; G.fight([nsq], G.scenario(3, 1), { seconds: 5 });
    ok("without a squad the tactician's gauges carry no `probes` at all", !("probes" in seen.none));
    const plain = go(3, 3, {}), off = go(3, 3, { squad: null }), none = G.fight(sides(3), G.scenario(3, 3), { seconds: 150 });
    ok("!! without a squad the fight is bit-for-bit what it was: the same fingerprint with `squad: null`, omitted, and traced or not; no probes, no fix in the frames", plain.r.fingerprint === off.r.fingerprint && plain.r.fingerprint === none.fingerprint && plain.r.probes === 0 && plain.r.squad === false && plain.trace.every((q) => q.probes.length === 0 && q.fix === null));
    ok("with a squad the fight is different (the stations, the patrol) and says so", a.r.squad === true && a.r.fingerprint !== plain.r.fingerprint);
    const loudFirst = (loud) => { const t = go(3, 5, { squad: { probes: [0, 1, 2] }, start: { loud } }).trace.find((q) => q.fix); return t ? t.tick : Infinity; };
    ok("!! a quieter OGRE is found later: the first fix with -15 dB comes after the first fix at +10 (or never)", loudFirst(-15) > loudFirst(10), `${loudFirst(10)} v ${loudFirst(-15)}`);
    const ext = go(3, 3, { squad: { probes: [0] } }); ok("only the named carrier launches probes", ext.r.events.filter((e) => e.type === "probe").every((e) => e.boat === 1));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
