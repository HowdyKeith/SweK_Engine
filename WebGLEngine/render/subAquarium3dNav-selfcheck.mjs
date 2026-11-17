// WebGLEngine/render/subAquarium3dNav-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquarium3dNav-selfcheck.mjs      (a second or two; the real three.js in node, no renderer)
//
// THE 3D VIEW'S NAVIGATION SEA AND GOALS (nextRounds tank-nav-3d, 2026-11-17), held to the side and plan views of sub-aquarium.html:
//   1 COLUMNS   navColumns: an island runs from the floor (-depthMax) to SEA_TOP; an iceberg and a ship from SEA_TOP down to their keel (the side view's rectangles); at (x, ., y), radius r;
//               an unknown type throws; on the real tank's seas (setScene 1..8) every obstacle becomes one column and every type the tank makes has a colour.
//   2 GOALS     navGoals: one per courier with a goal, at (x, -depth, y), with a line from the courier's own pose; none without a goal.
//   3 SYNC      syncNav keeps one column per obstacle and one buoy and line per goal, MOVES a ship that sails (the real tank, 20 s), and removes what left (a new sea, a goal gone).
//   4 THE VIEW  createView3d adds the group, syncs it from render(), exposes setSea() and nav(); the page passes tank.sceneNow() to setSea before every 3D render.
// NOT CHECKED, said plainly: how the sea looks on a real GPU (nobody has looked), and whether a column hides a sub behind it from some camera angles.
// SABOTAGE LOG (11 mutants, each alone, restored byte-identical): the island's foot fixed at -50 whatever depthMax (1 red), the keel upward (2), a column at -y (2), a goal at +depth (2),
//   a column placed once and never moved (1: the ship that sails), columns never removed (1), goals never removed (1), render() not syncing the sea (1), the island see-through (1),
//   the page not passing the sea (1), an unknown type let through (1).
"use strict";
import fs from "node:fs";
import * as THREE from "../vendor/three/three.module.js";
import * as V from "./subAquarium3d.mjs";
import { createTank } from "./subAquariumSim.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
const J = JSON.stringify;
console.log("subAquarium3dNav-selfcheck -- the navigation sea and the couriers' goals in three dimensions\n");

const mkTank = () => { const t = createTank(); t.sync([{ id: "n0", name: "Sub n0", hue: 100, pilot: "autopilot", from: "x", local: false, weights: null }]); return t; };   // as subAquariumSim-selfcheck makes one
const sea = [{ type: "island", x: 100, y: 50, r: 20, keel: Infinity }, { type: "berg", x: 200, y: 80, r: 12, keel: 18 }, { type: "ship", x: 300, y: 120, r: 9, keel: 6 }];
sec("1. COLUMNS");
{
    const c = V.navColumns(sea, 50), span = (k) => [c[k].centre[1] - c[k].h / 2, c[k].centre[1] + c[k].h / 2];
    ok("!! an island is land to the floor: its column spans Y -50 (the floor) to SEA_TOP above the surface", near(span(0)[0], -50) && near(span(0)[1], V.SEA_TOP), J(span(0)));
    ok("!! an iceberg and a ship hang from SEA_TOP to their keel (18 m and 6 m: Y -18 and -6)", near(span(1)[0], -18) && near(span(1)[1], V.SEA_TOP) && near(span(2)[0], -6) && near(span(2)[1], V.SEA_TOP), J([span(1), span(2)]));
    ok("!! each column stands at (x, ., y) with the obstacle's radius, and the floor is the view's own depthMax (60 moves the island's foot)", c.every((q, i) => q.centre[0] === sea[i].x && q.centre[2] === sea[i].y && q.r === sea[i].r) && near(V.navColumns(sea, 60)[0].centre[1] - V.navColumns(sea, 60)[0].h / 2, -60));
    let thrown = ""; try { V.navColumns([{ type: "reef", x: 0, y: 0, r: 1, keel: 1 }]); } catch (e) { thrown = e.message; }
    ok("!! an unknown type throws by name; no sea is no columns", /unknown obstacle type "reef"/.test(thrown) && V.navColumns(null).length === 0 && V.navColumns([]).length === 0, thrown);
    const types = new Set(); let all = true;
    for (let sd = 1; sd <= 8; sd++) { const t = mkTank(); t.setScene(sd); const list = t.sceneNow(); list.forEach((o) => types.add(o.type)); all = all && V.navColumns(list).length === list.length && list.length > 0; }
    ok("!! the real tank's seas 1 to 8: every obstacle becomes one column, and every type the tank makes has a colour", all && [...types].every((k) => k in V.NAV_COLOURS) && types.has("island") && types.has("ship"), [...types].join(","));
}

const sub = (o = {}) => ({ id: "a", x: 40, y: 60, depth: 20, heading: 0, pitch: 0, hue: 200, ...o });
sec("2. GOALS");
{
    const g = V.navGoals([sub({ nav: { goal: { x: 400, y: 250, depth: 12 } } }), sub({ id: "b", nav: { goal: null } }), sub({ id: "c" })]);
    ok("!! one goal per courier with a goal, at (x, -depth, y), with a line from the courier's own pose (X = x, Y = -depth, Z = y)", g.length === 1 && J(g[0].pos) === J([400, -12, 250]) && J(g[0].from) === J([40, -20, 60]) && g[0].hue === 200, J(g));
}

sec("3. SYNC");
{
    const store = V.navStore(THREE), n1 = V.syncNav(THREE, store, sea, [sub({ nav: { goal: { x: 400, y: 250, depth: 12 } } })], 50);
    const m = store.cols.get("1:berg"), b = store.goals.get("a");
    ok("!! one column per obstacle and one buoy and line per goal; a column is placed and scaled to (r, h, r)", n1.columns === 3 && n1.goals === 1 && m.position.y === V.navColumns(sea)[1].centre[1] && m.scale.x === 12 && m.scale.y === V.SEA_TOP + 18 && b.buoy.position.x === 400 && b.buoy.position.y === -12, J(n1));
    ok("  the island is opaque and the berg and ship are see-through (the sub behind them stays visible)", store.cols.get("0:island").material.transparent === false && m.material.transparent === true && store.cols.get("2:ship").material.opacity < 1);
    const n2 = V.syncNav(THREE, store, sea.slice(0, 1), [sub()], 50);
    ok("!! what leaves is removed: a sea of one island and a courier with no goal leave one column and no buoy, and the group holds only those", n2.columns === 1 && n2.goals === 0 && store.group.children.length === 1, J(n2));
    const t = mkTank(); t.setScene(1); const st = V.navStore(THREE);
    V.syncNav(THREE, st, t.sceneNow(), t.snapshot(), 50); const k = t.sceneNow().findIndex((o) => o.type === "ship"), id = `${k}:ship`, before = st.cols.get(id).position.clone();
    for (let i = 0; i < 400; i++) t.step(0.05);
    V.syncNav(THREE, st, t.sceneNow(), t.snapshot(), 50); const after = st.cols.get(id).position;
    ok("!! a ship SAILS in the view: after 20 tank-seconds its column has moved with sceneNow (the real tank, sea 1)", k >= 0 && before.distanceTo(after) > 1 && near(after.x, t.sceneNow()[k].x) && near(after.z, t.sceneNow()[k].y), `${before.distanceTo(after).toFixed(2)} m`);
    t.setNav("n0", "any"); t.step(0.05); const n3 = V.syncNav(THREE, st, t.sceneNow(), t.snapshot(), 50);
    ok("!! a courier on the real tank gets its goal drawn (setNav any)", n3.goals === 1 && st.goals.size === 1, J(n3));
}

sec("4. THE VIEW AND THE PAGE");
{
    const src = fs.readFileSync(new URL("./subAquarium3d.mjs", import.meta.url), "utf8"), page = fs.readFileSync(new URL("../sub-aquarium.html", import.meta.url), "utf8");
    ok("!! createView3d adds the nav group to its scene, syncs it from render() with the view's depthMax, and exposes setSea() and nav()",
        /const nav = navStore\(THREE\); scene\.add\(nav\.group\)/.test(src) && /syncNav\(THREE, nav, navSea, snapshot, depthMax\)/.test(src) && /setSea\(list\) \{ navSea = Array\.isArray\(list\) \? list : \[\]; \}/.test(src) && /nav\(\) \{ return \{ columns: nav\.cols\.size, goals: nav\.goals\.size \}; \}/.test(src));
    ok("!! the page passes tank.sceneNow() to setSea before every 3D render", /view3d\.setSea\(tank\.sceneNow\(\)\); view3d\.render\(snap,/.test(page));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
