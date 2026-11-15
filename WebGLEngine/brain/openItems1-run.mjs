// WebGLEngine/brain/openItems1-run.mjs -- sensitivity sweeps of the Rounds 3 and 6 fly results to the assumptions the notes name as open. Run: node brain/openItems1-run.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "./flyEmdLplc2Gf.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const retino = JSON.parse(fs.readFileSync(path.join(HERE, "..", "vendor", "male-cns", "giant-fiber-visual-retinotopy.json"), "utf8"));
const margin = (s, r) => { if (!r.spikes.length) return null; const i = Math.min(s.t.length - 1, Math.floor(r.spikes[0] / 0.01 + 1e-9)); return -s.t[i] * 1000; };
const f = (v) => (v === null ? "MISSED" : v.toFixed(0));
console.log("== A. luminance scale x contrast (fly A, r/v 100 ms): margin ms, peak N");
for (const ls of [255, 25, 5, 1]) for (const wc of [1, 0.2]) { const row = []; for (const st of ["none", "moving"]) { const s = loomingEllipse({ rv: 0.1, wc, stripes: st }), r = M.runStimulus(s.frames, { params: { lumScale: ls } }); row.push(`${st} ${f(margin(s, r))} (peak ${Math.max(...r.nAct)})`); } console.log(`lumScale ${ls} wc ${wc}: ${row.join("  |  ")}`); }
console.log("\n== B. surround strength kappa (C), moving/plain peak ratio");
for (const k of [1, 5, 20, 100]) { const row = []; for (const rv of [0.05, 0.1]) { const pk = (st) => { const s = loomingEllipse({ rv, stripes: st }); return Math.max(...M.runStimulus(s.frames, { params: { surroundKappa: k } }).nAct); }; const p = pk("none"), m = pk("moving"); row.push(`r/v ${rv}: ${(m / p).toFixed(3)} (plain ${p})`); } console.log(`kappa ${k}: ${row.join("  |  ")}`); }
console.log("\n== C. lattice degrees per column (D), moving/plain peak ratio and units placed");
for (const dpc of [3, 5, 8]) { const L = M.latticeUnits(retino, { degPerColumn: dpc }), row = []; for (const rv of [0.05, 0.1]) { const pk = (st) => { const s = loomingEllipse({ rv, stripes: st }); return Math.max(...M.runLattice(s.frames, L.units).nEff); }; const p = pk("none"), m = pk("moving"); row.push(`r/v ${rv}: ${(m / p).toFixed(3)} (plain ${p.toFixed(0)})`); } console.log(`degPerColumn ${dpc} (${L.units.length} placed, ${L.dropped} dropped): ${row.join("  |  ")}`); }
