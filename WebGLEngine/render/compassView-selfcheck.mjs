// WebGLEngine/render/compassView-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~4 s with a browser; the arithmetic alone ~1 s)
//
// Run: node render/compassView-selfcheck.mjs
//
// THE COMPASS-DROPOUT VIEW: the plain autopilot beside the dead-reckoning navigator, in the Sub Aquarium (render/compassView.mjs, render/subAquariumSim.mjs events "dropout" and "navigator", sub-aquarium.html's compass test).
//   1  THE NUMBERS   dialInfo reads a row in degrees (the error wrapped), refuses a row with no compass event or a non-compass event; pair picks the first plain and the first navigator; pushTrace keeps 300 points and never edits what it is
//                    given; lineFor is the list line
//   2  THE DRAWING   with a context that records its calls: the true needle is green and reaches 0.95 r at the heading's point (0 east, a right turn up the screen's clockwise-from-above sense of the plan view), the shown needle amber at 0.8 r, the face
//                    turns red when the compass is dark, an empty dial says "not running", the trace draws a line per series and none for a series of one point
//   3  THE WINDOWS   the compass reports for 10 s, is dark for 16 s, and repeats every 40 s, on the event's own clock
//   4  THE SIM       two subs started together on the plain dropout and on the navigator, 120 s, three tank seeds: the plain autopilot's heading error reaches more than 25 degrees in the dark and the navigator's never reaches 2; neither is
//                    lost; both read valid and zero in the light; a compass event has NO tank; switching a flood to a dropout takes the tank away; a new target mid-dark (the tank retargets every 20-45 s) does not reset the navigator
//   5  THE PAGE      (a browser with WebGL; SKIPPED, and said, without one) the compass test button puts the first sub on the dropout and the second on the navigator, the canvas is drawn (non-empty), the list rows carry the line, and pressing
//                    it again ends both
//
// v4904 -- SECTION 1 gained the estimator kinds and 1b the tank's mark (drawDark). SABOTAGES (each in place on render/compassView.mjs, restored): C1 the estimator kinds missing from KINDS 1 | C2 a prototype key accepted as an event (`in`) 1 | C3 the ghost line's y not flipped 1 | C4 the ring drawn solid 1 | C5 the line drawn for a NaN belief 1. (C1 first CRASHED, red but not by name, on a null dial; the row now reads `(dialInfo(...) || {}).kind`.)
//   sub-aquarium.html (v4904), each in place and restored: P4 the plan ring never drawn 2 (the source row and the live row) | P5 the builders never registered 2 | P6 the fly button starting the other event 2 | P7 the ghost line along the TRUE heading, not the belief 1 (the source row only: the live row cannot tell the two lines apart; the belief itself is held by
//   subAquariumEvents-selfcheck section 9). The live row first ran on a sub with its event started by a click on the LIST ROW, which selects it.
// SABOTAGE LOG -- TWENTY-SIX, each applied in place, the gate run, the file restored; every one red by name (rows red in brackets):
//   render/compassView.mjs: K1 the error not wrapped 2 | K2 the two names swapped 5 | K3 the LAST plain row taken 2 | K4 the trace not capped 3 | K5 the trace edited in place 3 | K6 the needle's y sign flipped 3 | K7 the shown needle as long as the true 2
//   K8 the true needle not green (see below) | K9 a dark face not red 2 | K10 the trace scale 180 2 | K11 the error printed signed 2 | K12 a NaN time pushed 3 | K13 any event accepted as a compass row 2
//   render/subAquariumSim.mjs: K14 the dark window at 20 s 3 | K15 the navigator not behind the navigator (a crash too: the navigator's `last` is read) 1 | K16 the dropout flown behind the navigator 4 | K17 the navigator not told how long a tick was 1 | K18 a compass event given a tank 5
//   K19 the pilot handed a new target object each tick (a crash too: the navigator is reset every tick and has no estimate) 1 | K20 the held heading follows the true one in the dark 1 | K21 the world not turned in the dark 3 | K22 error 0.01 in the light 2
//   v4901, found by the rig's verify (a slower box, 'compass ok' where DARK was due): the row after the 10 s window waited 9 s of WALL time and the page steps the tank per frame, so a slow box had simulated less; it POLLS FOR THE DARK STATE now (60 s). K21 the dark window never opening (darkFrom 1000 in the sim) 3 red, by name.
//   sub-aquarium.html: P1 the two events swapped 4 | P2 the dials never drawn 2 | P3 the list line never written 4
// K8 was applied against a text that did not contain it on the first pass (the shell had left the file mid-restore from the battery before it) and the run printed NOT APPLIED rather than 0 red; the file was found with an amber true needle afterwards, mended, and K8 re-run alone.
// TWO FINDINGS THE GATE MADE BEFORE ANY SABOTAGE: the navigator integrates over a fixed tick, and the tank clips its last tick to the frame (3-7 degrees of error at 10x in the page against 0.1 in a whole-tick run): tools/subNavigator.mjs gained an optional aux.dt and the 13.7 ms row holds it; and a pilot handed a fresh target object each tick resets the navigator every time (the tank makes one outside its steering box), so the pilot is handed one object.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as CV from "./compassView.mjs";
import * as A from "./subAquariumSim.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../tools/ship/playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const D = Math.PI / 180;
const row = (o = {}) => ({ id: "a", event: "dropout", heading: 30 * D, compass: { valid: false, seen: 90 * D, error: 60 * D }, ...o });

console.log("compassView-selfcheck -- the plain autopilot beside the navigator\n");

console.log("1. THE NUMBERS");
{
    const d = CV.dialInfo(row());
    ok("!! a dark plain row: true 30, shown 90, error 60 degrees, dark, named plain autopilot", d && Math.abs(d.trueDeg - 30) < 1e-9 && Math.abs(d.seenDeg - 90) < 1e-9 && Math.abs(d.errDeg - 60) < 1e-9 && d.dark && !d.valid && d.kind === "plain autopilot");
    ok("!! a navigator row is named navigator; a lit compass is valid, not dark", CV.dialInfo(row({ event: "navigator" })).kind === "navigator" && CV.dialInfo(row({ compass: { valid: true, seen: 0, error: 0 } })).valid === true && CV.dialInfo(row({ compass: { valid: true, seen: 0, error: 0 } })).dark === false);
    ok("!! the error is wrapped: 350 degrees is -10, -200 is 160", Math.abs(CV.dialInfo(row({ compass: { valid: false, seen: 0, error: 350 * D } })).errDeg + 10) < 1e-9 && Math.abs(CV.dialInfo(row({ compass: { valid: false, seen: 0, error: -200 * D } })).errDeg - 160) < 1e-9);
    ok("!! no dial for a row with no compass, for null, and for a flood row that happens to carry a compass field", CV.dialInfo(row({ compass: null })) === null && CV.dialInfo(null) === null && CV.dialInfo(row({ event: "flood" })) === null && CV.dialInfo(row({ event: null })) === null);
    ok("a NaN heading or error reads as zero, not NaN", (() => { const q = CV.dialInfo(row({ heading: NaN, compass: { valid: false, seen: NaN, error: NaN } })); return q.trueDeg === 0 && q.seenDeg === 0 && q.errDeg === 0; })());
    const rows = [row({ id: "x", event: "flood" }), row({ id: "n1", event: "navigator" }), row({ id: "p1" }), row({ id: "p2" }), row({ id: "n2", event: "navigator" })], pr = CV.pair(rows);
    ok("!! pair takes the FIRST plain and the FIRST navigator (and null for a missing one)", pr.plain.id === "p1" && pr.nav.id === "n1" && CV.pair([]).plain === null && CV.pair(null).nav === null && CV.pair([row()]).nav === null);
    let tr = []; const keep = tr; tr = CV.pushTrace(tr, row(), 1);
    ok("!! pushTrace adds the ABSOLUTE error and the dark flag, does not edit the trace it was given, and adds nothing for a row with no compass or a bad time", tr.length === 1 && Math.abs(tr[0].e - 60) < 1e-9 && tr[0].dark === true && keep.length === 0 && CV.pushTrace(tr, row({ compass: null }), 2) === tr && CV.pushTrace(tr, row(), NaN) === tr);
    let big = []; for (let i = 0; i < 400; i++) big = CV.pushTrace(big, row(), i);
    ok("!! the trace keeps the newest 300 points", big.length === CV.TRACE_MAX && CV.TRACE_MAX === 300 && big[0].t === 100 && big[299].t === 399);
    ok("!! the list line names the pilot, the compass state and the whole degrees of error; empty for a row with none", CV.lineFor(row()) === "PLAIN AUTOPILOT · compass DARK · heading error 60°" && CV.lineFor(row({ event: "navigator", compass: { valid: true, seen: 0, error: 0.4 * D } })) === "NAVIGATOR · compass ok · heading error 0°" && CV.lineFor(row({ compass: null })) === "");
    // v4904 -- the two estimator events read like the others (their `seen` is the heading the autopilot read last), and a prototype key is not an event
    ok("!! the fly estimator and the random-wiring estimator are named, dial and list line alike; `constructor`, `toString` and `__proto__` are not events", (CV.dialInfo(row({ event: "fly-estimator" })) || {}).kind === "fly estimator" && (CV.dialInfo(row({ event: "er-estimator" })) || {}).kind === "random-wiring estimator" && CV.lineFor(row({ event: "fly-estimator" })) === "FLY ESTIMATOR · compass DARK · heading error 60°" && CV.lineFor(row({ event: "er-estimator", compass: { valid: true, seen: 0, error: 0 } })) === "RANDOM-WIRING ESTIMATOR · compass ok · heading error 0°" && ["constructor", "toString", "__proto__"].every((e) => CV.dialInfo(row({ event: e })) === null));
    ok("  and pair still takes the first plain and the first navigator when estimator rows are listed first (an estimator is neither)", (() => { const p = CV.pair([row({ id: "f", event: "fly-estimator" }), row({ id: "e", event: "er-estimator" }), row({ id: "n", event: "navigator" }), row({ id: "p" })]); return p.plain.id === "p" && p.nav.id === "n"; })());
}

console.log("\n1b. THE TANK'S MARK OF A DARK COMPASS: the amber ring and the ghost line along the believed heading (v4904)");
{
    const rec = () => { const calls = []; return new Proxy({}, { get: (_, k) => (k === "calls" ? calls : (...a) => { calls.push([k, ...a]); }), set: (_, k, v) => { calls.push(["set:" + k, v]); return true; } }); };
    const g = rec(), r = CV.drawDark(g, 100, 80, 0, 24), c = g.calls;
    ok("!! drawDark: an amber dashed ring of the radius given, centred on the sub", c.some((x) => x[0] === "arc" && x[1] === 100 && x[2] === 80 && x[3] === 24) && c.some((x) => x[0] === "set:strokeStyle" && x[1] === "#f6a623") && c.some((x) => x[0] === "setLineDash" && x[1].length === 2));
    ok("!! ...and a ghost line from the centre along the BELIEVED heading for 2.2 r: east for 0, and the canvas's y is flipped (a belief of +90 degrees points UP the screen, not down)", Math.abs(r.tipX - (100 + 24 * 2.2)) < 1e-9 && Math.abs(r.tipY - 80) < 1e-9 && c.some((x) => x[0] === "lineTo" && Math.abs(x[1] - r.tipX) < 1e-9) && (() => { const q = CV.drawDark(rec(), 0, 0, Math.PI / 2, 10); return Math.abs(q.tipX) < 1e-9 && q.tipY < -21.9; })());
    const h = rec(), n = CV.drawDark(h, 0, 0, NaN, 10);
    ok("  a belief that is not a number draws the ring and no line", n.ring === true && n.tipX === null && !h.calls.some((x) => x[0] === "lineTo"));
}

console.log("\n2. THE DRAWING");
{
    const rec = () => { const calls = [], g = new Proxy({}, { get: (_, k) => (k === "calls" ? calls : (...a) => { calls.push([k, ...a]); }), set: (_, k, v) => { calls.push(["set:" + k, v]); return true; } }); return g; };
    const g = rec(); CV.drawDial(g, 100, 100, 50, CV.dialInfo(row()));
    const c = g.calls, moves = c.filter((x) => x[0] === "moveTo"), lines = c.filter((x) => x[0] === "lineTo");
    const strokeAt = (i) => { let s = null; for (let k = i; k >= 0; k--) if (c[k][0] === "set:strokeStyle") { s = c[k][1]; break; } return s; };
    ok("!! two needles from the centre: the shown one (90 degrees: straight UP the screen) to 0.8 r, the true one (30 degrees) to 0.95 r", moves.length === 2 && moves.every((m) => m[1] === 100 && m[2] === 100) && Math.abs(lines[0][1] - 100) < 1e-9 && Math.abs(lines[0][2] - (100 - 40)) < 1e-9 && Math.abs(lines[1][1] - (100 + 47.5 * Math.cos(30 * D))) < 1e-9 && Math.abs(lines[1][2] - (100 - 47.5 * Math.sin(30 * D))) < 1e-9);
    const idxLine = (n) => c.findIndex((x, i) => x[0] === "lineTo" && c.slice(0, i).filter((y) => y[0] === "lineTo").length === n);
    ok("!! the true needle is green and the shown needle amber", strokeAt(idxLine(1)) === "#5fe08a" && strokeAt(idxLine(0)) === "#f6a623");
    ok("!! a dark compass turns the face red (outline and fill); a lit one does not", c.some((x) => x[0] === "set:strokeStyle" && x[1] === "#ff7a7a") && !(() => { const h = rec(); CV.drawDial(h, 0, 0, 10, CV.dialInfo(row({ compass: { valid: true, seen: 0, error: 0 } }))); return h.calls.some((x) => x[0] === "set:strokeStyle" && x[1] === "#ff7a7a"); })());
    const e = rec(); CV.drawDial(e, 0, 0, 10, null, "navigator");
    ok("!! an empty dial draws no needle, is titled by the caller and says not running", e.calls.filter((x) => x[0] === "lineTo").length === 0 && e.calls.some((x) => x[0] === "fillText" && x[1] === "navigator") && e.calls.some((x) => x[0] === "fillText" && x[1] === "not running"));
    ok("the dial says the error in whole degrees and the compass state", c.some((x) => x[0] === "fillText" && /compass DARK\s+error 60°/.test(x[1])));
    const tg = rec(), pts = (n, e) => Array.from({ length: n }, (_, i) => ({ t: i, e, dark: false }));
    CV.drawTrace(tg, 0, 0, 300, 100, pts(10, 45), pts(10, 0));
    const lt = tg.calls.filter((x) => x[0] === "lineTo");
    ok("!! the trace draws a line per series (9 segments each), plain amber and navigator cyan, and a series of one point draws none", lt.length === 18 && tg.calls.some((x) => x[0] === "set:strokeStyle" && x[1] === "#f6a623") && tg.calls.some((x) => x[0] === "set:strokeStyle" && x[1] === "#59d1ff") && (() => { const q = rec(); CV.drawTrace(q, 0, 0, 300, 100, pts(1, 5), null); return q.calls.filter((x) => x[0] === "lineTo").length === 0; })());
    ok("!! a 45 degree error is half way up a 100 high trace of a 90 degree scale (y = 50) and zero is on the floor (y = 100)", Math.abs(lt[0][2] - 50) < 1e-9 && Math.abs(lt[9][2] - 100) < 1e-9, `${lt[0][2]} and ${lt[9][2]}`);
}

console.log("\n3. THE WINDOWS");
{
    const v = (t) => A.compassValidAt(t);
    ok("!! the compass reports until 10 s, is dark from 10 s to 26 s (exactly), reports again, and repeats every 40 s", v(0) && v(9.99) && !v(10) && !v(25.99) && v(26) && v(39.99) && v(40) && !v(50) && !v(65.99) && v(66) && A.COMPASS.period === 40 && A.COMPASS.darkFrom === 10 && A.COMPASS.darkLen === 16 && Object.isFrozen(A.COMPASS));
    ok("a negative time reads as the same point of the cycle (-30 is 10: dark)", !v(-30) && v(-31) === v(9));
}

console.log("\n4. THE SIM");
{
    const e = (id) => ({ id, name: id, hue: 100, pilot: "autopilot", from: "x", local: true, weights: null });
    const worst = [];
    for (const ids of [["a", "b"], ["c", "d"], ["e", "f"]]) {
        const t = A.createTank(); t.sync(ids.map(e)); for (let i = 0; i < 900; i++) t.step(1 / 30);
        const none = t.snapshot().every((s) => s.compass === null);
        t.setEvent(ids[0], "dropout"); t.setEvent(ids[1], "navigator");
        let mp = 0, mn = 0, lit = true, hasTank = false;
        for (let i = 0; i < 30 * 120; i++) { t.step(1 / 30); const [p, n] = t.snapshot(); if (p.compass) { mp = Math.max(mp, Math.abs(p.compass.error)); if (p.compass.valid && p.compass.error !== 0) lit = false; } if (n.compass) { mn = Math.max(mn, Math.abs(n.compass.error)); if (n.compass.valid && n.compass.error !== 0) lit = false; } if (p.tank || n.tank) hasTank = true; }
        const [p, n] = t.snapshot(); worst.push({ ids, mp: mp / D, mn: mn / D, lost: p.lost + n.lost, none, lit, hasTank, ev: [p.event, n.event] });
    }
    ok("!! no compass field without an event (null in the snapshot)", worst.every((w) => w.none));
    ok("!! 120 s on three tank seeds: the plain autopilot's heading error reaches over 25 degrees in the dark; the navigator's never reaches 2", worst.every((w) => w.mp > 25 && w.mn < 2), worst.map((w) => `${w.mp.toFixed(0)} / ${w.mn.toFixed(2)}`).join("; "));
    ok("!! neither is lost, both are valid with EXACTLY zero error in the light, and a compass event has no tank", worst.every((w) => w.lost === 0 && w.lit && !w.hasTank && w.ev[0] === "dropout" && w.ev[1] === "navigator"));
    // WHAT THE PILOT IS ACTUALLY HANDED (a spy in place of the sub's pilot): the reported error is only a report; this is the behaviour
    const spyRun = (ev) => {
        const q = A.createTank(); q.sync([e("s")]); for (let i = 0; i < 900; i++) q.step(1 / 30);
        const sub = q.subs.get("s"), log = []; const real = sub.pilot;
        sub.pilot = (st, tg, cur, aux) => { log.push({ h: S.attitude(st).heading, aux, tg, truth: null }); return real(st, tg, cur, aux); };
        q.setEvent("s", ev);
        for (let i = 0; i < 30 * 50; i++) { q.step(1 / 30); const l = log[log.length - 1]; l.truth = S.attitude(sub.state).heading; }
        return log;
    };
    for (const ev of ["dropout", "navigator"]) {
        const log = spyRun(ev), lit = log.filter((l) => l.aux && l.aux.compassValid === 1), dark = log.filter((l) => l.aux && l.aux.compassValid === 0), wrapA = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
        // the truth at the moment of the call is the state BEFORE the step; the spy stored the truth AFTER it, one tick later: allow one tick of turn (0.1 rad)
        const heldOk = ev === "dropout" ? dark.every((l) => wrapA(l.h - dark[0].h) < 1e-9) : dark.every((l) => wrapA(l.h - l.truth) < 0.1);
        ok(`!! ${ev}: the pilot underneath is told compassValid 1 in the light and 0 in the dark (${lit.length} and ${dark.length} calls, 16 s of dark in 50 s), is shown the TRUE heading in the light` + (ev === "dropout" ? " and ONE FIXED heading all through the dark" : " and the navigator's estimate, within 0.1 rad of the true one, in the dark"), lit.length > 400 && dark.length > 300 && dark.length < 600 && lit.every((l) => wrapA(l.h - l.truth) < 0.1) && heldOk, `dark spread ${ev === "dropout" ? wrapA(Math.max(...dark.map((l) => l.h)) - Math.min(...dark.map((l) => l.h))).toFixed(4) : "-"}`);
        ok(`${ev}: the pilot is handed ONE target object for the whole event (the navigator tells a new dive by identity, and the tank makes a new object every tick outside its steering box)`, log.every((l) => l.tg === log[0].tg));
    }
    // THE FRAME IS NOT A WHOLE NUMBER OF TICKS: the tank clips its last tick to the frame, and the navigator must integrate over THAT tick (a first run with the page at 10x showed 3-7 degrees of error where this gate's whole-tick runs showed 0.1)
    const u = A.createTank(); u.sync([e("p"), e("q")]); for (let i = 0; i < 900; i++) u.step(1 / 30);
    u.setEvent("p", "dropout"); u.setEvent("q", "navigator"); let mq = 0, mp2 = 0; for (let i = 0; i < 2 * 7200; i++) { u.step(0.0137); const [p2, q2] = u.snapshot(); if (q2.compass) mq = Math.max(mq, Math.abs(q2.compass.error)); if (p2.compass) mp2 = Math.max(mp2, Math.abs(p2.compass.error)); }
    ok("!! with frames of 13.7 ms (a tick of 33.3 ms and a clipped one of 4.4 ms, over and over) the navigator is still under 2 degrees and the plain autopilot still over 25: the navigator is told how long each tick was", mq / D < 2 && mp2 / D > 25, `${(mq / D).toFixed(2)} and ${(mp2 / D).toFixed(0)} degrees`);
    const t = A.createTank(); t.sync([e("a")]); for (let i = 0; i < 900; i++) t.step(1 / 30);
    t.setEvent("a", "flood"); const withTank = !!t.snapshot()[0].tank; t.setEvent("a", "dropout"); const after = t.snapshot()[0];
    ok("!! switching a flood to a dropout takes the tank away (and the readout with it)", withTank && after.tank === null && after.event === "dropout");
    t.setEvent("a", null);
    ok("ending the event clears the compass", t.snapshot()[0].compass === null && t.snapshot()[0].event === null);
}

console.log("\n5. THE PAGE");
{
    const aq = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8");
    ok("!! the page has the panel, the compass test button and the imports; the button starts the dropout on the first sub and the navigator on the second, and ends them again", /id="compassBtn"/.test(aq) && /id="compassView"/.test(aq) && /from "\/render\/compassView\.mjs"/.test(aq) && /tank\.setEvent\(ids\[0\], "dropout"\); if \(ids\[1\]\) tank\.setEvent\(ids\[1\], "navigator"\)/.test(aq) && /s\.event === "navigator"\)\) tank\.setEvent\(id, null\)/.test(aq) && /readout\(s\) \|\| lineFor\(s\)/.test(aq) && /drawCompass\(snap\)/.test(aq));
    ok("!! the page (v4904) has the two estimator buttons (disabled until the circuit loads), starts them as events on the selected sub, registers each builder from the scene's pilotDefs (cx -> fly-estimator, er -> er-estimator), and marks a dark compass with drawDark: the ring on the plan view along the AUTOPILOT's belief (compass.seen), a ring alone on the depth view",
        /id="flyEstBtn" disabled/.test(aq) && /id="erEstBtn" disabled/.test(aq) && /setEvent\("fly-estimator"\)/.test(aq) && /setEvent\("er-estimator"\)/.test(aq) && /registerEstimator\(ev, def\.build\)/.test(aq) && /\["fly-estimator", "cx", "flyEstBtn"\]/.test(aq) && /\["er-estimator", "er", "erEstBtn"\]/.test(aq) && /import \{[^}]*\bdrawDark\b[^}]*\} from "\/render\/compassView\.mjs"/.test(aq) && /s\.compass && !s\.compass\.valid\) \{ drawDark\(pg, s\.x \* sx, s\.y \* sy, s\.compass\.seen, 30\); drawDark\(sg, s\.x \* dx, s\.depth \* dz, NaN, 20\)/.test(aq));
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) { report("live half SKIPPED -- " + skip); report("*** THAT IS A SKIP AND NOT A PASS: sections 1-4 are arithmetic and the sim; only a page shows the canvas drawn and the button wired"); }
    else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
        const subs = [1, 2].map((i) => ({ id: "s" + i, name: ["Pike", "Murmur"][i - 1], hue: i * 100, pilot: "autopilot", from: "this-box", local: true, weights: null }));
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]);
            if (u === "/subaquarium/list") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true, subs })); }
            if (u.startsWith("/ai/")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end("{}"); }
            const fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
            await pg.goto("http://127.0.0.1:" + server.address().port + "/sub-aquarium.html", { waitUntil: "load" });
            await pg.waitForFunction(() => document.querySelectorAll("#list .row").length === 2, null, { timeout: 8000 }).catch(() => {});
            const ink = () => pg.evaluate(() => { const c = document.getElementById("compassView"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
            const before = await ink();
            await pg.selectOption("#speedSel", "10"); await pg.click("#compassBtn"); await pg.waitForTimeout(1500);
            const msg = await pg.$eval("#msg", (e) => e.textContent), after = await ink();
            const lines = await pg.evaluate(() => [...document.querySelectorAll(".tk")].map((e) => e.textContent));
            ok("!! the compass test names who is on what, draws the dials (" + after + " inked pixels, empty faces were " + before + ") and puts a compass line on each list row", /Pike on the plain autopilot, Murmur on the navigator/.test(msg) && after > 20000 && before > 20000 && lines.length === 2 && /^PLAIN AUTOPILOT · compass/.test(lines[0]) && /^NAVIGATOR · compass/.test(lines[1]), JSON.stringify(lines).slice(0, 160));
            // v4901 -- WAIT FOR THE STATE, NOT FOR THE CLOCK: the page steps the tank per frame, so at 10x speed a slower box has simulated less than ten seconds after 9 s of wall time (the rig read 'compass ok' there, a flake of this row's own making). Poll until the plain row reads DARK, up to 60 s; a page that never gets there still fails the row below.
            await pg.waitForFunction(() => { const t = document.querySelectorAll(".tk"); return t.length > 0 && /compass DARK/.test(t[0].textContent); }, null, { timeout: 60000, polling: 250 }).catch(() => {});
            await pg.waitForTimeout(500);
            const dark = await pg.evaluate(() => [...document.querySelectorAll(".tk")].map((e) => e.textContent));
            ok("!! ten seconds in (the 10 s window has opened at 10x speed) the plain row reads DARK with a heading error and the navigator's stays under 2 degrees", /compass DARK/.test(dark[0]) && /compass DARK · heading error [0-1]°/.test(dark[1]), JSON.stringify(dark).slice(0, 200));
            await pg.click("#compassBtn"); await pg.waitForTimeout(400);
            const end = await pg.evaluate(() => [[...document.querySelectorAll(".tk")].map((e) => e.textContent).join(""), document.getElementById("msg").textContent]);
            ok("!! pressing it again ends both: the lines are empty and the page says so", end[0] === "" && /ended/.test(end[1]), JSON.stringify(end).slice(0, 160));
            // v4904 -- the two estimator events, live: the buttons come alive when the circuit has loaded, one starts on the SELECTED sub, the list row says so, and once its compass is dark the plan view carries the amber ring
            await pg.waitForFunction(() => { const b = document.getElementById("flyEstBtn"); return b && !b.disabled; }, null, { timeout: 20000 }).catch(() => {});
            const enabled = await pg.evaluate(() => [!document.getElementById("flyEstBtn").disabled, !document.getElementById("erEstBtn").disabled]);
            await pg.click("#list .row"); await pg.click("#flyEstBtn");
            const msg2 = await pg.$eval("#msg", (e) => e.textContent);
            await pg.waitForFunction(() => { const t = document.querySelectorAll(".tk"); return t.length > 0 && /FLY ESTIMATOR · compass DARK/.test(t[0].textContent); }, null, { timeout: 60000, polling: 250 }).catch(() => {});
            await pg.waitForTimeout(300);
            const amber = await pg.evaluate(() => { const c = document.getElementById("plan"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] > 140 && d[i + 1] < 190 && d[i + 2] < 70 && d[i + 3] > 200) n++; return n; });
            const row1 = await pg.evaluate(() => document.querySelector(".tk") && document.querySelector(".tk").textContent);
            ok("!! the estimator buttons come alive with the circuit, the fly estimator starts on the selected sub, its list row reads FLY ESTIMATOR with the compass DARK, and the plan view carries the amber ring and ghost line (" + amber + " amber pixels)", enabled[0] && enabled[1] && /fly-estimator on the selected sub/.test(msg2) && /FLY ESTIMATOR · compass DARK/.test(row1 || "") && amber > 150, JSON.stringify({ enabled, msg2, row1, amber }).slice(0, 220));
            await pg.click("#clearBtn");
            ok("  no page or console error", errs.length === 0, errs.join(" | ").slice(0, 200));
        } finally { await br.close(); server.close(); }
    }
}

console.log(`\ncompassView-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
