// WebGLEngine/render/subAquarium3dMarks-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquarium3dMarks-selfcheck.mjs      (under a second; the real three.js in node, no renderer)
//
// THE 3D VIEW'S TWO NEW MARKS (nextRounds fly-dark-sub-3d and the survey markers, 2026-11-17), held to the plan view's:
//   1 DARK      darkMark: none for a sound compass, a ring of DARK_RING round the sub at its depth, and a ghost line of 2.2 rings along the BELIEVED heading -- the same direction the
//               hull's nose points for that heading (built with buildSub and the view's own rotation), so the gap between nose and line is the error, as in the plan view.
//   2 BUOYS     stationMarks: one per station of a running survey, at (x, -depth, y), visited or not; none for a finished survey.
//   3 SYNC      syncMarks keeps one ring, one line and one buoy per mark, moves them, recolours a visited buoy green, and removes what left the snapshot.
//   4 THE VIEW  createView3d adds the marks group to its scene and calls syncMarks from render(), and exposes marks() (source rows; the live draw is subAquarium3d-selfcheck's).
// NOT CHECKED, said plainly: how the marks look on a real GPU (nobody has looked).
// SABOTAGE LOG (9 mutants of render/subAquarium3d.mjs, each alone, restored byte-identical): the ghost along +sin (2 red), the ring at the surface (1), a valid compass marked (2),
//   a finished survey drawn (2), the buoy depth upward (1), a visited buoy not recoloured (1), marks never removed (2), render() not syncing them (1), the ghost 2 rings long (1).
"use strict";
import fs from "node:fs";
import * as THREE from "../vendor/three/three.module.js";
import * as V from "./subAquarium3d.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
const t0 = Date.now();
console.log("subAquarium3dMarks-selfcheck -- the dark compass and the survey's buoys in three dimensions\n");

const row = (o = {}) => ({ id: "a", x: 100, y: 50, depth: 20, heading: 0.4, pitch: 0, ...o });
sec("1. DARK");
{
    ok("!! no mark for a sound compass or none at all", V.darkMark(row({ compass: { valid: true, seen: 0.4 } })) === null && V.darkMark(row()) === null);
    const m = V.darkMark(row({ compass: { valid: false, seen: 1.1 } }));
    ok("!! a dark compass: the ring at the sub (X = x, Y = -depth, Z = y), radius DARK_RING; the tip 2.2 rings out along (cos seen, 0, -sin seen)", m.centre.join() === "100,-20,50" && m.r === V.DARK_RING && near(m.tip[0], 100 + Math.cos(1.1) * V.DARK_RING * 2.2) && m.tip[1] === -20 && near(m.tip[2], 50 - Math.sin(1.1) * V.DARK_RING * 2.2));
    ok("  a non-finite belief draws the ring and no line; the scale sizes both", V.darkMark(row({ compass: { valid: false, seen: NaN } })).tip === null && V.darkMark(row({ compass: { valid: false, seen: 0 } }), 2).r === V.DARK_RING * 2);
    const sub = V.buildSub(THREE, new THREE.MeshBasicMaterial()), h = 1.1, p = V.subPose(row({ heading: h })); sub.rotation.set(0, p.rotY, p.rotZ); sub.updateMatrixWorld(true);
    const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(sub.quaternion), mk = V.darkMark(row({ heading: h, compass: { valid: false, seen: h } })), d = new THREE.Vector3(mk.tip[0] - mk.centre[0], 0, mk.tip[2] - mk.centre[2]).normalize();
    ok("!! when the belief is the truth the ghost line lies along the hull's own nose (the view's rotation), so a gap between them is the heading error", near(nose.x, d.x, 1e-6) && near(nose.z, d.z, 1e-6) && near(nose.y, 0, 1e-9));
}

sec("2. BUOYS");
{
    const st = [{ x: 10, y: 20, depth: 5, visited: true }, { x: 30, y: 40, depth: 12, visited: false }];
    const marks = V.stationMarks([row({ survey: { finished: false, stations: st } }), row({ id: "b", survey: { finished: true, stations: st } }), row({ id: "c" })]);
    ok("!! one buoy per station of a RUNNING survey at (x, -depth, y), visited or not; a finished survey and no survey draw none", marks.length === 2 && marks[0].pos.join() === "10,-5,20" && marks[0].visited === true && marks[1].pos.join() === "30,-12,40" && marks[1].visited === false && marks[0].id === "a#0");
}

sec("3. SYNC");
{
    const store = V.marksStore(THREE), dark = (id, seen) => row({ id, compass: { valid: false, seen } }), st = (v) => ({ finished: false, stations: [{ x: 1, y: 2, depth: 3, visited: v }] });
    const c1 = V.syncMarks(THREE, store, [dark("a", 0.2), dark("b", NaN), row({ id: "s", survey: st(false) })]);
    const a = store.dark.get("a"), b = store.dark.get("b"), buoy = store.buoys.get("s#0");
    ok("!! two dark subs make two rings and two lines (b's line hidden: no belief), the open station one amber buoy, all in the group", c1.dark === 2 && c1.buoys === 1 && store.group.children.length === 5 && a.ghost.visible && !b.ghost.visible && buoy.material.color.getHex() === V.STATION_COLOURS.open && a.ring.material.color.getHex() === V.DARK_COLOUR);
    const arr = a.ghost.geometry.attributes.position.array, mk = V.darkMark(dark("a", 0.2));
    ok("!! the ring sits at the sub and is DARK_RING across; the line runs from the sub to the tip", a.ring.position.toArray().join() === mk.centre.join() && a.ring.scale.x === V.DARK_RING && [...arr].every((v, i) => near(v, [...mk.centre, ...mk.tip][i], 1e-4)));
    const c2 = V.syncMarks(THREE, store, [row({ id: "a", compass: { valid: true, seen: 0.2 } }), row({ id: "s", survey: st(true) })]);
    ok("!! a compass that comes back takes its ring and line away, b leaving takes its own, and a visited station turns its buoy green", c2.dark === 0 && c2.buoys === 1 && store.group.children.length === 1 && store.buoys.get("s#0").material.color.getHex() === V.STATION_COLOURS.visited);
    ok("  a finished survey takes its buoys away", V.syncMarks(THREE, store, [row({ id: "s", survey: { ...st(true), finished: true } })]).buoys === 0 && store.group.children.length === 0);
}

sec("4. THE VIEW");
{
    const code = fs.readFileSync(new URL("./subAquarium3d.mjs", import.meta.url), "utf8");
    ok("!! createView3d adds the marks group to the scene, render() syncs it from the snapshot at the view's sub scale, and marks() reports the counts", /const marks = marksStore\(THREE\); scene\.add\(marks\.group\);/.test(code) && /syncMarks\(THREE, marks, snapshot, subScale\);/.test(code) && /marks\(\) \{ return \{ dark: marks\.dark\.size, buoys: marks\.buoys\.size \}; \}/.test(code));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)\nnot checked here: how the marks look on a real GPU.`);
process.exitCode = fails ? 1 : 0;
