// WebGLEngine/tools/ship/flyTallyCorrect-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyTallyCorrect-selfcheck.mjs      (under a minute; IT NEVER RUNS THE ROUND -- its flies are flown on 2 lives of its own, and it starts no process)
//
// THE GATE OF THE CORRECTED-TALLY ROUND (registered in brain/FLY_TALLY_CORRECT_WIP.md before brain/rl/correctingTally.mjs, tools/ship/flyTallyCorrect.mjs and
// tools/ship/takeFlyTallyCorrect.mjs existed): can the fly's tally learn from its compass's corrections?
//
//   1  THE ROUND'S NUMBERS      the flies, DEV and HELD (disjoint from each other and from every earlier set), the grid, alpha; the scene-tally file by its hash; the registration says the same
//   2  THE TALLY                at g 0 it is HomingFly to the bit; the correction is the belief's move less the fly's turn; it turns the memory and the home vector; the steering is untouched
//   3  THE RECORDS              DEV, its choice, HELD, g 0 and a second flight, made here; the choice rule; C26, CP; the broken sets
//   4  THE COMMAND              it is this round's; DEV once, HELD only at a committed choice; no flight of the round's, no process
// SABOTAGE LOG (2026-11-28) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate alone; the number is the rows red:
//   G1 the correction without the fly's turn taken out 2 | G2 the home vector not turned 2 | G3 no memory (each step alone) 1 | G4 the g-0 shortcut removed 0 -- an EQUIVALENT MUTANT:
//   at g 0 the turn is the identity, so the shortcut changes no number | G5 the home vector shown a tick early 2 | G6 DEV the HELD lives 1 | G7 a tie to the higher setting 1 |
//   G8 the corrected plain flown in the 26-type scene 0 -- A FINDING: no row flew heldOne's five numbers; one now does, on the gate's 2 lives, and G8b 1 | G9 the plain scene at sigma 0.4 1 |
//   G10 HELD at any setting 1 | G11 g 0 not compared 1 | G12 C26 against today's plain 1 | G13 the gap from 0 1 | G14 DEV flown twice 0 and G15 HELD without a ready DEV file 0 --
//   A FINDING: the command row matched the error messages and not the conditions before them; it matches both now, and G14b 1, G15b 1 | M1 an expectation moved 1.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as E from "./flyTallyCorrect.mjs";
import * as TS from "./flySceneTally.mjs";
import * as S from "./flySceneTypes.mjs";
import * as N from "./flyHomeCompassNoise.mjs";
import * as T from "./flyTrainedHome.mjs";
import * as FS from "./flyTallyShare.mjs";
import { CorrectingTally } from "../../brain/rl/correctingTally.mjs";
import { HomingFly } from "../../brain/rl/homingFly.mjs";
import { CLOCK, GOAL } from "../../brain/rl/compassEnv.mjs";
import { HOME_AT } from "../../brain/rl/homeEnv.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TWO = [880411, 880412];
const F = Object.fromEntries(Object.entries(E.FILES).map(([k, f]) => [k, E.fileOf(fs.readFileSync(path.join(ENG, f)))]));

console.log("flyTallyCorrect-selfcheck -- the corrected-tally round (a tally that re-lays its recent steps by the compass's corrections): the numbers, the tally, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    ok("!! the compass-noise round's 48 flies, alpha 0.01, this round's own DEV and HELD files", E.SEEDS === TS.SEEDS && J(E.ARMS) === J(["HOMEP", "COURSE64", "HOME16", "H16BYC"]) && E.ALPHA === 0.01 &&
        E.DEV_RESULTS === "brain/flyTallyCorrectDev.jsonl" && E.RESULTS === "brain/flyTallyCorrectRound.jsonl" && !Object.values(E.FILES).includes(E.RESULTS) && !Object.values(E.FILES).includes(E.DEV_RESULTS));
    const scoping = Array.from({ length: 30 }, (_, k) => 90000001 + 7919 * k), earlier = new Set([...TS.AUDIT, ...FS.FRESH, ...scoping]);
    ok("!! DEV is 50 lives at 100000001 and HELD 200 at 110000001 (step 7919), disjoint from each other and from the old audit, the tally-share round's fresh lives and the scoping lives",
        E.DEV.length === 50 && E.DEV[0] === 100000001 && E.HELD.length === 200 && E.HELD[0] === 110000001 && E.HELD[199] === 110000001 + 7919 * 199 && new Set([...E.DEV, ...E.HELD]).size === 250 &&
        ![...E.DEV, ...E.HELD].some((x) => earlier.has(x)));
    ok("!! the grid: g in 0.5, 1, 1.5, 2 and tau in 100, 175, 250, 350, 500 -- 20 settings, g then tau upward (so the first of a tie is the lower g, then the lower tau)",
        E.GRID.length === 20 && J(E.GRID[0]) === J({ g: 0.5, tau: 100 }) && J(E.GRID[4]) === J({ g: 0.5, tau: 500 }) && J(E.GRID[5]) === J({ g: 1, tau: 100 }) && J(E.GRID[19]) === J({ g: 2, tau: 500 }));
    ok("!! THE SCENE-TALLY ROUND'S FILE BY ITS HASH, passing its own checks", E.SCENE_TALLY_SHA256 === "95ee36184538cbd69b74eb4dfbbb60347a5d984f31256211cec0cbb93f40909a" && sha(TS.RESULTS) === E.SCENE_TALLY_SHA256 &&
        F.sceneTally.sha256 === E.SCENE_TALLY_SHA256 && TS.checkRecords(F.sceneTally.lines, F).length === 0);
    const note = src("brain/FLY_TALLY_CORRECT_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: DEV and HELD, the 20 settings, one setting for all 48 chosen on DEV, C26 and CP, the expectations",
        /\*\*DEV: 50 lives, seeds 100000001 \+ 7919 k\.\*\* \*\*HELD: 200 lives, seeds 110000001 \+ 7919 k\.\*\*/.test(note) && /g in \{0\.5, 1, 1\.5, 2\} and tau in \{100, 175, 250, 350, 500\}: 20 settings/.test(note) &&
        /\*\*the highest is the setting\*\* \(a tie to the lower g, then the lower tau\)/.test(note) && /\*\*C26: does the corrected tally find home better in the 26-type scene\?\*\*/.test(note) &&
        /\*\*CP: and in the plain scene, at the same setting\?\*\*/.test(note) && /C26: \*\*BETTER about 80\*\*, CANNOT 15, WORSE 5\. CP: BETTER about 65, CANNOT 30, WORSE 5\./.test(note));
});

console.log("\n2. THE TALLY (on 2 lives of the gate's own)");
section(() => {
    const c = N.committedOf("HOMEP", 3, F), inner = () => T.flyOf("HOMEP", 3, c.weights);
    const zt = E.homeOf(() => new CorrectingTally(inner(), 0, 250), TWO, "type"), zp = E.homeOf(() => new CorrectingTally(inner(), 0, 250), TWO, "plain");
    ok("!! AT g 0 IT IS TODAY'S TALLY TO THE BIT, in both scenes: homeIn's and homeScore's, the rounds' own scorers", zt === S.homeIn(inner(), TWO, "type") && zp === N.homeScore(inner(), TWO, 0) && zt === E.homeOf(() => new HomingFly(inner()), TWO, "type"));
    const ct = E.homeOf(() => new CorrectingTally(inner(), 1, 250), TWO, "type");
    ok("!! and at g 1 it is another tally: another home", ct !== zt && ct >= 0 && ct <= 1, `${zt} -> ${ct}`);
    // a fly with a scripted belief: phi moves by its turn u plus a visual pull v each tick; the tally must see d = v
    const script = { phi: 0, t: 0, act(o) { const u = 0.01, v = this.t === 5 ? 0.3 : 0; this.phi = this.phi + v + u; this.t++; return [u]; } };
    const tl = new CorrectingTally(script, 1, 1e9), ob = (t) => { const o = new Float64Array(CLOCK + 1); o[CLOCK] = t; o[GOAL] = 0; return o; };
    let hx = 0, hy = 0, phi = 0; for (let t = 0; t < 10; t++) { tl.act(ob(t)); }
    for (let t = 0; t < 10; t++) { phi += (t === 5 ? 0.3 : 0) + 0.01; hx += Math.cos(phi); hy += Math.sin(phi); }   // with g 1 and an unbounded memory every step is re-laid on the final belief
    ok("!! THE CORRECTION IS THE BELIEF'S MOVE LESS THE FLY'S OWN TURN, and with g 1 and an unbounded memory every earlier step is turned by it -- the home vector the steps would have made on the corrected belief",
        Math.abs(tl.hx - (() => { let x = 0, p = 0; for (let t = 0; t < 10; t++) { p += 0.01; x += Math.cos(p + 0.3); } return x; })()) < 1e-6 &&
        Math.abs(tl.hy - (() => { let y = 0, p = 0; for (let t = 0; t < 10; t++) { p += 0.01; y += Math.sin(p + 0.3); } return y; })()) < 1e-6 && Math.abs(Math.atan2(tl.hy, tl.hx) - Math.atan2(hy, hx)) > 0.05,
        `home vector (${tl.hx.toFixed(6)}, ${tl.hy.toFixed(6)}); uncorrected bearing ${Math.atan2(hy, hx).toFixed(4)}`);
    // a fly that only turns and never corrects: the corrected tally must show it exactly what HomingFly shows it, before HOME_AT and after
    const spyOf = (log) => ({ phi: 0, act(o) { log.push(o[GOAL]); const u = 0.02; this.phi += u; return [u]; } });
    const a = [], b = [], ca = new CorrectingTally(spyOf(a), 1, 250), hb = new HomingFly(spyOf(b));
    for (let t = HOME_AT - 3; t < HOME_AT + 3; t++) { const o = new Float64Array(CLOCK + 1); o[CLOCK] = t; o[GOAL] = 0.7; ca.act(o); hb.act(Float64Array.from(o)); }
    ok("!! the steering is untouched: before HOME_AT the fly sees the life's goal, from HOME_AT the home vector's bearing -- exactly what HomingFly shows it when the compass never corrects",
        J(a) === J(b) && a.slice(0, 3).every((g) => g === 0.7) && a.slice(3).every((g) => g !== 0.7), J(a.map((x) => +x.toFixed(4))));
    // G8 went 0 red on the first draft: no row flew heldOne's five numbers, so the corrected tally could be flown in the wrong scene unseen. Flown here on the gate's 2 lives.
    const h = E.heldOne("COURSE64", 5, F, { g: 1, tau: 250 }, TWO), c5 = N.committedOf("COURSE64", 5, F), in5 = () => T.flyOf("HOMEP", 5, c5.weights);
    ok("!! A HELD RECORD'S FIVE NUMBERS ARE EACH ITS OWN FLIGHT: today's 26-type is homeIn, the corrected 26-type the corrected tally THERE, today's plain homeScore at sigma 0, the corrected plain the corrected tally IN THE PLAIN SCENE, the perfect 26-type trueIn",
        h.weightsHash === c5.weightsHash && h.ownType === S.homeIn(in5(), TWO, "type") && h.corrType === E.homeOf(() => new CorrectingTally(in5(), 1, 250), TWO, "type") && h.ownPlain === N.homeScore(in5(), TWO, 0) &&
        h.corrPlain === E.homeOf(() => new CorrectingTally(in5(), 1, 250), TWO, "plain") && h.trueType === TS.trueIn(in5(), TWO, "type") && h.corrPlain !== h.corrType, J(h));
    let threw = 0; for (const [g, tau] of [[-1, 10], [1, 0], [NaN, 1]]) { try { new CorrectingTally(spy, g, tau); } catch { threw++; } }
    ok("a negative g, a tau of 0 and a g not a number are refused", threw === 3);
});

console.log("\n3. THE RECORDS (made here)");
section(() => {
    const wh = (a, s) => F.types.lines.find((r) => r.kind === "fly" && r.arm === a && r.s === s).weightsHash;
    const devOf = (bump) => E.ARMS.flatMap((a) => E.SEEDS.map((s) => ({ kind: "dev", arm: a, s, weightsHash: wh(a, s), means: E.GRID.map((_, i) => 0.6 + (i === bump ? 0.01 : 0)) })));
    const withChoice = (dv) => { const ch = E.choose(dv); return [...dv, { kind: "choice", g: ch.g, tau: ch.tau, means: ch.means }]; };
    const dev = withChoice(devOf(7));
    ok("!! the choice is the highest of the 20 means over the 48 flies: setting 7 lifted is g 1, tau 250", E.choose(dev).g === 1 && E.choose(dev).tau === 250 && E.checkDev(dev, F).length === 0, E.checkDev(dev, F).join("; "));
    ok("!! a tie goes to the lower g, then the lower tau: all 20 equal is g 0.5, tau 100", J([E.choose(devOf(-1)).g, E.choose(devOf(-1)).tau]) === J([0.5, 100]));
    const held = (d26, dP) => { const fl = E.ARMS.flatMap((a) => E.SEEDS.map((s) => ({ kind: "fly", arm: a, s, weightsHash: wh(a, s), ownType: 0.59, corrType: 0.59 + d26(a, s), ownPlain: 0.55, corrPlain: 0.55 + dP(a, s), trueType: 0.96 })));
        const f1 = fl[0]; return [{ kind: "held", g: 1, tau: 250 }, { kind: "zero", arm: "HOMEP", s: 1, zeroType: 0.5, ownType: 0.5, zeroPlain: 0.4, ownPlain: 0.4 }, ...fl,
            { kind: "recheck", arm: "HOMEP", s: 1, ownType: f1.ownType, corrType: f1.corrType, ownPlain: f1.ownPlain, corrPlain: f1.corrPlain, trueType: f1.trueType }]; };
    const good = held(() => 0.02, () => 0.01);
    ok("!! the made records pass the checks: DEV and its choice, HELD at that choice, g 0 today's to the bit, 48 flies once each, HOMEP draw 1 the same twice", E.checkRecords(good, dev, F).length === 0, E.checkRecords(good, dev, F).join("; "));
    const R = E.reading(good, dev, F);
    ok("!! C26 is corrected less today's in the 26-type scene, CP in the plain: both 48 above, BETTER; the share of the gap closed is 0.02 over 0.37", R.C26.word === E.WORDS.C26[0] && R.C26.above === 48 && R.CP.word === E.WORDS.CP[0] &&
        Math.abs(R.closed - 0.02 / 0.37) < 1e-12 && R.at.g === 1 && R.at.tau === 250);
    const W = E.reading(held(() => -0.02, () => 0), dev, F);
    ok("!! and not the other way: corrected below is C26 WORSE, the same is CP CANNOT", W.C26.word === E.WORDS.C26[1] && W.C26.below === 48 && W.CP.word === E.WORDS.CP[2]);
    const LL = E.readingLines(R), LB = E.readingLines(E.reading(good.slice(0, -1), dev, F));
    ok("readingLines prints the checks, the setting, the means and both words, and on a failed check only the failure", /^the checks hold/.test(LL[0]) && LL.some((l) => /g 1, tau 250/.test(l)) && LL.some((l) => l.trim() === E.WORDS.C26[0]) &&
        LB[0] === "A CHECK FAILED, AND THE READING IS NOT WEIGHED:" && LB.length === 2);
    const bad = (f, d = dev) => { const v = JSON.parse(J(good)); f(v); return E.checkRecords(v, d, F); }, at = (v, a, s) => v.find((r) => r.kind === "fly" && r.arm === a && r.s === s);
    const devBad = (f) => { const v = JSON.parse(J(dev)); f(v); return E.checkRecords(good, v, F); };
    const cases = [["a fly missing", () => bad((v) => v.splice(v.indexOf(at(v, "HOME16", 4)), 1)), /HOME16 draw 4 is there 0 times/],
        ["another fly's weights", () => bad((v) => { at(v, "H16BYC", 7).weightsHash = at(v, "HOMEP", 7).weightsHash; }), /H16BYC draw 7 is not its arm's committed weights/],
        ["a score past 1", () => bad((v) => { at(v, "HOMEP", 9).corrType = 1.01; }), /HOMEP draw 9 does not hold/], ["no perfect tally", () => bad((v) => { delete at(v, "HOMEP", 10).trueType; }), /HOMEP draw 10 does not hold/],
        ["HELD at another setting", () => bad((v) => { v[0].tau = 175; }), /HELD was not flown at the DEV file's choice/], ["no setting line", () => bad((v) => v.shift()), /HELD was not flown at the DEV file's choice/],
        ["g 0 not today's", () => bad((v) => { v[1].zeroType += 1e-12; }), /at g 0 the corrected tally is not today's/], ["no g 0 check", () => bad((v) => v.splice(1, 1)), /at g 0/],
        ["no second flight", () => bad((v) => v.pop()), /flown a second time/], ["a second flight that differs", () => bad((v) => { v[v.length - 1].corrPlain += 1e-9; }), /flown a second time/],
        ["a DEV fly missing", () => devBad((v) => v.splice(3, 1)), /the DEV file: DEV: HOMEP draw 4 is there 0 times/], ["a DEV fly with 19 settings", () => devBad((v) => { v[5].means.pop(); }), /does not hold a home for each of the 20 settings/],
        ["DEV's choice not the highest", () => devBad((v) => { v[v.length - 1].tau = 350; }), /the written choice \(g 1, tau 350\) is not the highest/], ["no DEV choice", () => devBad((v) => v.pop()), /the choice is there 0 times/],
        ["a DEV fly's weights", () => devBad((v) => { v[2].weightsHash = v[14].weightsHash; }), /is not its arm's committed weights/]];
    const f2 = cases.filter(([, f, re]) => !f().some((m) => re.test(m))).map(([n]) => n);
    ok(`!! each of ${cases.length} broken record sets is refused by name`, f2.length === 0, f2.join(", "));
    const G1 = { ...F, sceneTally: { sha256: "0".repeat(64), lines: F.sceneTally.lines } };
    ok("!! and the scene-tally round's file is weighed first: another refused by its hash, every reading null", /scene-tally round's file is not the one committed/.test(E.checkRecords(good, dev, G1)[0]) && E.reading(good, dev, G1).C26 === null);
});

console.log("\n4. THE COMMAND");
section(() => {
    const st = (f) => { const p = path.join(ENG, f); return fs.existsSync(p) ? `${fs.statSync(p).size}/${fs.statSync(p).mtimeMs}` : "absent"; }, before = [st(E.RESULTS), st(E.DEV_RESULTS)].join(" ");
    ok("!! the command's words, as arithmetic: dev, run (each with --jobs N), read, job ARM S, devjob ARM S, zerojob -- and others are not words",
        J(E.parseArgs(["dev"])) === J({ cmd: "dev", jobs: 4 }) && J(E.parseArgs(["run", "--jobs", "2"])) === J({ cmd: "run", jobs: 2 }) && J(E.parseArgs(["devjob", "HOME16", "3"])) === J({ cmd: "devjob", arm: "HOME16", s: 3 }) &&
        J(E.parseArgs(["zerojob"])) === J({ cmd: "zerojob" }) && J(E.parseArgs(["job", "H16BYC", "12"])) === J({ cmd: "job", arm: "H16BYC", s: 12 }) &&
        [[], ["bogus"], ["devjob", "HOMET", "1"], ["zerojob", "x"], ["dev", "--jobs", "0"], ["read", "x"]].every((a) => E.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyTallyCorrect.mjs");
    ok("!! the command is this round's: DEV is flown once (refused when its choice is there) and prints only the choice; HELD only when the DEV file passes its checks, at its choice, with the setting line, g 0 and a second flight of all five numbers",
        /from "\.\/flyTallyCorrect\.mjs"/.test(csrc) && /if \(have\.some\(\(r\) => r\.kind === "choice"\)\) \{ console\.error\(`\$\{PF\.DEV_RESULTS\} already holds its choice: DEV is flown once`\)/.test(csrc) && /db = PF\.checkDev\(dev, committedFiles\(\)\);/.test(csrc) && /if \(db\.length\) \{ console\.error\(`the DEV file is not ready/.test(csrc) &&
        /\{ kind: "held", g: at\.g, tau: at\.tau \}/.test(csrc) && /\[\["zerojob"\], null\]/.test(csrc) && /kind: "recheck", arm: rec\.arm, s: rec\.s, ownType: rec\.ownType, corrType: rec\.corrType, ownPlain: rec\.ownPlain, corrPlain: rec\.corrPlain, trueType: rec\.trueType/.test(csrc) &&
        /\{ kind: "choice", g: ch\.g, tau: ch\.tau, means: ch\.means \}/.test(csrc) && /no score is printed/.test(csrc));
    const me = src("tools/ship/flyTallyCorrect-selfcheck.mjs");
    ok("!! THIS GATE FLIES NOTHING OF THE ROUND'S AND LEAVES ITS FILES AS THEY WERE: no devOne or zeroOne call, one heldOne on its own 2 lives (none of DEV or HELD), no process",
        !/E\.(devOne|zeroOne)\(/.test(me) && [...me.matchAll(/E\.heldOne\(([^)]*)\)/g)].every((m) => /, TWO$/.test(m[1])) && !TWO.some((x) => E.DEV.includes(x) || E.HELD.includes(x)) && !/import[^;]*child_process/.test(me) && [st(E.RESULTS), st(E.DEV_RESULTS)].join(" ") === before);
});

console.log(`\nflyTallyCorrect-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
