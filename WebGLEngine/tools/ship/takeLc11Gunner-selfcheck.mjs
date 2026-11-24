// WebGLEngine/tools/ship/takeLc11Gunner-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeLc11Gunner-selfcheck.mjs      (under a minute; the study is flown here by a stand-in and two real pairs; section 4 reads the kept flights once they exist)
//
// THE GUNNER OVER THE FLY'S SMALL-OBJECT CELLS, HELD. tools/ship/takeLc11Gunner.mjs flies the page's held-trigger gunner over LC11 (both orientations, flat, shuffled) against the
// same gunner over LC10a and over a sine. Four things hold it:
//
//   1  THE CIRCUIT     brain/flyTracking.mjs's pathwayOf IS the shipped LC10a circuit to the bit when given LC10a (every wiring the page's controls use); over LC11 it reads the
//                      143 LC11 cells of each eye and DNp35; its sense turns the gun toward a target; what each LC11 read-out computes, as registered
//   2  WHAT WAS REGISTERED   the pairs (1641001-, 1651001-), disjoint from every other study of the fly-wired line; the jobs (today's best-ship helm, the shipped gunner files,
//                      only the wiring changes); two real pairs fly over LC11 and come out different from LC10a's
//   3  THE STUDY       against a stand-in: every arm once; the differences pair by pair; what is decided; the command's refusals
//   4  WHAT WAS FOUND  once flown: the kept reading and the page as decided
//
// READ 2026-11-21 (brain/lc11Gunner.reading.json; the kept arms in brain/rig-results/lc11Gunner/): LC11 DOES NOT BEAT LC10a: NOTHING SHIPS. One ship a side, where the circuit lays
//   the gun all the way, BOTH LC11 orientations TRAIL LC10a (medial -0.036, z -2.38; lateral -0.112, z -3.56); in fleets of three neither can be told from it (-0.005, +0.009).
//   On the record (judged on medial, the larger mean): LC11's PLACES ARE CREDITED (medial less flat +0.116, z 3.52 one ship a side; -0.013, z -1.85 in fleets), its WIRING IS NOT
//   (against the shuffle +0.041, z 1.93, a weak control as registered), and it cannot be told from the sine (-0.007, -0.005). The forecast said LC11 could not be told from
//   LC10a; one ship a side it is worse. The fly-wired gunner's note says so.
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as C from "../../render/spaceDuelCore.mjs";
import * as PT from "./pairsTaken.mjs";
import * as G from "./takeLc11Gunner.mjs";
import { createPool } from "./pairPool.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeLc11Gunner.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeLc11Gunner-selfcheck -- the gunner over the fly's small-object cells\n");

console.log("1. THE CIRCUIT");
await section(() => {
    const P = FT.LC10_PATHWAY, same = (c, name) => { for (let d = -180; d <= 180; d += 0.7) { const e = d * Math.PI / 180; if (c.raw(e) !== FT.wiringOf(name).raw(e)) return false; } return true; };
    ok("!! OVER LC10a THE GENERIC PATHWAY IS THE SHIPPED CIRCUIT TO THE BIT: fly:medial, fly:lateral, flat and shuffled:4242, at 515 bearings each", same(P.circuit(P.matrix(), { front: 1 }), "fly:medial") && same(P.circuit(P.matrix(), { front: -1 }), "fly:lateral") && same(P.circuit(P.matrix(), { flat: true }), "flat") && same(P.circuit(P.matrix(P.retarget(4242)), { front: 1 }), "shuffled:4242"));
    const L = FT.LC11_PATHWAY;
    ok("!! OVER LC11 it reads 68 LC11 cells in the left eye and 75 in the right, and DNp35 a side; the read-out as it comes (sense +1) turns the gun TOWARD a target at a quarter turn, as LC10a's does", L.eyeL.length === 68 && L.eyeR.length === 75 && L.dn === "DNp35" && FT.LC11_SENSE === 1 && L.sense === 1 && FT.wiringOf("lc11:medial").S(Math.PI / 2) < 0 && FT.wiringOf("fly:medial").S(Math.PI / 2) < 0);
    const t = (w) => FT.tuning(FT.wiringOf(w).S), m = t("lc11:medial"), l = t("lc11:lateral"), f = t("lc11:flat"), s = t("lc11:shuffled:4242");
    ok("!! WHAT EACH LC11 READ-OUT COMPUTES, as registered: medial peaks at 141.5 degrees, lateral at 38.5, flat at full value by 15 (a switch), shuffled at 146.5; every one turns the gun toward the target at every bearing (LC10a peaks at 80.5)", m.peakAt === 141.5 && l.peakAt === 38.5 && f.reach === 14 && s.peakAt === 146.5 && t("fly:medial").peakAt === 80.5 && ["lc11:medial", "lc11:lateral", "lc11:flat", "lc11:shuffled:4242"].every((w) => { for (let d = 1; d < 180; d += 1) if (!(FT.wiringOf(w).S(d * Math.PI / 180) < 0 && FT.wiringOf(w).S(-d * Math.PI / 180) > 0)) return false; return true; }), `${m.peakAt}, ${l.peakAt}, ${f.reach}, ${s.peakAt}`);
    let refused = false; try { FT.wiringOf("lc11:sideways"); } catch (e) { refused = /lc11:medial/.test(e.message); }
    ok("!! an LC11 wiring it does not know is refused by name; lc11 wirings fly as the held-trigger gunner (nearAlwaysOver)", refused && FT.nearAlwaysOver("lc11:medial").name.includes("over lc11:medial") && FT.nearAlwaysOver("lc11:medial").WEIGHT_COUNT === 5);
});

console.log("2. WHAT WAS REGISTERED");
await section(async () => {
    const all = G.FIGHTS.flatMap((f) => G.SETS[f]), mine = new Set(all.map((p) => p.seed)), others = Object.values(await PT.taken(["takeLc11Gunner.mjs"])).flat();
    ok("!! two fights, one ship a side and fleets of three, 300 pairs each (75 of each kind) on 1641001-1641075 and 1651001-1651075; none twice; none flown by another study of the line", G.FIGHTS.join() === "one,fleet3" && G.SHIPS.one === 1 && G.SHIPS.fleet3 === 3
        && G.FIGHTS.every((f, i) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75) && Math.min(...G.SETS[f].map((p) => p.seed)) === 1641001 + 10000 * i && Math.max(...G.SETS[f].map((p) => p.seed)) === 1641075 + 10000 * i)
        && new Set(all.map((p) => `${p.kind}:${p.seed}`)).size === 600 && others.length > 30000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    ok("!! six arms: lc10, both LC11 orientations, LC11 flat, LC11 shuffled (seed 4242), the sine", G.ARMS.join() === "lc10,lc11:medial,lc11:lateral,lc11:flat,lc11:shuffled:4242,sine");
    const b = G.brainsOf(), L = [G.SETS.one[0]], j = (f, a) => G.jobsOf(f, a, b, L)[0], strip = (x) => JSON.stringify({ ...x, x: { ...x.x, network: { ...x.x.network, wiring: undefined } } });
    ok("!! THE JOBS: the cannon on both sides; today's best-ship helm (the sine twin) on side X; the shipped held-trigger gunner -- no hand window one ship a side, 45 degrees in fleets; ONLY THE WIRING differs between arms, and lc10 carries none", G.FIGHTS.every((f) => G.ARMS.every((a) => strip(j(f, a)) === strip(j(f, "lc10")) && (a === "lc10" ? j(f, a).x.network.wiring === undefined : j(f, a).x.network.wiring === a)))
        && j("one", "lc10").x.cannon && j("one", "lc10").y.cannon && j("one", "lc10").x.helmNet.wiring === "sine~odd" && j("one", "lc10").x.network.policy === FT.POLICY_ID11 && j("one", "lc10").x.network.weights[4] === 0 && Math.abs(j("fleet3", "lc10").x.network.weights[4] - Math.PI / 4) < 1e-6 && j("fleet3", "lc10").opts.ships === 3);
    let threw = false; try { G.jobsOf("one", "lc11:upside", b, L); } catch { threw = true; }
    ok("!! an arm that is not registered is refused", threw);
    const pool = createPool({ workers: 2 }); let r;
    try { const p = D.KINDS.flatMap((kind) => [901, 902].map((seed) => ({ kind, seed }))); r = { lc10: await pool.leads(G.jobsOf("one", "lc10", b, p)), lc11: await pool.leads(G.jobsOf("one", "lc11:medial", b, p)), again: await pool.leads(G.jobsOf("one", "lc11:medial", b, p)) }; } finally { await pool.close(); }
    const moved = r.lc11.filter((v, i) => v !== r.lc10[i]).length;
    ok("!! REAL PAIRS FLY OVER LC11 (8 scratch pairs, seeds 901-902 of each kind, one ship a side): leads come back, the same twice, and some not LC10a's -- the wiring reached the seats (many fights fly the same: the gun is laid alike)", r.lc11.length === 8 && r.lc11.every(Number.isFinite) && r.lc11.join() === r.again.join() && moved >= 2, `${moved} of 8 differ`);
});

console.log("3. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { lc10: 1, "lc11:medial": 1.1, "lc11:lateral": 0.95, "lc11:flat": 1, "lc11:shuffled:4242": 0.5, sine: 1 }, calls = [];
    const r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[arm] * factor(i)); }, () => {});
    const mf = G.SETS.one.reduce((s, _, i) => s + factor(i), 0) / 300, close = (k, v) => G.FIGHTS.every((f) => Math.abs(r[f].reading[k].mean - v * mf) < 1e-9);
    ok("!! every arm once in each fight (12); the differences are pair by pair: medial less lc10 +0.1, lateral less lc10 -0.05, medial less flat +0.1, less shuffled +0.6", calls.length === 12 && new Set(calls).size === 12 && close("lc11:medial less lc10", 0.1) && close("lc11:lateral less lc10", -0.05) && close("lc11:medial less lc11:flat", 0.1) && close("lc11:medial less lc11:shuffled:4242", 0.6));
    ok("!! ...and what it decides from that: medial beats LC10a, the buttons go over lc11:medial; its places and wiring credited; told from the sine", r.verdict.beats && r.verdict.wiring === "lc11:medial" && r.verdict.judged === "lc11:medial" && r.verdict.placesCredited && r.verdict.wiringCredited && r.verdict.toldFromSine);
    const mk = (zm, zl, mm = 0, ml = 0, zf = 0) => { const o = {}; for (const f of G.FIGHTS) { const rd = {}; G.FIGHTS.forEach(() => {}); for (const ori of G.ORIENTATIONS) { rd[`${ori} less lc10`] = { z: ori === "lc11:medial" ? zm[f] : zl[f], mean: ori === "lc11:medial" ? mm : ml }; for (const c of G.CONTROLS) rd[`${ori} less ${c}`] = { z: c === "lc11:flat" ? zf : 0, mean: 0 }; } o[f] = { reading: rd }; } return G.decide(o); };
    const Z = (a, b) => ({ one: a, fleet3: b });
    ok("!! WHAT IS DECIDED: a lead in one fight and no trail beats LC10a (z exactly 2 leads, exactly -2 trails); a lead with a trail does not; nothing told ships nothing", mk(Z(2, 0), Z(0, 0)).beats && mk(Z(2, 0), Z(0, 0)).wiring === "lc11:medial" && !mk(Z(2, -2), Z(0, 0)).beats && !mk(Z(1.99, 1.99), Z(0, 0)).beats && mk(Z(0, 0), Z(0, 2.5)).wiring === "lc11:lateral" && !mk(Z(0, 0), Z(-2, 9)).beats);
    ok("!! if both orientations beat LC10a the larger mean lead is taken; if neither, the record is judged on the larger mean; a flat lead with a flat trail credits no places", mk(Z(3, 0), Z(0, 3), 0.1, 0.2).wiring === "lc11:lateral" && mk(Z(3, 0), Z(0, 3), 0.3, 0.2).wiring === "lc11:medial" && mk(Z(0, 0), Z(0, 0), -0.1, 0.05).judged === "lc11:lateral" && !mk(Z(0, 0), Z(0, 0)).placesCredited);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lc11gun-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("4. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const r = JSON.parse(fs.readFileSync(G.READING, "utf8")), near = (a, b) => Math.abs(a - b) < 5e-4, R = (f, k) => r[f].reading[k];
    ok("!! THE KEPT READING IS THE ONE PINNED: one ship a side both LC11 orientations TRAIL LC10a (medial -0.036, z -2.38; lateral -0.112, z -3.56); in fleets neither is told (-0.005, +0.009)", near(R("one", "lc11:medial less lc10").mean, -0.03611) && near(R("one", "lc11:medial less lc10").z, -2.3843) && near(R("one", "lc11:lateral less lc10").mean, -0.11158) && near(R("one", "lc11:lateral less lc10").z, -3.5614) && near(R("fleet3", "lc11:medial less lc10").mean, -0.00456) && near(R("fleet3", "lc11:lateral less lc10").mean, 0.00871) && Math.abs(R("fleet3", "lc11:medial less lc10").z) < 2 && Math.abs(R("fleet3", "lc11:lateral less lc10").z) < 2);
    ok("!! ...and what it decided is what the page does: nothing ships (both buttons still fly their gunner over LC10a, no wiring); on the record medial's places credited (+0.116, z 3.52), its wiring not, not told from the sine; the note says so", r.verdict.beats === false && r.verdict.wiring === null && r.verdict.judged === "lc11:medial" && r.verdict.placesCredited && !r.verdict.wiringCredited && !r.verdict.toldFromSine && near(R("one", "lc11:medial less lc11:flat").mean, 0.11555)
        && C.PRESETS.every((p) => !JSON.stringify(p.choice).includes("lc11")) && /takeLc11Gunner/.test(C.HANDS.find((h) => h.id === "flywired").note));
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeLc11Gunner.mjs held by its gate (it found these 5 unnamed at the ship):
{
    const EXPORTS = await import("./takeLc11Gunner.mjs");
    const NAMED = ["FILES", "GUN_OF", "KEPT_DIR", "SINE", "fightReadings"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: before any registered pair was flown, each mutant in a hard-linked copy of the tree. 12 of tools/ship/takeLc11Gunner.mjs: ALL 12 RED (a seed moved, fleets of two
// for three, the 45-degree window one ship a side, the sine arm's wiring dropped, the difference's sign, a trail at exactly -2 let by, a lead at exactly 2 missed, the smaller
// mean picked, no cannon on side X, today's helm dropped, an unknown option and a second read let through). 8 of brain/flyTracking.mjs's pathway: ALL 8 RED (the sense flipped,
// AVLP079 read for DNp35, the transmitter signs dropped, no constant drive, lateral flown as medial, flat given places, the shuffle ignored, two steps for three). No mutant
// flew into the real folders.
