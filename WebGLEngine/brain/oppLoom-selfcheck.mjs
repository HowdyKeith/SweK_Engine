// WebGLEngine/brain/oppLoom-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/oppLoom-selfcheck.mjs      (about 5 s)
//
// THE GATE OF brain/oppLoom.mjs (Round 14): the downward-alignment inhibition on the fly array. Written and run BEFORE any stripe stimulus is run through the module.
//   1 THE ALIGNMENT   R_down = sum(dv) / sum(sqrt(dh^2 + dv^2)): +1 for a field moving DOWN, -1 UP, 0 for horizontal motion, 0 for symmetric expansion (down below, up above), 0 for no motion, and it works over a box;
//   2 THE GATE        global: a downward field (R 1) suppresses every active unit, an upward one (R -1) none, a horizontal one none, rho is a threshold (R exactly rho suppresses); local: only the units whose own field has downward motion are suppressed (motion in the left half only: left units out, right units kept); inactive units stay inactive; bad scope and bad rho are refused;
//   3 THE WRAPPED MODEL   with a looming square the gated count equals the raw count (a loom has no net vertical alignment) for both scopes; with the ellipse and downward-moving stripes the gate acts (some units suppressed, R_down positive); the first frame returns zeros; reset; frame-size mismatch is refused by the base model;
//   4 THE SOURCE      pure.
// SABOTAGE (2026-11-16, 32 mutants of brain/oppLoom.mjs): 28 red after closing four survivors (local >= versus >, the local sign, reset, and the alignment's strength); 1 not covered and said so: the wiring of the model's rfSide parameter into the local gate (the default 100 equals the gate's own default, so a wrong wiring is invisible at the default); 1 mutation string was an identity.
// NOT CHECKED: that the design means anything for a real looming neuron (it is a design, said in the header of the module).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as O from "./oppLoom.mjs";
import * as M from "./flyEmdLplc2Gf.mjs";
import { loomingEllipse } from "./stealthLoomStimuli.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const throws = (f) => { try { f(); return false; } catch (e) { return /oppLoom|flyEmdLplc2Gf/.test(e.message); } };
const fill = (w, h, f) => { const a = new Float64Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = f(x, y); return a; };

console.log("oppLoom-selfcheck -- the downward-alignment inhibition\n");

console.log("1. THE ALIGNMENT");
{
    const w = 20, h = 20, z = fill(w, h, () => 0), one = fill(w, h, () => 1), neg = fill(w, h, () => -1), sym = fill(w, h, (x, y) => (y < 10 ? -1 : 1));
    ok("!! R_down: +1 for a field moving DOWN (dv = +1), -1 UP, 0 for purely horizontal motion, 0 for no motion", near(O.downwardAlignment(z, one, w, h), 1) && near(O.downwardAlignment(z, neg, w, h), -1) && near(O.downwardAlignment(one, z, w, h), 0) && O.downwardAlignment(z, z, w, h) === 0);
    ok("!! an expansion (down below the middle, up above) has R_down 0, and a slanted motion (dh = dv = 1) has R_down 1/sqrt 2", near(O.downwardAlignment(z, sym, w, h), 0) && near(O.downwardAlignment(one, one, w, h), Math.SQRT1_2, 1e-12));
    ok("the box limits the region: a downward patch in the left half gives 1 over the left half, 0.5 over the whole frame's half-weighted... (R = sum dv / sum |v| = 1 over the patch and 1 over the frame when the rest is still)", near(O.downwardAlignment(z, fill(w, h, (x) => (x < 10 ? 1 : 0)), w, h, 0, 10, 0, 20), 1) && near(O.downwardAlignment(z, fill(w, h, (x) => (x < 10 ? 1 : 0)), w, h, 10, 20, 0, 20), 0) && near(O.downwardAlignment(z, fill(w, h, (x) => (x < 10 ? 1 : -1)), w, h), 0));
    ok("magnitudes matter: a strong upward patch beats a weak downward one (down 1 over half, up 3 over the other half: (1 - 3) / (1 + 3) = -0.5)", near(O.downwardAlignment(z, fill(w, h, (x) => (x < 10 ? 1 : -3)), w, h), -0.5, 1e-12));
}

console.log("\n2. THE GATE");
{
    const w = 40, h = 30, units = [{ x: 8, y: 15 }, { x: 32, y: 15 }, { x: 20, y: 5 }], act = [1, 1, 0];
    const dn = fill(w, h, () => 1), up = fill(w, h, () => -1), z = fill(w, h, () => 0), left = fill(w, h, (x) => (x < 20 ? 1 : 0));
    const gD = O.gateUnits(act, units, z, dn, w, h), gU = O.gateUnits(act, units, z, up, w, h), gH = O.gateUnits(act, units, dn, z, w, h);
    ok("!! global: a downward field suppresses every ACTIVE unit (2 suppressed, 0 left, R 1), an upward field none (2 left, R -1), a horizontal field none; the inactive unit stays inactive", gD.nAct === 0 && gD.suppressed === 2 && near(gD.R, 1) && gU.nAct === 2 && gU.suppressed === 0 && near(gU.R, -1) && gH.nAct === 2 && gD.active[2] === 0 && gU.active[2] === 0);
    const half = fill(w, h, (x) => (x < 20 ? 1 : 0)), gE = (rho) => O.gateUnits(act, units, z, half, w, h, { rho });
    ok("!! rho is a threshold with >=: the whole-frame R of a half-downward field is 1, so rho 1 suppresses, and with R = 0.5 (down 1 over half, horizontal 1 over the other half: 1 / (1 + 1) ... R 0.5) rho 0.5 suppresses and rho 0.6 does not", (() => { const m = fill(w, h, (x) => (x < 20 ? 1 : 0)), hx = fill(w, h, (x) => (x < 20 ? 0 : 1)); const a = O.gateUnits(act, units, hx, m, w, h, { rho: 0.5 }), b = O.gateUnits(act, units, hx, m, w, h, { rho: 0.6 }); return near(a.R, 0.5, 1e-12) && a.nAct === 0 && b.nAct === 2; })() && gE(1).nAct === 0);
    const gL = O.gateUnits(act, units, z, left, w, h, { scope: "local", rfSide: 20 });
    ok("!! local: downward motion in the LEFT half only suppresses the left unit (field 20 around x = 8) and keeps the right one (x = 32), and R is null", gL.nAct === 1 && gL.active[0] === 0 && gL.active[1] === 1 && gL.suppressed === 1 && gL.R === null);
    ok("local fields: a field that overlaps the downward half but is mostly outside it is judged on ITS OWN pixels (the unit at x = 20, field 20, sees half of its motion downward and half still: R 1, suppressed)", O.gateUnits([1], [{ x: 20, y: 15 }], z, left, w, h, { scope: "local", rfSide: 20 }).nAct === 0 && O.gateUnits([1], [{ x: 30, y: 15 }], z, left, w, h, { scope: "local", rfSide: 20 }).nAct === 1);
    const hx = fill(w, h, (x) => (x < 20 ? 0 : 1)), mm = fill(w, h, (x) => (x < 20 ? 1 : 0)), lc = (rho, dv, dh) => O.gateUnits([1], [{ x: 20, y: 15 }], dh, dv, w, h, { scope: "local", rho, rfSide: 40 }).nAct;
    ok("!! local rho is >= and direction-specific: a field with R exactly 0.5 (down over half, horizontal over the other half) is suppressed at rho 0.5 and not at 0.6; a fully UPWARD field is not suppressed at rho 0.5", lc(0.5, mm, hx) === 0 && lc(0.6, mm, hx) === 1 && lc(0.5, fill(w, h, () => -1), z) === 1);
    ok("bad scope and bad rho (0, above 1) are refused; the defaults are global and 0.5", throws(() => O.gateUnits(act, units, z, z, w, h, { scope: "regional" })) && throws(() => O.gateUnits(act, units, z, z, w, h, { rho: 0 })) && throws(() => O.gateUnits(act, units, z, z, w, h, { rho: 1.5 })) && O.OPP.scope === "global" && O.OPP.rho === 0.5);
}

console.log("\n3. THE WRAPPED MODEL");
{
    const loom = M.loomingSquare({ rv: 0.1 }).frames;
    const rg = O.runOpp(loom, { opp: { scope: "global" } }), rl = O.runOpp(loom, { opp: { scope: "local" } });
    ok("!! a looming square has no net vertical alignment: the gated count equals the raw count at every frame, for both scopes, and the raw count is the plain model's", rg.nAct.every((v, i) => v === rg.nActRaw[i]) && rl.nAct.every((v, i) => v === rl.nActRaw[i]) && Math.max(...rg.nAct) > 1000 && Math.max(...rg.nActRaw) === Math.max(...M.runStimulus(loom, {}).nAct));
    const st = loomingEllipse({ rv: 0.1, stripes: "moving" }).frames, sg = O.runOpp(st, { opp: { scope: "global" } }), su = loomingEllipse({ rv: 0.1, stripes: "moving", stripeHz: -4 }).frames;
    const gSup = sg.nAct.reduce((a, v, i) => a + (sg.nActRaw[i] - v), 0), ug = O.runOpp(su, { opp: { scope: "global" } }), uSup = ug.nAct.reduce((a, v, i) => a + (ug.nActRaw[i] - v), 0);
    ok("!! with the ellipse and DOWN-moving stripes the gate acts (units suppressed, some frame's R_down at least rho), with UP-moving stripes it does not (no unit suppressed, and in every frame where units were active R_down is below rho; R_down can reach 1 in early frames whose few motion pixels all point down, when no unit is active: a property of the design, not hidden)", gSup > 0 && Math.max(...sg.Rs.filter((v) => v !== null)) >= 0.5 && uSup === 0 && ug.Rs.every((v, i) => v === null || ug.nActRaw[i] === 0 || v < 0.5), `down: ${gSup} unit-frames, max R ${Math.max(...sg.Rs.filter((v) => v !== null)).toFixed(2)}; up: ${uSup}, max R ${Math.max(...ug.Rs.filter((v) => v !== null)).toFixed(2)}`);
    const m = O.createOppModel({ w: 200, h: 150 }), r0 = m.step(loom[0]);
    ok("the first frame returns zeros (no maps yet) and reset restores that; a frame of the wrong size is refused", r0.nAct === 0 && r0.R === null && r0.suppressed === 0 && (() => { m.step(loom[1]); m.step(loom[2]); m.reset(); const z = m.step(loom[0]); return z.nAct === 0 && z.R === null; })() && throws(() => m.step({ w: 10, h: 10, data: new Float32Array(100) })));
}

console.log("\n4. THE SOURCE");
{
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "oppLoom.mjs"), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! pure: no Math.random, no clock, no DOM, no file or network (the only import is the fly array)", !/Math\.random|Date\.now|performance\.now|document\.|window\.|fetch\(|node:|readFileSync/.test(src) && (src.match(/^import\s/gm) || []).length === 1);
}

finished = true;
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks pass");
if (fails) process.exit(1);
