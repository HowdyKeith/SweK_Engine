// WebGLEngine/tools/ship/takeSineHelmBest-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeSineHelmBest-selfcheck.mjs      (about a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE SINE TWIN AT THE BEST-SHIP BUTTON'S HELM, HELD. tools/ship/takeSineHelmBest.mjs flies takeFlyVsSine's four fights again on fresh pairs and decides the best-ship button's helm. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1501001-, 1511001-, 1521001-, 1531001-), disjoint from every other study of the fly-wired line (tools/ship/pairsTaken.mjs), takeFlyVsSine's included; the jobs are takeFlyVsSine's; the button as it is
//   2  THE STUDY             against a stand-in: eight arms, each once; the gain pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights, and the page as decided
//
// READ 2026-11-21 (brain/sineHelmBest.reading.json; the kept arms in brain/rig-results/sineHelmBest/): THE BUTTON KEEPS THE FLY'S HELM. The fly less the sine: one ship a side with the cannon -0.048 (z -3.30, TRAILS, as forecast and as takeFlyVsSine
//   read); fleets of three with it -0.048 (z -3.44, TRAILS -- the forecast said it could not be told); one ship a side WITHOUT it +0.057 (z 2.67, LEADS -- the forecast said it could not be told), and that lead keeps the fly; fleets without it
//   +0.004 (z 0.27, cannot be told). WITH THE CANNON THE SINE IS AHEAD AT BOTH SIZES, WITHOUT IT THE FLY IS AHEAD ONE SHIP A SIDE. The notes of both helms and of the button say so.
//
// SABOTAGE LOG: 13 mutants of tools/ship/takeSineHelmBest.mjs, each in a hard-linked copy of the tree, before any pair was flown: ALL 13 RED the first time (a seed moved, takeFlyVsSine's pairs, half the pairs of a fight, the jobs on
//   takeFlyVsSine's pairs, the fly on both arms; a trail at exactly -2 let by, a lead of the fly let by, the sine on a lead, the sine always, a trail elsewhere taken for a lead, the wrong helm named; an unknown option and a second read let
//   through). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as C from "../../render/spaceDuelCore.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as PT from "./pairsTaken.mjs";
import * as FV from "./takeFlyVsSine.mjs";
import * as G from "./takeSineHelmBest.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeSineHelmBest.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeSineHelmBest-selfcheck -- the sine twin at the best-ship button's helm, on fresh pairs\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const all = G.FIGHTS.flatMap((f) => G.SETS[f]), mine = new Set(all.map((p) => p.seed)), others = Object.values(await PT.taken(["takeSineHelmBest.mjs"])).flat();
    const n = { oneCannon: 1200, fleetCannon: 600, oneNone: 600, fleetNone: 600 }, first = { oneCannon: 1501001, fleetCannon: 1511001, oneNone: 1521001, fleetNone: 1531001 };
    ok("!! four fights: one ship a side with the cannon 1200 pairs (300 of each kind), the others 600 (150 of each); on 1501001-1501300, 1511001-, 1521001-, 1531001-1531150; none twice; none flown by another study of the line, takeFlyVsSine's included",
        G.FIGHTS.join() === "oneCannon,fleetCannon,oneNone,fleetNone" && G.FIGHTS.every((f) => G.SETS[f].length === n[f] && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === n[f] / 4) && Math.min(...G.SETS[f].map((p) => p.seed)) === first[f] && Math.max(...G.SETS[f].map((p) => p.seed)) === first[f] - 1 + n[f] / 4)
        && new Set(all.map((p) => `${p.kind}:${p.seed}`)).size === 3000 && others.length > 30000 && others.every((x) => !mine.has(x)) && FV.FIGHTS.flatMap((f) => FV.SETS[f]).every((p) => !mine.has(p.seed)), `${others.length} others`);
    const b = G.brainsOf(), L = (f) => [G.SETS[f][0]];
    ok("!! THE JOBS ARE takeFlyVsSine's on these pairs: the fly's helm and the sine's, the button's gunner by the fight", G.FIGHTS.every((f) => G.ARMS.every((a) => JSON.stringify(G.jobsOf(f, a, b, L(f))) === JSON.stringify(FV.jobsOf(f, a, b, L(f))))) && G.jobsOf("oneCannon", "sine", b)[0].x.helmNet.wiring === "sine~odd"
        && G.jobsOf("oneCannon", "fly", b)[0].seed === 1501001 && G.jobsOf("fleetNone", "fly", b).length === 600 && G.jobsOf("fleetNone", "fly", b)[0].opts.ships === 3 && !G.jobsOf("fleetNone", "fly", b)[0].x.cannon);
    const best = C.PRESETS.find((p) => p.id === "best");
    ok("!! THE BUTTON AS IT IS: the best ship carries the by-the-fight hand under a helm, the cannon on; the two helms are the page's", best.choice.hand === "bysize" && best.choice.cannon === true && ["flywired", "sine"].includes(best.choice.helm) && C.FILES["helm-flywired"].path.endsWith(path.basename(FV.FILES.fly)) && C.FILES["helm-sine"].path.endsWith(path.basename(FV.FILES.sine)));
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { oneCannon: [0.9, 1], fleetCannon: [1, 1], oneNone: [1.1, 1], fleetNone: [1, 1] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "fly" ? 0 : 1] * factor(i)); }, () => {});
    const mf = (f) => G.SETS[f].reduce((s, _, i) => s + factor(i), 0) / G.SETS[f].length, close = (f, v) => Math.abs(r[f].reading.gain.mean - v * mf(f)) < 1e-9;
    ok("!! eight arms, each once; the gain is THE FLY LESS THE SINE pair by pair (-0.1, +0.1); a lead of the fly anywhere keeps the fly's helm", calls.length === 8 && new Set(calls).size === 8 && close("oneCannon", -0.1) && close("oneNone", 0.1) && close("fleetCannon", 0) && r.oneCannon.reading.gain.n === 1200 && !r.verdict.sine && r.verdict.helm === "flywired");
    const d = (z) => G.decide(Object.fromEntries(G.FIGHTS.map((f) => [f, { reading: { gain: { z: z[f] ?? 0 } } }])));
    ok("!! WHAT IS DECIDED: the sine if the fly TRAILS one ship a side with the cannon (exactly -2 trails, -1.99 does not) and leads nowhere (exactly 2 leads); a trail elsewhere is no matter", d({ oneCannon: -2 }).sine && d({ oneCannon: -2 }).helm === "sine" && !d({ oneCannon: -1.99 }).sine && !d({ oneCannon: -5, fleetNone: 2 }).sine && d({ oneCannon: -5, fleetNone: 1.99, oneNone: -9 }).sine && !d({}).sine && d({}).helm === "flywired");
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sinebest-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, a) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${a}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4;
    const out = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings({ fly: k(f, "fly"), sine: k(f, "sine") })])), R = (f) => out[f].reading.gain;
    ok("!! RE-DERIVED FROM THE KEPT ARMS: the fly less the sine -0.048 and -0.048 with the cannon (both TRAIL), +0.057 one ship a side without it (LEADS), +0.004 in fleets without it (CANNOT BE TOLD)", near(R("oneCannon"), -0.0479) && TA.word(R("oneCannon").z) === "TRAILS" && near(R("fleetCannon"), -0.0480) && TA.word(R("fleetCannon").z) === "TRAILS"
        && near(R("oneNone"), 0.0572) && TA.word(R("oneNone").z) === "LEADS" && near(R("fleetNone"), 0.0041) && TA.word(R("fleetNone").z) === "CANNOT BE TOLD" && G.FIGHTS.every((f) => Math.abs(R(f).mean - rd[f].reading.gain.mean) < 1e-12) && R("oneCannon").n === 1200 && R("fleetNone").n === 600);
    const v = G.decide(out), best = C.PRESETS.find((p) => p.id === "best"), fly = C.HELMS.find((h) => h.id === "flywired"), sine = C.HELMS.find((h) => h.id === "sine");
    ok("!! WHAT IS DECIDED, as read: the fly leads one ship a side without the cannon, so the best-ship button keeps the fly's helm; its note and both helms' say so", !v.sine && v.helm === "flywired" && rd.verdict.helm === "flywired" && best.choice.helm === "flywired"
        && [best, fly, sine].every((x) => /takeSineHelmBest/.test(x.note)) && /\+0\.057/.test(best.note));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
