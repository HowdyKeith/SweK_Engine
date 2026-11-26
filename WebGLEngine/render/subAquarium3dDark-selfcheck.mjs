// WebGLEngine/render/subAquarium3dDark-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquarium3dDark-selfcheck.mjs      (under a second; the real three.js in node, no renderer)
//
// THE 3D VIEW'S DARK-COMPASS MARK (nextRounds fly-dark-sub-3d, 2026-11-17), held to the plan view's. 2026-11-20: this was render/subAquarium3dMarks-selfcheck.mjs on main, which held the dark mark AND
// the survey's buoys. Merging claude/inspiring-mayer-9mdcut for v4932 (Keith: take the branch's), the branch's render/subAquarium3dMarks.mjs (obstacles, goals, survey stations) took that name and
// the buoys; the dark mark has no counterpart there, so its rows moved here, renamed with the store (darkStore / syncDark / darkCount).
//   1 DARK      darkMark: none for a sound compass, a ring of DARK_RING round the sub at its depth, and a ghost line of 2.2 rings along the BELIEVED heading -- the same direction the hull's nose
//               points for that heading (built with buildSub and the view's own rotation), so the gap between nose and line is the error, as in the plan view.
//   2 SYNC      syncDark keeps one ring and one line per dark sub, moves them, and removes what left the snapshot; a survey draws nothing in this store.
//   3 THE VIEW  createView3d adds the dark group to its scene, calls syncDark from render(), and exposes darkCount().
// NOT CHECKED, said plainly: how the mark looks on a real GPU (nobody has looked).
// SABOTAGE LOG (main's, 9 mutants of render/subAquarium3d.mjs; the 5 on the dark mark carry over, the 4 on the buoys went with them): the ghost along +sin, the ring at the surface, a valid compass marked,
//   marks never removed, render() not syncing them. Re-run on this file 2026-11-20: see the line at the end of the merge commit's gate run.
"use strict";
import fs from "node:fs";
import * as THREE from "../vendor/three/three.module.js";
import * as V from "./subAquarium3d.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
const t0 = Date.now();
console.log("subAquarium3dDark-selfcheck -- the dark compass in three dimensions\n");

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

sec("2. SYNC");
{
    const store = V.darkStore(THREE), dark = (id, seen) => row({ id, compass: { valid: false, seen } }), st = { finished: false, stations: [{ x: 1, y: 2, depth: 3, visited: false }] };
    const c1 = V.syncDark(THREE, store, [dark("a", 0.2), dark("b", NaN), row({ id: "s", survey: st })]);
    const a = store.dark.get("a"), b = store.dark.get("b");
    ok("!! two dark subs make two rings and two lines (b's line hidden: no belief), all in the group; a running survey adds nothing here", c1.dark === 2 && store.group.children.length === 4 && a.ghost.visible && !b.ghost.visible);
    const arr = a.ghost.geometry.attributes.position.array, mk = V.darkMark(dark("a", 0.2));
    ok("!! the ring sits at the sub and is DARK_RING across; the line runs from the sub to the tip", a.ring.position.toArray().join() === mk.centre.join() && a.ring.scale.x === V.DARK_RING && [...arr].every((v, i) => near(v, [...mk.centre, ...mk.tip][i], 1e-4)));
    const c2 = V.syncDark(THREE, store, [row({ id: "a", compass: { valid: true, seen: 0.2 } })]);
    ok("!! a compass that comes back takes its ring and line away, and b leaving takes its own", c2.dark === 0 && store.group.children.length === 0);
}

sec("3. THE VIEW");
{
    const code = fs.readFileSync(new URL("./subAquarium3d.mjs", import.meta.url), "utf8");
    ok("!! createView3d adds the dark group to the scene, render() syncs it from the snapshot at the view's sub scale, and darkCount() reports it", /const dark = darkStore\(THREE\); scene\.add\(dark\.group\);/.test(code) && /syncDark\(THREE, dark, snapshot, subScale\);/.test(code) && /darkCount\(\) \{ return dark\.dark\.size; \}/.test(code));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)\nnot checked here: how the marks look on a real GPU.`);
process.exitCode = fails ? 1 : 0;
