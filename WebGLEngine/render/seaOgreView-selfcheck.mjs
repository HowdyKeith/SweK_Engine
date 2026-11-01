// WebGLEngine/render/seaOgreView-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/seaOgreView-selfcheck.mjs      (~0.5 s)
//
// WHAT sea-ogre.html SHOWS (render/seaOgreView.mjs):
//   1  THE BOUNDS   the whole replay and the headquarters at the origin, padded, never under 200 m each way; an empty replay has a default
//   2  THE COLOURS  a zone is green whole, amber under half, red under a fifth, grey dead
//   3  THE VERDICT  one line per outcome naming the hull, the headquarters, the zones destroyed and the boats lost
//   4  THE DRAWING  with a context that records its calls: a ring for the cannon's reach and one for the breach, a square for the headquarters, a dot per running torpedo coloured by who fired it, a square per
//                   escort, four zone dots on the hull in the colour of what is left, a line and a nose dot per boat (a dead one dimmed), the hull bar in proportion and the label text; an empty frame says what to do
//   6  THE PAGE     sea-ogre.html wires the modules and its controls, carries the 3D view and its cameras but no player control in its script, is filed on server.html, in the Flight Simulation bucket and in the page index
//   5  THE REAL FIGHT  a traced fight of brain/seaOgre.mjs drawn frame by frame without a throw, the counts matching the frame, no first-person anything on the page's module
//
// SABOTAGES (each mutant breaks the thing a row guards; the row that went red, by name; an entry that went 0 red is a finding, and was fixed):
//   render/seaOgreView.mjs: V1 bounds unpadded (1) | V2 bounds omit escorts (0 red THE FIRST TIME: no escort lay outside the rest; one at y 300 now, 1) | V3 bounds omit the headquarters (0 red THE FIRST TIME: the
//   boats straddled the origin; a far-from-origin trace now, 1) | V4 minimum span 10 m (1) | V5 amber cut 0.3 (1) | V6 red cut 0.1 (2) | V7 dead zone green (2) | V8 verdict without zones (2) | V9 lost boats by index only
//   (1) | V10 cannon ring doubled (1) | V11 breach ring at the cannon's radius (1) | V12 the OGRE's torpedo not red (0 red THE FIRST TIME: OGRE_COLOUR is also the hull bar's fill, so 'the colour appears' proved
//   nothing; the fill set just before the dot at its place is read now, 1) | V12b every defender's torpedo the first boat's colour (0 red: the frame had no torpedo of the second boat; it has now, 1) | V13 escorts not drawn
//   (1) | V13b escort wrong colour (1) | V14 zone dots on the wrong end (0 red THE FIRST TIME: colours only, no positions; read at the zone's place now, 1) | V15 dead boat not dimmed (1) | V16 submerged OGRE not dimmed (1) |
//   V17 hull bar unscaled (1) | V18 headquarters bar by the hull (1) | V19 phase label dropped (1) | V20 empty frame draws rings (1) | V21 three zones (2) | V22 first-person code (a camera word) in the module (0 red
//   THE FIRST TIME: the mutant was a comment and comments are stripped on purpose; a code line now, 1) | page: P1 no watch button (1) | P2 pointer lock in the page script (1) | P3 no gunner side (1) | P4 link off server.html (1) |
//   P5 out of the Flight Simulation bucket (1) | P6 out of page-index.json (1) | probes and fix: V23 probes not drawn (1) | V24 fix cross not drawn (1) (see the list below).
"use strict";
import * as V from "./seaOgreView.mjs";
import * as G from "../brain/seaOgre.mjs";
import * as T from "../brain/subTournament.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const rec = () => { const calls = []; return new Proxy({}, { get: (_, k) => (k === "calls" ? calls : (...a) => { calls.push([k, ...a]); }), set: (_, k, v) => { calls.push(["set:" + k, v]); return true; } }); };
const frame = (over = {}) => ({ tick: 0, boats: [{ id: 1, x: 100, y: 0, depth: 20, heading: 0, pitch: 0, hp: 100, alive: true, ammo: 6 }, { id: 2, x: 120, y: 40, depth: 20, heading: 1, pitch: 0, hp: 40, alive: false, ammo: 3 }],
    torps: [{ id: 1, owner: 1, x: 200, y: 10, depth: 20 }, { id: 2, owner: 900, x: 300, y: 20, depth: 14 }, { id: 3, owner: 2, x: 220, y: 60, depth: 20 }], escorts: [{ id: 1, x: 250, y: 30, depth: 20, hp: 30 }],
    ogre: { x: 400, y: 50, depth: 14, heading: Math.PI, speed: 2.3, hull: 150, surfaced: false, phase: 2, zones: { tubes: 120, sonar: 15, cannon: 0, engine: 150 } }, hq: 70, ...over });
const B = { x0: -100, x1: 500, y0: -100, y1: 200 };

console.log("seaOgreView-selfcheck -- the Sea OGRE page\n");

console.log("1. THE BOUNDS");
{
    const tr = [frame(), frame({ boats: [{ id: 1, x: -300, y: 20, depth: 20, heading: 0, pitch: 0, hp: 100, alive: true, ammo: 6 }], escorts: [{ id: 1, x: 100, y: 300, depth: 20, hp: 30 }] })], b = V.boundsOf(tr);
    ok("!! the extent of the boats, torpedoes, escorts and the OGRE, padded by 60 m (x from the boat at -300 to the OGRE at 460, y up to the ESCORT at 300)", near(b.x0, -360) && near(b.x1, 460) && near(b.y1, 360) && b.y0 <= -60, JSON.stringify(b));
    const far = V.boundsOf([frame({ boats: [{ id: 1, x: 300, y: 100, depth: 20, heading: 0, pitch: 0, hp: 100, alive: true, ammo: 6 }], torps: [], escorts: [], ogre: { ...frame().ogre, x: 500, y: 150 } })]);
    ok("!! the headquarters at the origin is inside even when everything else is far from it", far.x0 <= 0 && far.y0 <= 0 && far.x1 >= 500, JSON.stringify(far));
    const small = V.boundsOf([frame({ boats: [], torps: [], escorts: [], ogre: { ...frame().ogre, x: 10, y: 5 } })]);
    ok("never under 200 m each way", small.x1 - small.x0 >= 200 && small.y1 - small.y0 >= 200);
    const e = V.boundsOf([]);
    ok("an empty replay has a default box", e.x0 === -100 && e.x1 === 100 && e.y0 === -100 && e.y1 === 100 && V.boundsOf(null).x1 === 100);
}

console.log("\n2. THE COLOURS");
{
    ok("!! green whole, amber under half, red under a fifth, grey dead", V.zoneColour(100, 100) === "#5fe08a" && V.zoneColour(49, 100) === "#f6a623" && V.zoneColour(19, 100) === "#ff5a5a" && V.zoneColour(0, 100) === "#3a4658" && V.zoneColour(-5, 100) === "#3a4658");
    ok("the cuts are 0.5 and 0.2 exactly", V.zoneColour(50, 100) === "#5fe08a" && V.zoneColour(20, 100) === "#f6a623");
}

console.log("\n3. THE VERDICT");
{
    const base = { outcome: "defended", ticks: 2700, hull: 0, hq: 100, zones: { tubes: 0, sonar: 100, cannon: 130, engine: 150 }, fates: ["afloat", "sunk", "afloat"], escorts: 3, score: 2.34 };
    const a = V.verdictLine(base, ["alpha", "beta", "gamma"]), b = V.verdictLine({ ...base, outcome: "breached", hull: 120, hq: 0, fates: ["afloat", "afloat", "afloat"], zones: { tubes: 120, sonar: 100, cannon: 130, engine: 150 } }), c = V.verdictLine({ ...base, outcome: "holdout", ticks: 9000 });
    ok("!! defended: the outcome, the time, the hull, the headquarters, the zone gone, the boat lost by NAME", /DEFENDED/.test(a) && /90 s/.test(a) && /hull 0\/300/.test(a) && /headquarters 100\/100/.test(a) && /zones destroyed: tubes;/.test(a) && /lost: beta sunk/.test(a), a);
    ok("breached: says so, and 'none' and 'no boat lost' when so", /BREACHED/.test(b) && /zones destroyed: none/.test(b) && /no boat lost/.test(b) && /hull 120\/300/.test(b), b);
    ok("holdout: says so and 300 s", /HOLDOUT/.test(c) && /300 s/.test(c));
    ok("the score has two decimals", /score 2\.34$/.test(a));
}

console.log("\n4. THE DRAWING");
{
    const g = rec(), cnt = V.drawLevel(g, 600, 300, frame(), B, { names: ["alpha", "beta"] }), c = g.calls, arcs = c.filter((q) => q[0] === "arc"), rects = c.filter((q) => q[0] === "fillRect"), txt = c.filter((q) => q[0] === "fillText").map((q) => q[1]).join("|");
    ok("the counts: 2 boats, 3 torpedoes, 1 escort, 4 zones", cnt.boats === 2 && cnt.torps === 3 && cnt.escorts === 1 && cnt.zones === 4, JSON.stringify(cnt));
    const k = Math.min(600 / 600, 300 / 300), hq = V.toScreen(B, 0, 0, 600, 300);
    const rings = arcs.filter((q) => near(q[1], hq[0], 0.01) && near(q[2], hq[1], 0.01));
    ok("!! two rings about the headquarters: the cannon's reach (220 m) and the breach (60 m), at scale", rings.length === 2 && near(rings[0][3], G.OGRE.cannonRange * k, 0.01) && near(rings[1][3], G.OGRE.breachRange * k, 0.01), rings.map((q) => q[3].toFixed(1)).join());
    ok("the headquarters is a square at the origin", rects.some((q) => near(q[1], hq[0] - 5) && near(q[2], hq[1] - 5) && q[3] === 10 && q[4] === 10));
    // the colour a thing was drawn in is the fillStyle set just before its shape
    const colourBefore = (pred) => { for (let i = 0; i < c.length; i++) if (pred(c[i])) { for (let j = i - 1; j >= 0; j--) if (c[j][0] === "set:fillStyle") return c[j][1]; } return null; };
    const at = (x, y) => V.toScreen(B, x, y, 600, 300), f0 = frame();
    const torpA = at(200, 10), torpO = at(300, 20), torpB = at(220, 60), esc = at(250, 30);
    ok("!! a defender's torpedo takes its boat's colour and the OGRE's is red (the fill set just before each dot)", colourBefore((q) => q[0] === "arc" && q[3] === 3 && near(q[1], torpA[0], 0.01) && near(q[2], torpA[1], 0.01)) === V.COLOURS[0] && colourBefore((q) => q[0] === "arc" && q[3] === 3 && near(q[1], torpO[0], 0.01) && near(q[2], torpO[1], 0.01)) === V.OGRE_COLOUR && colourBefore((q) => q[0] === "arc" && q[3] === 3 && near(q[1], torpB[0], 0.01) && near(q[2], torpB[1], 0.01)) === V.COLOURS[1]);
    ok("!! the escort is a 6 m square at its place in its colour", colourBefore((q) => q[0] === "fillRect" && near(q[1], esc[0] - 3, 0.01) && near(q[2], esc[1] - 3, 0.01) && q[3] === 6) === V.ESCORT_COLOUR);
    const o = f0.ogre, ox = at(o.x, o.y), hx = Math.cos(o.heading), hy = -Math.sin(o.heading), zk = Math.min(600 / 600, 300 / 300);
    const zoneCol = (z) => colourBefore((q) => q[0] === "arc" && near(q[1], ox[0] + hx * z.at * zk, 0.01) && near(q[2], ox[1] + hy * z.at * zk, 0.01) && q[3] >= 3 && q[3] !== 3.0001);
    ok("!! the zones sit along the hull where they are (tubes at the bow end, which is the heading) and are lit by what is left: green tubes, red sonar (15/100), grey cannon (gone), green engine", zoneCol(G.ZONES[0]) === "#5fe08a" && zoneCol(G.ZONES[1]) === "#ff5a5a" && zoneCol(G.ZONES[2]) === "#3a4658" && zoneCol(G.ZONES[3]) === "#5fe08a");
    const alphas = c.filter((q) => q[0] === "set:globalAlpha").map((q) => q[1]);
    ok("!! a dead boat is dimmed (0.3) and the submerged OGRE is dimmed (0.65), then restored to 1", alphas.includes(0.3) && alphas.includes(0.65) && alphas.at(-1) === 1);
    const bar = rects.filter((q) => q[2] === 12 && q[4] === 10);
    ok("!! the hull bar is in proportion (150 of 300 = half of 36% of the width)", bar.length >= 2 && near(bar[1][3], 600 * 0.36 * 0.5, 0.01), bar.map((q) => q[3]).join());
    ok("!! the headquarters bar is in proportion (70 of 100)", bar.length >= 4 && near(bar[3][3], 600 * 0.36 * 0.7, 0.01));
    ok("the labels: the OGRE's hull, phase and 'submerged', the headquarters, each boat by name", /OGRE hull 150/.test(txt) && /phase 2/.test(txt) && /submerged/.test(txt) && /headquarters 70/.test(txt) && /alpha 100 hp 6t/.test(txt) && /beta 40 hp 3t/.test(txt), txt);
    const gp = rec(), cp = V.drawLevel(gp, 600, 300, frame({ probes: [{ id: "p1", x: 50, y: 60, depth: 20 }, { id: "p2", x: 300, y: -20, depth: 20 }], fix: { x: 120, y: 80, sources: 2, spanDeg: 40 } }), B), pa = V.toScreen(B, 50, 60, 600, 300), fx = V.toScreen(B, 120, 80, 600, 300);
    ok("!! probes are yellow diamonds at their places (a move to the top vertex, 5 px above), counted", cp.probes === 2 && gp.calls.some((q) => q[0] === "moveTo" && near(q[1], pa[0], 0.01) && near(q[2], pa[1] - 5, 0.01)) && gp.calls.some((q, i) => q[0] === "set:fillStyle" && q[1] === V.PROBE_COLOUR && gp.calls.slice(i, i + 8).some((r) => r[0] === "fill")));
    ok("!! the squad's fix is a white cross at the fix (8 px arms), and only when there is one", cp.fix === true && gp.calls.some((q) => q[0] === "moveTo" && near(q[1], fx[0] - 8, 0.01) && near(q[2], fx[1], 0.01)) && gp.calls.some((q) => q[0] === "lineTo" && near(q[1], fx[0] + 8, 0.01)) && gp.calls.some((q) => q[0] === "set:strokeStyle" && q[1] === V.FIX_COLOUR) && gp.calls.some((q, i) => q[0] === "lineTo" && near(q[1], fx[0] + 8, 0.01) && gp.calls.slice(i, i + 5).some((r) => r[0] === "stroke")) && cnt.fix === false && cnt.probes === 0);
    const gs = rec(); V.drawLevel(gs, 600, 300, frame({ ogre: { ...frame().ogre, surfaced: true } }), B);
    ok("a surfaced OGRE is drawn solid and says SURFACED", !gs.calls.some((q) => q[0] === "set:globalAlpha" && q[1] === 0.65) && gs.calls.some((q) => q[0] === "fillText" && /SURFACED/.test(q[1])));
    const g0 = rec(), e = V.drawLevel(g0, 600, 300, null, B);
    ok("an empty frame says what to do and draws nothing else", e.boats === 0 && g0.calls.some((q) => q[0] === "fillText" && /pick the defenders/.test(q[1])) && !g0.calls.some((q) => q[0] === "arc"));
}

console.log("\n5. THE REAL FIGHT");
{
    const tr = [], sides = Array.from({ length: 3 }, (_, i) => T.makeSide("d" + i, { theta: { fireRange: 420, blindSnr: 22, pingAfter: 1, trackSpeed: 2.5 } }).side());
    const r = G.fight(sides, G.scenario(2, 3), { trace: tr }), b = V.boundsOf(tr);
    let threw = false, matches = true;
    try { for (let t = 0; t < r.ticks / 30; t += 3) { const f = V.frameAt(tr, t), g = rec(), n = V.drawLevel(g, 800, 400, f, b); matches &&= n.boats === f.boats.length && n.torps === f.torps.length && n.escorts === f.escorts.length && n.zones === 4; } } catch (e) { threw = true; console.log(e); }
    ok("!! a traced defence drawn every 3 s without a throw, the counts matching each frame", !threw && matches);
    const x0 = V.toScreen(b, tr[0].ogre.x, tr[0].ogre.y, 800, 400);
    ok("the OGRE of the first frame lands inside the canvas", x0[0] >= 0 && x0[0] <= 800 && x0[1] >= 0 && x0[1] <= 400);
    ok("the verdict line of the real result reads", /DEFENDED|BREACHED|HOLDOUT/.test(V.verdictLine(r, ["a", "b", "c"])));
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "seaOgreView.mjs"), "utf8");
    ok("!! the PLAN view module (not the 3D one) names no camera, pointer lock, key or human seat", !/pointerLock|requestPointerLock|keydown|getUserMedia|firstPerson|cockpit/i.test(src.replace(/^\/\/.*$/gm, "")));
}

console.log("\n6. THE PAGE");
{
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ""), rd = (f) => fs.readFileSync(path.join(root, f), "utf8"), html = rd("sea-ogre.html"), code = html.slice(html.indexOf("<script"));
    ok("!! the page loads the fight, the view and the roster of the tournament and wires its buttons", /from "\/brain\/seaOgre\.mjs"/.test(code) && /from "\/render\/seaOgreView\.mjs"/.test(code) && /roster/.test(code) && ["watchBtn", "runBtn", "nDef", "seed", "replay", "verdict", "slots", "tally"].every((id) => html.includes(`id="${id}"`)));
    ok("!! a REPLAY with no player control: the page's own script has no pointer lock, key or pointer-move handler, gamepad or camera feed (the cameras are a menu, and the 3D view's own module is held to the same by seaOgre3d-selfcheck)", !/pointerLock|requestPointerLock|keydown|keyup|pointermove|mousemove|gamepad|getUserMedia/i.test(code));
    ok("!! it carries the 3D view and its camera menu (first person from a defender's bow among them), the squad and quiet-OGRE switches, and a tank sized by the replay", /createSeaOgre3d/.test(code) && /cameraChoices/.test(code) && /id="camSel"/.test(html) && /id="view3d"/.test(html) && /id="squad"/.test(html) && /id="quiet"/.test(html) && /squad: \$\("squad"\)\.checked/.test(code) && /loud: -15/.test(code));
    ok("it offers a defender that can win (the gunner) beside the tournament's sides, and says what the default does", /id: "gunner"/.test(code) && /breached every time/.test(code));
    ok("!! it is filed: a link on server.html and a place in the Flight Simulation bucket", /href="\/sea-ogre\.html"/.test(rd("server.html")) && /"sea-ogre\.html"/.test(rd("tools/ship/pageSections.mjs")));
    ok("the page index knows it", /"sea-ogre\.html"/.test(rd("page-index.json")));
}

// v4901 -- the exports the definition census asked this gate to name (HQ_COLOUR), checked in one row.
{ const M = await import("./seaOgreView.mjs"); const names = ["HQ_COLOUR"];
  const okShape = names.every((n) => n in M && (typeof M[n] === "function" || typeof M[n] === "number" || typeof M[n] === "string" || typeof M[n] === "object"));
  ok("HQ_COLOUR, the headquarters' colour, is exported next to the other plan colours", okShape, names.map((n) => n + ":" + typeof M[n]).join(" ")); }
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
