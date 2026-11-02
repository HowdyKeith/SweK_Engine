// WebGLEngine/render/subModelsCore-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subModelsCore-selfcheck.mjs      (~0.05 s)
//
// THE GATE OF render/subModelsCore.mjs, phase 1 of docs/SUB-GLB-MODEL-SWAP.md: the pure half of "a submarine wears a downloaded .glb". Nothing is loaded and nothing is drawn; every number is checked against an answer written by hand.
//   1  CLASSES      the hulls the tank knows (physics/mechanics/subHulls.mjs) plus "default"; an unknown hull reads as default
//   2  THE STORE    persists through an injected storage, reloads, clears; refuses an unknown class, an empty url, a bad up axis and AN EMPTY LICENCE; defaults for name, author, source; yaw snaps; resolution hull > default > null; a broken storage never throws
//   3  ORIENTATION  all twelve (up, yaw) combinations: the model's up goes to +Y, no mirroring (determinant +1), the nose table of the four yaws, a bad up refused
//   4  FITTING      orientedBounds, fitScale (the long HORIZONTAL axis, not the tall sail; a long side across the nose warns; a tall-not-long model warns; degenerate bounds refused), centering
//   5  THE CUES     cuePlacement is the procedural placement for bounds of +-R, and moves with the model's top and keel
//   6  THE REST     triangleBudget edges, attributionLine, hueRgb, tintRgb (amount 0 keeps the model's colour exactly), the source's purity
//
// SABOTAGED -- 70 mutants of render/subModelsCore.mjs (constants, the class test, the store: trims, refusals, defaults, copies, resolution order, reload, the storage try/catch; the matrices and their order; the bounds checks and corners; the fit axis, length, refusals and warnings; centering; the five cue numbers; the triangle edges; the attribution; the hue and the tint; purity), each run against a copy of this gate, every one red BY NAME, the identity mutant read 0 red. FIRST PASS: 6 read 0 red or crashed the gate -- a dead negative-zero map in orientationOf was CUT, the hue wrap got -350 and -90 rows, three rows were made to fail by name instead of throwing (the up-axes loop, the broken-storage store, the default resolution).
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { SPECS } from "../physics/mechanics/subHulls.mjs";
import * as C from "./subModelsCore.mjs";

let fails = 0;
const ok = (name, cond, detail) => { try { if (typeof cond === "function") cond = cond(); } catch (e) { cond = false; detail = "threw: " + e.message; } console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, e = 1e-9) => Math.abs(a - b) < e, nearV = (a, b, e = 1e-9) => a.length === b.length && a.every((x, i) => near(x, b[i], e));
const throws = (f) => { try { f(); return false; } catch (e) { return true; } };
const mock = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, raw: m }; };
const lic = { url: "/GPU_Assets/subs/a.glb", licence: "CC-BY-4.0", name: "Alpha", author: "Someone", sourceUrl: "https://sketchfab.com/x", yaw: 90, up: "z" };

console.log("subModelsCore-selfcheck -- the pure half of a downloaded submarine model\n");

sec("1. CLASSES");
{
    const hulls = Object.keys(SPECS);
    ok("!! the classes are every hull the tank knows plus 'default' (14 here: 13 hulls), in that order, and a hull's class is itself", J(C.SUB_MODEL_CLASSES) === J([...hulls, "default"]) && hulls.length === 13 && hulls.every((h) => C.subModelClass(h) === h) && C.DEFAULT_CLASS === "default");
    ok("!! an unknown hull, null, a number and an inherited name ('toString') all read as default", ["nope", null, undefined, 7, "toString", "__proto__"].every((h) => C.subModelClass(h) === "default"));
    ok("!! snapYaw snaps to 0/90/180/270 (44 -> 0, 46 -> 90, -90 -> 270, 450 -> 90, NaN and a string -> 0)", C.snapYaw(44) === 0 && C.snapYaw(46) === 90 && C.snapYaw(-90) === 270 && C.snapYaw(450) === 90 && C.snapYaw(NaN) === 0 && C.snapYaw("x") === 0 && C.snapYaw(360) === 0);
}

sec("2. THE STORE");
{
    const st = mock(), a = C.makeSubModelStore(st), r = a.set("nominal", lic), got = a.get("nominal");
    ok("!! a good assignment is stored and read back whole (url, yaw 90, up z, name, author, licence, source) under the key swek.subModels.v1", r.ok === true && J(got) === J({ url: lic.url, yaw: 90, up: "z", name: "Alpha", author: "Someone", licence: "CC-BY-4.0", sourceUrl: "https://sketchfab.com/x" }) && st.raw.has("swek.subModels.v1") && C.STORE_KEY === "swek.subModels.v1");
    const b = C.makeSubModelStore(st);
    ok("!! a second store on the same storage sees it; reload() picks up a write made through the other; clear() removes it for both after a reload", J(b.get("nominal")) === J(got) && (() => { a.set("heavy", { ...lic, url: "/x.glb" }); const seen = b.reload(); return !!seen.heavy; })() && (() => { a.clear("heavy"); b.reload(); return b.get("heavy") === null; })());
    const bad = mock(), s2 = C.makeSubModelStore(bad), before = J(s2.all());
    const refusals = [s2.set("zzz", lic), s2.set("nominal", { ...lic, url: "" }), s2.set("nominal", { ...lic, url: "   " }), s2.set("nominal", { ...lic, up: "x" }), s2.set("nominal", { ...lic, licence: "" }), s2.set("nominal", { ...lic, licence: "   " }), s2.set("nominal", { ...lic, licence: undefined }), s2.set("nominal", { ...lic, licence: 5 }), s2.set("nominal", undefined)];
    ok("!! nine bad assignments are each refused with ok false and a reason, and NOTHING is stored or written (an unknown class, an empty or blank url, an up axis 'x', a licence that is empty, blank, missing or not a string, no entry at all)", refusals.every((x) => x.ok === false && typeof x.error === "string" && x.error.length > 5) && J(s2.all()) === before && bad.raw.size === 0);
    ok("!! the refusal for a missing licence says so in words (a model with no stated licence is not assigned) and 'unknown' IS accepted as a statement", /no stated licence/.test(refusals[4].error) && s2.set("nominal", { ...lic, licence: "unknown" }).ok === true && s2.get("nominal").licence === "unknown");
    const s3 = C.makeSubModelStore(mock()), d = s3.set("highRider", { url: "/GPU_Assets/subs/Deep Boat.glb", licence: " CC0 ", yaw: 46 }).entry;
    ok("!! defaults and cleaning: the name is the file name of the url, the author 'unknown', the source empty, up 'y', yaw 46 snaps to 90, the licence is trimmed", d.name === "Deep Boat.glb" && d.author === "unknown" && d.sourceUrl === "" && d.up === "y" && d.yaw === 90 && d.licence === "CC0" && s3.set("heavy", { url: "C:\\models\\sub.glb", licence: "x" }).entry.name === "sub.glb");
    const s4 = C.makeSubModelStore(mock());
    ok("!! resolve(): the hull's own entry first, else the 'default' entry, else null; an unknown hull takes the default; clearing the hull falls back to the default", (() => (s4.resolve("nominal") === null && (() => { s4.set("default", { ...lic, url: "/d.glb" }); return s4.resolve("nominal").url === "/d.glb" && s4.resolve("nope").url === "/d.glb"; })() && (() => { s4.set("nominal", { ...lic, url: "/n.glb" }); return s4.resolve("nominal").url === "/n.glb" && s4.resolve("heavy").url === "/d.glb"; })() && (() => { s4.clear("nominal"); return s4.resolve("nominal").url === "/d.glb"; })()))());
    const broken = { getItem: () => "{not json", setItem: () => { throw new Error("quota"); } };
    ok("!! a storage with broken JSON reads as empty, and one whose setItem throws does not make set() throw (the assignment still holds in memory)", (() => ((() => { const s5 = C.makeSubModelStore(broken); return J(s5.all()) === "{}" && s5.set("nominal", lic).ok === true && s5.get("nominal").url === lic.url; })() && !throws(() => C.makeSubModelStore({ getItem: () => { throw new Error("x"); }, setItem: () => {} }).all())))());
    ok("!! get() returns a copy: changing what it returned does not change the store", (() => { const s = C.makeSubModelStore(mock()); s.set("nominal", lic); const g = s.get("nominal"); g.url = "/hacked"; g.licence = "none"; return s.get("nominal").url === lic.url && s.get("nominal").licence === "CC-BY-4.0"; })());
}

sec("3. ORIENTATION");
{
    const ups = { y: [0, 1, 0], z: [0, 0, 1], "-z": [0, 0, -1] }, det = (m) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    let allUp = true, allDet = true, allOrtho = true;
    try { for (const up of Object.keys(ups)) for (const yaw of [0, 90, 180, 270]) {
        const M = C.orientationOf({ yaw, up });
        if (!nearV(C.applyMatrix(M, ups[up]), [0, 1, 0])) allUp = false;
        if (!near(det(M), 1)) allDet = false;
        const cols = [0, 1, 2].map((j) => [M[j], M[3 + j], M[6 + j]]);
        for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) { const d = cols[i][0] * cols[k][0] + cols[i][1] * cols[k][1] + cols[i][2] * cols[k][2]; if (!near(d, i === k ? 1 : 0)) allOrtho = false; }
}
    } catch (e) { allUp = allDet = allOrtho = false; }
    ok("!! all twelve (up, yaw) combinations take the model's own up axis (+Y, +Z or -Z) to the hull's +Y, are rotations (determinant +1, orthonormal: no mirroring, no stretching)", (() => (allUp && allDet && allOrtho))());
    const nose = { 0: [1, 0, 0], 90: [0, 0, -1], 180: [-1, 0, 0], 270: [0, 0, 1] };
    ok("!! the nose table (three's rotation about Y): a model whose nose is +X goes to +X at yaw 0, to -Z at 90, to -X at 180 and to +Z at 270, whatever the up axis (the up turn leaves X alone)", (() => ([0, 90, 180, 270].every((y) => ["y", "z", "-z"].every((u) => nearV(C.applyMatrix(C.orientationOf({ yaw: y, up: u }), [1, 0, 0]), nose[y])))))());
    ok("!! a Z-up model: its +Y goes to -Z (up z), its -Y to +Z; for up -z its +Y goes to +Z; hand-written matrices for (z, 0) and (z, 90)", (() => (nearV(C.applyMatrix(C.orientationOf({ up: "z" }), [0, 1, 0]), [0, 0, -1]) && nearV(C.applyMatrix(C.orientationOf({ up: "-z" }), [0, 1, 0]), [0, 0, 1]) && J(C.orientationOf({ up: "z" })) === J([1, 0, 0, 0, 0, 1, 0, -1, 0]) && J(C.orientationOf({ yaw: 90, up: "z" })) === J([0, -1, 0, 0, 0, 1, -1, 0, 0])))());
    ok("!! the defaults are yaw 0 and up y (the identity), a bad up axis throws, and the yaw snaps (44 -> 0, 46 -> 90)", (() => (J(C.orientationOf()) === J([1, 0, 0, 0, 1, 0, 0, 0, 1]) && throws(() => C.orientationOf({ up: "x" })) && J(C.orientationOf({ yaw: 44 })) === J(C.orientationOf({ yaw: 0 })) && J(C.orientationOf({ yaw: 46 })) === J(C.orientationOf({ yaw: 90 }))))());
    ok("!! no negative zero escapes from applyMatrix (JSON would print -0 as 0 but Object.is would not)", (() => (C.applyMatrix([0, 0, 0, 0, 0, 0, 0, 0, 0], [-1, -1, -1]).every((v) => !Object.is(v, -0))))());
}

sec("4. FITTING");
{
    const I = C.orientationOf(), sub = { min: [-4, -0.6, -0.6], max: [4, 1.4, 0.6] };   // 8 long, 1.2 wide, 2 tall with its sail
    const ob = C.orientedBounds(sub, C.orientationOf({ yaw: 90 }));
    ok("!! orientedBounds turns the eight corners and boxes them again: a yaw of 90 swaps the 8-long x extent into z (z -4..4, x -0.6..0.6), y unchanged; an up-z model's z extent becomes its height", (() => (nearV(ob.min, [-0.6, -0.6, -4]) && nearV(ob.max, [0.6, 1.4, 4]) && (() => { const z = C.orientedBounds({ min: [-4, -0.6, -1], max: [4, 0.6, 1] }, C.orientationOf({ up: "z" })); return nearV(z.min, [-4, -1, -0.6]) && nearV(z.max, [4, 1, 0.6]); })()))());
    ok("!! orientedBounds refuses bounds that are missing, not three numbers, not finite, or with max under min", [null, {}, { min: [0, 0], max: [1, 1, 1] }, { min: [0, 0, NaN], max: [1, 1, 1] }, { min: [0, 0, 0], max: [1, Infinity, 1] }, { min: [0, 0, 0], max: [1, -1, 1] }, { min: "a", max: "b" }].every((b) => throws(() => C.orientedBounds(b, I))));
    const f = C.fitScale(sub, I);
    ok("!! fitScale makes the LONG HORIZONTAL axis 16 (a model 8 long and 2 tall with its sail scales by 2, not by 8 over the height): scale 2, axis x, length 8, no warnings", f.scale === 2 && f.axis === "x" && f.length === 8 && f.warnings.length === 0 && C.fitScale(sub, I, 32).scale === 4);
    const across = C.fitScale(sub, C.orientationOf({ yaw: 90 }));
    ok("!! a model whose long side lies across the nose axis after the facing you set fits on that long side (scale 2), says axis z and WARNS to turn it 90 or 270 degrees", across.scale === 2 && across.axis === "z" && across.warnings.length === 1 && /90 or 270/.test(across.warnings[0]));
    const tall = C.fitScale({ min: [-1, 0, -1], max: [1, 6, 1] }, I);
    ok("!! a model taller than it is long warns that the up axis may be wrong (and still fits its long horizontal side)", tall.warnings.some((w) => /taller than it is long/.test(w)) && tall.scale === 8);
    const zup = { min: [-4, -1, -0.6], max: [4, 1, 0.6] };   // a Z-up export: y is the width, z the height... here y runs -1..1 (the width) and z -0.6..0.6 is read as the height
    ok("!! the same Z-up export with up 'z' declared: no warning, nose along x; declared wrongly as 'y' the numbers differ (the extents swap) and the fit changes", (() => (C.fitScale({ min: [-4, -0.6, -1], max: [4, 0.6, 1] }, C.orientationOf({ up: "z" })).warnings.length === 0 && C.fitScale(zup, I).axis === "x"))());
    ok("!! fitScale refuses bounds with no horizontal extent (a flat line along y), a zero or negative or non-number target length", throws(() => C.fitScale({ min: [0, 0, 0], max: [0, 5, 0] }, I)) && [0, -1, NaN, "16", null].every((t) => throws(() => C.fitScale(sub, I, t))));
    const off = { min: [10, -1, 3], max: [18, 3, 5] }, cen = C.centering(off, I, 2), ob2 = C.orientedBounds(off, I);
    ok("!! centering gives the offset that puts the scaled bounds' middle on the origin: bounds x 10..18, y -1..3, z 3..5 at scale 2 -> [-28, -2, -8]; adding it to the scaled corners gives symmetric bounds", nearV(cen, [-28, -2, -8]) && nearV([0, 1, 2].map((i) => ob2.min[i] * 2 + cen[i]), [-8, -4, -2]) && nearV([0, 1, 2].map((i) => ob2.max[i] * 2 + cen[i]), [8, 4, 2]));
    ok("!! centering refuses a scale that is zero, negative, NaN or not a number", [0, -1, NaN, "2", undefined].every((s) => throws(() => C.centering(off, I, s))));
}

sec("5. THE CUES");
{
    const I = C.orientationOf(), R = 16 * 0.28, same = C.cuePlacement({ min: [-8, -R, -R], max: [8, R, R] }, I, 1);
    ok("!! for bounds exactly the procedural hull's (16 long, +-R = +-4.48 tall) the cues sit where render/subBallastCues.attachCues puts them: x -1.6, frame 1.55 R, fill 1.03 R, slab -1.05 R", near(same.x, -1.6) && near(same.frameY, 1.55 * R) && near(same.fillY, 1.03 * R) && near(same.slabY, -1.05 * R) && near(same.top, R) && near(same.bottom, -R));
    const taller = C.cuePlacement({ min: [-8, -R, -R], max: [8, R + 3, R] }, I, 1);
    ok("!! a model with a sail 3 units above the hull's top: centred, its top is R + 1.5 and its keel -R - 1.5... so the frame and the fill move up by 1.5 and the slab down by 1.5 (the whole model is centred on its bounds)", near(taller.top, R + 1.5) && near(taller.bottom, -(R + 1.5)) && near(taller.frameY, 1.55 * R + 1.5) && near(taller.fillY, 1.03 * R + 1.5) && near(taller.slabY, -1.05 * R - 1.5));
    const half = C.cuePlacement({ min: [-4, -R / 2, -R / 2], max: [4, R / 2, R / 2] }, I, 2);
    ok("!! the scale is applied: bounds half the size at scale 2 are the procedural hull again (the same numbers as the first row); a yaw does not change the vertical placement", near(half.frameY, same.frameY) && near(half.slabY, same.slabY) && near(C.cuePlacement({ min: [-8, -R, -R], max: [8, R, R] }, C.orientationOf({ yaw: 90 }), 1).frameY, same.frameY));
    ok("!! an up-z model is read through its orientation: a Z-up box 16 x 8.96 x 8.96 with up 'z' gives the same placement as the Y-up box; a bad scale throws", near(C.cuePlacement({ min: [-8, -R, -R], max: [8, R, R] }, C.orientationOf({ up: "z" }), 1).frameY, same.frameY) && [0, -2, NaN, "1"].every((s) => throws(() => C.cuePlacement({ min: [-8, -R, -R], max: [8, R, R] }, I, s))));
    ok("!! the length argument sets the radius the cues are measured against (L 32 doubles every number of the first row)", (() => { const big = C.cuePlacement({ min: [-16, -2 * R, -2 * R], max: [16, 2 * R, 2 * R] }, I, 1, 32); return near(big.x, -3.2) && near(big.frameY, 2 * same.frameY) && near(big.slabY, 2 * same.slabY); })());
}

sec("6. THE REST");
{
    ok("!! triangleBudget: 0 and 150000 are ok; 150001 and 500000 warn; 500001 is refused; a negative, NaN, fractional, string or missing count is refused", C.triangleBudget(0).level === "ok" && C.triangleBudget(150000).level === "ok" && C.triangleBudget(150001).level === "warn" && C.triangleBudget(500000).level === "warn" && C.triangleBudget(500001).level === "refuse" && [-1, NaN, 1.5, "100", undefined, Infinity].every((n) => C.triangleBudget(n).level === "refuse") && C.TRIANGLES.ok === 150000 && C.TRIANGLES.warn === 500000);
    ok("!! the reasons are in words and carry the count", /150000 triangles/.test(C.triangleBudget(150000).reason) && /heavy/.test(C.triangleBudget(200000).reason) && /500000/.test(C.triangleBudget(900000).reason));
    ok("!! attributionLine: 'name by author -- licence: L -- source'; with no source the last part is dropped; an unknown author and licence are printed as exactly that; no entry or no url gives ''", C.attributionLine(lic) === "Alpha by Someone -- licence: CC-BY-4.0 -- https://sketchfab.com/x" && C.attributionLine({ url: "/a.glb", name: "A", author: "B", licence: "CC0", sourceUrl: "" }) === "A by B -- licence: CC0" && C.attributionLine({ url: "/a.glb" }) === "model by unknown -- licence: unknown" && C.attributionLine(null) === "" && C.attributionLine({}) === "");
    ok("!! hueRgb is the procedural hull's HSL (s 0.7, l 0.55): hue 0 is [0.865, 0.235, 0.235]; 120 is green-dominant; 360 and -360 equal 0; 480 equals 120; -350 equals 10 and -90 equals 270; NaN reads as 0", nearV(C.hueRgb(0), [0.865, 0.235, 0.235], 1e-9) && C.hueRgb(120)[1] > C.hueRgb(120)[0] && C.hueRgb(120)[1] > C.hueRgb(120)[2] && nearV(C.hueRgb(360), C.hueRgb(0)) && nearV(C.hueRgb(-360), C.hueRgb(0)) && nearV(C.hueRgb(480), C.hueRgb(120)) && nearV(C.hueRgb(-350), C.hueRgb(10)) && nearV(C.hueRgb(-90), C.hueRgb(270)) && nearV(C.hueRgb(NaN), C.hueRgb(0)));
    const c0 = [0.2, 0.4, 0.6];
    ok("!! tintRgb: amount 0 returns the model's colour EXACTLY; 1 returns the hue; 0.5 is the midpoint; below 0 and above 1 are clamped; NaN reads as 0; the default is 0.3", J(C.tintRgb(c0, 0, 0)) === J(c0) && nearV(C.tintRgb(c0, 0, 1), C.hueRgb(0)) && nearV(C.tintRgb(c0, 0, 0.5), [0, 1, 2].map((i) => (c0[i] + C.hueRgb(0)[i]) / 2)) && nearV(C.tintRgb(c0, 0, -3), c0) && nearV(C.tintRgb(c0, 0, 9), C.hueRgb(0)) && nearV(C.tintRgb(c0, 0, NaN), c0) && nearV(C.tintRgb(c0, 0), C.tintRgb(c0, 0, 0.3)));
    const src = fs.readFileSync(fileURLToPath(new URL("./subModelsCore.mjs", import.meta.url)), "utf8"), code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! the module is pure: no Three.js, no DOM, no clock and no randomness in its code (comments aside), one import (the hull list), and it names the design note", !/\bTHREE\b/.test(code) && !/\b(document|window|navigator)\b/.test(code) && !/Math\.random|Date\.now|performance\.now/.test(code) && (code.match(/^import /gm) || []).length === 1 && /docs\/SUB-GLB-MODEL-SWAP\.md/.test(src));
    const st = (status, extra = {}) => ({ status, reason: "", warnings: [], triangles: 0, ...extra });
    ok("!! statusSummary: no states (empty, null, not an array) is 'no boats'; all procedural reads 'procedural hull'; counts read '2 models, 1 loading, 1 failed' with 'model' singular for one; junk entries are ignored", (() => (C.statusSummary([]).text === "no boats" && C.statusSummary(null).text === "no boats" && C.statusSummary("x").text === "no boats" && C.statusSummary([st("procedural"), st("procedural")]).text === "procedural hull" && C.statusSummary([st("model"), st("model"), st("loading"), st("failed"), st("procedural")]).text === "2 models, 1 loading, 1 failed" && C.statusSummary([st("model")]).text === "1 model" && C.statusSummary([null, "x", 5, st("model")]).text === "1 model" && C.statusSummary([null, "x"]).text === "no boats"))());
    ok("!! statusSummary lists each distinct warning once and the distinct reasons of FAILED boats only (a reason on a boat that is not failed is not listed), at most three", (() => (J(C.statusSummary([st("model", { warnings: ["a", "b"] }), st("model", { warnings: ["a"] })]).warnings) === J(["a", "b"]) && J(C.statusSummary([st("failed", { reason: "x" }), st("failed", { reason: "x" }), st("model", { reason: "not me" })]).failures) === J(["x"]) && C.statusSummary([1, 2, 3, 4, 5].map((i) => st("failed", { reason: "r" + i }))).failures.length === 3 && J(C.statusSummary([st("model", { warnings: "oops" })]).warnings) === J([]) && J(C.statusSummary([st("failed", { reason: "" })]).failures) === J([])))());
    ok("!! the up axes are y, z and -z, and the store key and the hull constants are the ones the design note names", J(C.UP_AXES) === J(["y", "z", "-z"]) && C.STORE_KEY === "swek.subModels.v1" && C.TRIANGLES.warn === 500000);
    ok("!! reportLines names the class count, the key and the fit length", /14 classes \(13 hulls \+ default\), key swek\.subModels\.v1; fit to 16 m/.test(C.reportLines()[0]) && C.HULL_LENGTH === 16 && C.HULL_RADIUS_FRACTION === 0.28);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
