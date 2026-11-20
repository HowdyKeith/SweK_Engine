// WebGLEngine/render/subAquarium3dMarks-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquarium3dMarks-selfcheck.mjs      (about 2 s; no browser)
//
// THE GATE OF render/subAquarium3dMarks.mjs (backlog `tank-nav-3d` and `survey-3d-markers`): what the 3D view draws of the sea's obstacles, the couriers' goals and the survey's stations.
//   1 THE SPECS   on the real tank's scene (seed 7: 6 islands, 3 bergs, 2 ships): every obstacle has a spec and the kinds and colours are the plan view's; an island runs from the floor to ISLAND_RISE above the roof; a berg's keel bottom is -keel and
//                 its tip narrows; a ship's length, beam and keel; a keel deeper than the tank is clamped to it; a malformed obstacle (no radius, no position, a berg with no keel, an unknown type) gives null; goalSpec puts the goal at Y = -depth
//                 in the courier's hue; stationSpecs gives every station of a RUNNING survey (amber, green once visited), none for a finished one or none at all, and skips a malformed station; moveHeading is the scene's rotation about Y.
//   2 THE SCENE   with the real three.js and no renderer: counts after one update are 6 / 3 / 2 obstacles, one goal buoy per courier with a goal and one ring per station; a second frame with the ships moved MOVES the same objects (no new ones),
//                 turns a ship to its motion (it holds its heading when it stops); a station that is visited changes colour; what leaves the lists leaves the scene (the objects and their materials are disposed); dispose() empties the scene.
//   3 THE WIRING  render/subAquarium3d.mjs builds the marks, hands them each frame's snapshot with the obstacles it was given, and exposes setObstacles and marksCounts; sub-aquarium.html gives it tank.sceneNow() before every render.
// SABOTAGE (2026-11-15, 36 mutants of render/subAquarium3dMarks.mjs, render/subAquarium3d.mjs and sub-aquarium.html, each run alone in a scratch copy): all 36 red BY NAME in the end. The first pass of 27 left 4 alive (a material not disposed when its mark leaves, the berg keel's
//   vertical position, the goal pole's position, the ring's flat orientation): each got its own row (the vertical layout row and the disposal row) and 9 more mutants were run against them. The first RUN of the gate itself found a real defect in the module before any mutant: the islands of an archipelago
//   share the scene's `group` number, so ids built from it collided and 2 of 6 islands were drawn; the id now carries the obstacle's position in the list.
// NOT GRADED, said plainly: how it looks in a real GPU frame (checked by a headless-Chromium screenshot by hand, 2026-11-15: islands, bergs with keels, a ship, goal buoys and station rings all drawn, no console errors); any timing.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../vendor/three/three.module.js";
import * as M from "./subAquarium3dMarks.mjs";
import { createTank } from "./subAquariumSim.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

console.log("subAquarium3dMarks-selfcheck -- obstacles, goals and stations in the 3D view\n");

const tank = createTank(); tank.setScene(7);
const sea = tank.sceneNow(), count = (t) => sea.filter((o) => o.type === t).length;
console.log("1. THE SPECS");
{
    ok("the real scene is 6 islands, 3 bergs and 2 ships, and every obstacle has a spec", count("island") === 6 && count("berg") === 3 && count("ship") === 2 && sea.every((o, i) => M.obstacleSpec(o, 50, i) !== null));
    const plan = { island: "#3d6b3a", berg: "#bfe3ff", ship: "#f6a623" };   // the plan view's colours (sub-aquarium.html render())
    ok("!! kinds and colours are the plan view's (island green 3d6b3a, berg bfe3ff, ship f6a623), ids are unique although the islands of an archipelago share a group number", sea.every((o, i) => { const s = M.obstacleSpec(o, 50, i); return s.kind === o.type && "#" + s.colour.toString(16).padStart(6, "0") === plan[o.type]; }) && new Set(sea.map((o, i) => M.obstacleSpec(o, 50, i).id)).size === sea.length && sea.filter((o) => o.type === "island").map((o) => o.group).some((g, i, a) => a.indexOf(g) !== i));
    const isl = M.obstacleSpec(sea.find((o) => o.type === "island"), 50);
    ok("!! an island is a column from the floor (-50) to ISLAND_RISE above the roof, at the obstacle's x and (scene Z =) y with its radius", isl.bottom === -50 && isl.top === M.ISLAND_RISE && isl.x === sea.find((o) => o.type === "island").x && isl.z === sea.find((o) => o.type === "island").y && isl.radius === sea.find((o) => o.type === "island").r);
    const bo = sea.find((o) => o.type === "berg"), b = M.obstacleSpec(bo, 50);
    ok("!! a berg floats (top BERG_RISE above the surface) and its keel hangs to -keel, narrowing to BERG_KEEL_TIP of the radius", b.top === M.BERG_RISE && near(b.bottom, -bo.keel) && b.tip === M.BERG_KEEL_TIP && b.radius === bo.r);
    const so = sea.find((o) => o.type === "ship"), sh = M.obstacleSpec(so, 50);
    ok("!! a ship has length 2 x r x SHIP_LENGTH, beam SHIP_BEAM of that, deck SHIP_DECK above the surface and keel -keel", near(sh.length, 2 * so.r * M.SHIP_LENGTH) && near(sh.beam, sh.length * M.SHIP_BEAM) && sh.top === M.SHIP_DECK && near(sh.bottom, -so.keel));
    ok("a keel deeper than the tank is clamped to the tank's depth; a negative keel to the surface", M.obstacleSpec({ type: "berg", group: 1, x: 1, y: 1, r: 5, keel: 80 }, 50).bottom === -50 && M.obstacleSpec({ type: "ship", group: 1, x: 1, y: 1, r: 5, keel: -4 }, 50).bottom === -0);
    ok("!! malformed obstacles give null: no radius, a zero radius, a non-finite position, a berg or ship with no keel, an unknown type, nothing", [{ type: "island", group: 0, x: 1, y: 1 }, { type: "island", group: 0, x: 1, y: 1, r: 0 }, { type: "island", group: 0, x: NaN, y: 1, r: 4 }, { type: "berg", group: 0, x: 1, y: 1, r: 4, keel: null }, { type: "ship", group: 0, x: 1, y: 1, r: 4 }, { type: "whale", group: 0, x: 1, y: 1, r: 4, keel: 3 }, null, undefined].every((o) => M.obstacleSpec(o, 50) === null));
    const g = M.goalSpec({ id: "c1", hue: 200, nav: { goal: { x: 120, y: 80, depth: 22 } } });
    ok("!! a goal is at X = x, Y = -depth, Z = y in the courier's hue, id goal:<sub>; none for no navigator, no goal or a non-finite goal", g.x === 120 && g.y === -22 && g.z === 80 && g.hue === 200 && g.id === "goal:c1" && [{ id: "a" }, { id: "a", nav: {} }, { id: "a", nav: { goal: null } }, { id: "a", nav: { goal: { x: 1, y: 2 } } }, null].every((s) => M.goalSpec(s) === null));
    const st = M.stationSpecs({ id: "s", survey: { finished: false, stations: [{ x: 10, y: 20, depth: 30, visited: false }, { x: 11, y: 21, depth: 31, visited: true }, { x: NaN, y: 1, depth: 1 }, null] } });
    ok("!! a running survey's stations: Y = -depth, amber until visited and green after, a malformed one skipped, ids carry the sub and the index", st.length === 2 && st[0].y === -30 && st[0].z === 20 && st[0].colour === M.COLOURS.stationTodo && st[1].colour === M.COLOURS.stationDone && st[0].id === "station:s:0" && st[1].id === "station:s:1");
    ok("a finished survey, no survey and a survey with no list give no stations", M.stationSpecs({ id: "s", survey: { finished: true, stations: [{ x: 1, y: 1, depth: 1 }] } }).length === 0 && M.stationSpecs({ id: "s" }).length === 0 && M.stationSpecs({ id: "s", survey: { stations: null } }).length === 0 && M.stationSpecs(null).length === 0);
    ok("!! moveHeading is the scene's rotation about Y (0 = +x; a move toward +z, which is a right turn's side, gives a NEGATIVE angle, as render/subAquarium3d.mjs subPose) and falls back when nothing moved", near(M.moveHeading(0, 0, 5, 0), 0) && near(M.moveHeading(0, 0, 0, 5), -Math.PI / 2) && near(M.moveHeading(0, 0, -5, 0), Math.PI) && M.moveHeading(3, 3, 3, 3, 0.7) === 0.7);
}

console.log("\n2. THE SCENE");
{
    const scene = new THREE.Scene(), marks = M.createMarks(THREE, scene, { depthMax: 50 });
    tank.sync([{ id: "c1", name: "c1", hue: 30, from: "me", local: true, theta: null }, { id: "c2", name: "c2", hue: 200, from: "me", local: true, theta: null }, { id: "s1", name: "s1", hue: 120, from: "me", local: true, theta: null }]);
    tank.setNav("c1", "any"); tank.setNav("c2", "any"); tank.step(2); tank.setSurvey("s1", {}); tank.step(1);
    const snap = tank.snapshot(), goals = snap.filter((s) => s.nav && s.nav.goal).length, stations = snap.reduce((n, s) => n + (s.survey && !s.survey.finished ? s.survey.stations.length : 0), 0);
    marks.update(sea, snap);
    const c1 = marks.counts();
    ok("!! one update draws 6 islands, 3 bergs, 2 ships, a buoy per courier with a goal and a ring per station of the running survey", c1.island === 6 && c1.berg === 3 && c1.ship === 2 && c1.goal === goals && goals === 2 && c1.station === stations && stations === 3, JSON.stringify(c1));
    const kinds = {}; scene.getObjectByName("marks").children.forEach((g) => { kinds[g.userData.kind] = (kinds[g.userData.kind] || 0) + 1; });
    ok("the objects are in the scene under one group", (kinds.island || 0) === 6 && (kinds.goal || 0) === 2 && (kinds.station || 0) === 3 && scene.getObjectByName("marks").children.length === 16);
    const isl = scene.getObjectByName("marks").children.find((g) => g.userData.kind === "island"), cyl = isl.children[0];
    ok("!! an island's column spans the floor to ISLAND_RISE (its scaled height is 53 m, its centre 22.5 m below the surface plus) and sits at the obstacle's x, z", near(cyl.scale.y, 50 + M.ISLAND_RISE) && near(cyl.position.y + cyl.scale.y / 2, M.ISLAND_RISE) && near(cyl.position.y - cyl.scale.y / 2, -50));
    const ringOf = (i) => scene.getObjectByName("marks").children.filter((g) => g.userData.kind === "station")[i].children[0].material.color.getHex();
    ok("the stations start amber", [0, 1, 2].every((i) => ringOf(i) === M.COLOURS.stationTodo));
    const ship0 = scene.getObjectByName("marks").children.find((g) => g.userData.kind === "ship"), p0 = ship0.position.clone();
    const moved = sea.map((o) => (o.type === "ship" ? { ...o, x: o.x + 10, y: o.y + 0 } : o));
    marks.update(moved, snap);
    const ship1 = scene.getObjectByName("marks").children.find((g) => g.userData.kind === "ship");
    ok("!! a second frame with the ships moved +x MOVES the same objects (same count, same object), turns the ship to its motion (rotation Y 0) and adds nothing", ship1 === ship0 && near(ship1.position.x, p0.x + 10) && near(ship1.rotation.y, 0) && marks.counts().ship === 2 && scene.getObjectByName("marks").children.length === 16);
    const moved2 = sea.map((o) => (o.type === "ship" ? { ...o, x: o.x + 10, y: o.y + 10 } : o));
    marks.update(moved2, snap);
    ok("!! a ship that then moves toward +z turns to -90 degrees (the scene's rotation), and holds that heading when it stops", near(ship1.rotation.y, -Math.PI / 2) && (marks.update(moved2, snap), near(ship1.rotation.y, -Math.PI / 2)));
    const visited = snap.map((s) => (s.survey && !s.survey.finished ? { ...s, survey: { ...s.survey, stations: s.survey.stations.map((q, i) => ({ ...q, visited: i === 1 })) } } : s));
    marks.update(moved2, visited);
    ok("!! a station that is visited turns green and the others stay amber", ringOf(1) === M.COLOURS.stationDone && ringOf(0) === M.COLOURS.stationTodo && ringOf(2) === M.COLOURS.stationTodo);
    {   // the vertical layout of each mark, in the scene's Y (the surface is 0): measured on the drawn meshes
        const ms = scene.getObjectByName("marks").children, span = (m) => [m.position.y - m.scale.y / 2, m.position.y + m.scale.y / 2];
        const bergO = sea.filter((o) => o.type === "berg")[0], berg = ms.find((g) => g.userData.kind === "berg"), [disc, keel] = berg.children, shipO = sea.find((o) => o.type === "ship"), shipG = ms.find((g) => g.userData.kind === "ship");
        ok("!! a berg: the disc stands from the surface up BERG_RISE and the keel hangs from the surface down to -keel, narrowing downward", near(span(disc)[0], 0) && near(span(disc)[1], M.BERG_RISE) && near(span(keel)[1], 0) && near(span(keel)[0], -bergO.keel) && keel.geometry.parameters.radiusTop === 1 && near(keel.geometry.parameters.radiusBottom, M.BERG_KEEL_TIP));
        ok("!! a ship: the hull stands from the surface up SHIP_DECK, the keel hangs from the surface to its keel depth, both at the ship's x, z", near(span(shipG.children[0])[0], 0) && near(span(shipG.children[0])[1], M.SHIP_DECK) && near(span(shipG.children[1])[1], 0) && near(span(shipG.children[1])[0], -shipO.keel + 0) && near(shipG.position.y, 0));
        const goal = ms.find((g) => g.userData.kind === "goal"), [ball, pole] = goal.children;
        ok("!! a goal buoy: the ball is at the goal's depth (the group's Y is -depth) and the pole runs from the ball up to the surface (its top is Y = 0 in the scene)", goal.position.y < 0 && near(ball.position.y, 0) && near(goal.position.y + span(pole)[1], 0) && near(span(pole)[0], 0) && near(ball.scale.x, M.BUOY_RADIUS));
        const ring = ms.find((g) => g.userData.kind === "station").children[0];
        ok("!! a station ring lies FLAT (its axis vertical: rotated a quarter turn about X), radius STATION_RADIUS, tube STATION_TUBE", near(ring.rotation.x, Math.PI / 2) && near(ring.scale.x, M.STATION_RADIUS) && near(ring.scale.x * ring.geometry.parameters.tube, M.STATION_TUBE));
    }
    {   // what is removed is disposed: every material of a removed mark gets the 'dispose' event
        const ms = scene.getObjectByName("marks").children, mats = ms.flatMap((g) => g.children.map((c) => c.material)); let disposed = 0; mats.forEach((m) => m.addEventListener("dispose", () => { disposed++; }));
        marks.update(null, null);
        ok("!! removing the marks disposes every one of their materials", mats.length > 0 && disposed === mats.length, `${disposed}/${mats.length}`);
        marks.update(sea, snap);
    }
    const none = snap.map((s) => ({ ...s, nav: null, survey: s.survey ? { ...s.survey, finished: true } : s.survey }));
    marks.update(sea.slice(0, 4), none);
    const c2 = marks.counts();
    ok("!! what leaves the lists leaves the scene: the goals, the stations and the obstacles that are no longer given", c2.goal === 0 && c2.station === 0 && c2.island + c2.berg + c2.ship === 4 && scene.getObjectByName("marks").children.length === 4, JSON.stringify(c2));
    marks.update(null, null);
    ok("an empty or null list takes every mark away without throwing", marks.counts().island === 0 && scene.getObjectByName("marks").children.length === 0);
    marks.update(sea, snap); marks.dispose();
    ok("dispose() removes the marks' group from the scene", scene.getObjectByName("marks") === undefined && scene.children.length === 0);
}

console.log("\n3. THE WIRING");
{
    const v3 = fs.readFileSync(path.join(ENG, "render", "subAquarium3d.mjs"), "utf8"), html = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8");
    ok("!! the 3D view imports the marks, builds them with the tank's depth, updates them in render() from the snapshot and the obstacles it was given, and disposes them", /import \{ createMarks \} from "\.\/subAquarium3dMarks\.mjs"/.test(v3) && /createMarks\(THREE, scene, \{ depthMax \}\)/.test(v3) && /marks\.update\(obstacles, snapshot\)/.test(v3) && /marks\.dispose\(\)/.test(v3));
    ok("!! it exposes setObstacles (a list, anything else reads as none) and marksCounts", /setObstacles\(list\) \{ obstacles = Array\.isArray\(list\) \? list : \[\]/.test(v3) && /marksCounts: \(\) => marks\.counts\(\)/.test(v3));
    ok("!! the page gives the 3D view tank.sceneNow() before each render", /view3d\.setObstacles\(tank\.sceneNow\(\)\); view3d\.render\(snap, /.test(html));
}

finished = true;
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks pass");
if (fails) process.exit(1);
