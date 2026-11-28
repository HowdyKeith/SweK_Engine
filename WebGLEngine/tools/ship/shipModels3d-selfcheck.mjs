// WebGLEngine/tools/ship/shipModels3d-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/shipModels3d-selfcheck.mjs      (a second; the real three.js in node, no renderer)
//
// THE SHARED SHIP MODELS, HELD (render/shipModels3d.mjs; Keith, 2026-11-28: "Do we have ship models we can take from battleship3d"). battleship3d.html's hull code moved there
// word for word; the page imports it.
//   1  MOVED, NOT CHANGED   each design's mesh count, vertex count, the sum of every vertex's position and its bounding box, as battleship3d.html's own code built them before
//                           the move (measured 2026-11-28 by evaluating the page's block with this three.js; written below) -- to 6 decimals
//   2  THE PAGE             battleship3d.html imports the module and no longer defines the hulls itself
//   3  THE CLASSES          shipForClass: each surface-ship class at its length, beam and draft in metres, bow toward +x, the keel the draft under the waterline
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../../vendor/three/three.module.js";
import * as M from "../../render/shipModels3d.mjs";
import { SHIP_CLASSES } from "../../physics/mechanics/surfaceShip.mjs";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("shipModels3d-selfcheck -- battleship3d's hulls, shared\n");
// battleship3d.html's own buildShipBody, before the move: { meshes, verts, sum of vertex positions, bounding box } per design
const BEFORE = {"CARRIER":{"meshes":33,"verts":888,"sum":[-27.998778,622.060441,131.042361],"min":[-7.623,-0.25,-1.26],"max":[6.4404,1.95,1.26]},"BATTLESHIP":{"meshes":30,"verts":1168,"sum":[-100.9008,1073.36147,7.383139],"min":[-6.123,-0.25,-0.87],"max":[4.9404,2.71,0.87]},"CRUISER":{"meshes":26,"verts":936,"sum":[-118.8208,796.108735,4.858969],"min":[-6.123,-0.25,-0.87],"max":[4.9404,2.4025,0.87]},"DESTROYER":{"meshes":18,"verts":608,"sum":[43.5792,499.851625,2.655934],"min":[-4.623,-0.25,-0.87],"max":[3.4404,2.095,0.87]}};
const fp = (g) => { g.updateMatrixWorld(true); let meshes = 0, verts = 0; const sum = [0, 0, 0], v = new THREE.Vector3(); g.traverse((o) => { if (!o.isMesh) return; meshes++; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); sum[0] += v.x; sum[1] += v.y; sum[2] += v.z; verts++; } }); const b = new THREE.Box3().setFromObject(g); return { meshes, verts, sum: sum.map((x) => +x.toFixed(6)), min: b.min.toArray().map((x) => +x.toFixed(6)), max: b.max.toArray().map((x) => +x.toFixed(6)) }; };
const S = M.createShipModels(THREE, { cell: 3 });

console.log("1. MOVED, NOT CHANGED");
for (const [n, l] of [["CARRIER", 4], ["BATTLESHIP", 3], ["CRUISER", 3], ["DESTROYER", 2]]) { const now = fp(S.buildShipBody(n, l).grp); ok(`!! ${n}: the module builds what the page built -- ${BEFORE[n].meshes} meshes, ${BEFORE[n].verts} vertices, the same sum and box`, JSON.stringify(now) === JSON.stringify(BEFORE[n]), JSON.stringify(now).slice(0, 160)); }

console.log("2. THE PAGE");
{ const html = fs.readFileSync(path.join(ENG, "battleship3d.html"), "utf8");
  ok("!! battleship3d.html imports render/shipModels3d.mjs and builds its hulls with it, defining none of them itself", /import \{ createShipModels \} from "\/render\/shipModels3d\.mjs"/.test(html) && /createShipModels\(THREE, \{ cell: CFG\.CELL \}\)/.test(html) && !/function (buildShipBody|decorateSegment|mkTurret|mkBridge|smat|sbox)\(/.test(html)); }

console.log("3. THE CLASSES");
for (const cls of Object.keys(SHIP_CLASSES)) {
    const g = S.shipForClass(cls); g.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(g), sz = b.getSize(new THREE.Vector3()), C = SHIP_CLASSES[cls];
    // the bow: the design's prow (its narrowest end) must be at +x -- the vertices within 2% of the length of each end, the +x end the narrower
    const ends = { hi: [], lo: [] }, v = new THREE.Vector3(); g.traverse((o) => { if (!o.isMesh) return; const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (v.x > b.max.x - 0.02 * sz.x) ends.hi.push(v.z); if (v.x < b.min.x + 0.02 * sz.x) ends.lo.push(v.z); } });
    const width = (a) => Math.max(...a) - Math.min(...a);
    ok(`!! ${cls}: ${C.length} m long, ${C.beam} m in the beam, the keel ${C.draft} m under the waterline, the prow toward +x`, Math.abs(sz.x - C.length) < 1e-6 && Math.abs(sz.z - C.beam) < 1e-6 && Math.abs(b.min.y + C.draft) < 1e-6 && width(ends.hi) < width(ends.lo), `${sz.x.toFixed(2)} x ${sz.z.toFixed(2)}, keel ${b.min.y.toFixed(2)}; ends ${width(ends.hi).toFixed(2)} / ${width(ends.lo).toFixed(2)}`);
}
let refused = false; try { S.shipForClass("battleship"); } catch { refused = true; }
ok("!! an unknown class is refused", refused);
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: (filled in after the sweep)
