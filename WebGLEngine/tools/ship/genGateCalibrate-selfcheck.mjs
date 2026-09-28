#!/usr/bin/env node
// WebGLEngine/tools/ship/genGateCalibrate-selfcheck.mjs -- v4693
//
// *** THE SECOND PRE-REGISTERED TEST: IS THE CONSERVATISM A THRESHOLD OR THE FEATURES? ***
//
// render/learned-calibration-preregistration.md fixed the split, the threshold RULE, six controls and four
// failure conditions before any of this ran. v4691 refuted H1 and left a specific shape: the oracle keeps
// 437.6 of 576 blocks where the network keeps 122.2. This round retrains on `smooth` alone, chooses the
// operating point on `zone` by the parameter-free rule, and looks at the held-out `checker` ONCE.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin } from "./webgpuHarness.mjs";
import { pairedBoth } from "./pairedStats.mjs";
import { rateMatch, auc, N_FEATURES as NF } from "../../render/genGate.mjs";
import { flatten, calibrate, writeV2 } from "./genGateCalibrate.mjs";
import { TRAIN_ONLY, VALIDATE_ON, HELD_OUT, WEIGHTS_V2 } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const pStr = (x) => (x.p === null ? `n/a (${x.why || "constant sample"})` : x.p.toExponential(3));

const PREREG = "render/learned-calibration-preregistration.md";
const TXT = fs.readFileSync(path.join(ENG, PREREG), "utf8");
const WINDOW = (() => {
    const m = /\*\*Population:\*\* frames (\d+)-(\d+) of the (\w+) scene at `slabspeed` x(\d+)/.exec(TXT);
    if (!m) throw new Error(`genGateCalibrate: ${PREREG} does not declare a population in the expected form`);
    return { from: Number(m[1]), to: Number(m[2]), scene: m[3], speed: m[4] };
})();
const FROM = WINDOW.from, TO = WINDOW.to, UPTO = TO + 1;
// *** THE RULE ITSELF IS READ OUT OF THE PRE-REGISTRATION TOO, FOR THE REASON THE WINDOW IS. ***
// The first draft checked the weights file's own `tauRule` string -- which is written by the tool that
// chose the threshold, so it agrees with itself by construction and swapping the pre-registration's primary
// rule for its declared SECONDARY changed nothing. Measured: 0 RED. The record is section 4 of the
// pre-registration; a round that wanted a different rule would have to edit that, which is the act the
// document exists to make visible.
const RULE = (() => {
    const m = /\*\*Primary rule: ([A-Z ]+)\.\*\*/.exec(TXT);
    if (!m) throw new Error(`genGateCalibrate: ${PREREG} does not declare a primary threshold rule`);
    return m[1].trim();
})();
const ARMS = ["off", "cpu2", "oracle", "never"];

console.log("genGateCalibrate-selfcheck -- the operating point, chosen without the held-out scene\n");

console.log("1. *** CONTROL C5 -- THE THRESHOLD CANNOT SEE THE HELD-OUT SCENE, STRUCTURALLY ***");
const W = JSON.parse(fs.readFileSync(path.join(ENG, WEIGHTS_V2), "utf8"));
{
    const sig = rateMatch.toString().slice(rateMatch.toString().indexOf("(") + 1, rateMatch.toString().indexOf(")"));
    ok("*** rateMatch takes SCORES AND A RATE, so there is no argument a checker row could arrive through ***",
       sig.replace(/\s/g, "") === "scores,targetRate",
       `its parameter list is (${sig}). C5 is a property of the call signature, not a promise in a comment -- ` +
       "the same construction that keeps features() away from ground truth.");
    ok("...and the weights name their three slices, with the held-out one absent from both fitted slices",
       JSON.stringify(W.trainedOn) === JSON.stringify([...TRAIN_ONLY]) && W.validatedOn === VALIDATE_ON &&
       W.heldOut === HELD_OUT && !W.trainedOn.includes(HELD_OUT) && W.validatedOn !== HELD_OUT,
       `trainedOn ${JSON.stringify(W.trainedOn)}, validatedOn ${JSON.stringify(W.validatedOn)}, heldOut ${JSON.stringify(W.heldOut)}`);
    ok("*** ...and the threshold came from the rule the PRE-REGISTRATION declares, not from one this file restates ***",
       RULE === "RATE MATCHING" && W.tauRule === "rateMatch to the validation base rate",
       `${PREREG} section 4 declares "${RULE}" and the weights record ${JSON.stringify(W.tauRule)}. Both are ` +
       "checked because only the first is a record: the second is written by the tool that chose the " +
       "threshold and agrees with itself by construction. " +
       `tau ${W.tau.toFixed(4)}. An accuracy search is a declared secondary that may never be promoted.`);
}

console.log("\n2. *** CONTROL C6 -- THE TAU MACHINERY CAN HIT A RATE IT IS HANDED ***");
{
    const s = Float32Array.from({ length: 1000 }, (_, i) => i / 1000);
    const hits = [0, 0.1, 0.25, 0.5, 0.9, 1].map((t) => ({ t, got: rateMatch(s, t).rate }));
    ok("*** rate matching reproduces every rate it is given, so a tau it returns means something ***",
       hits.every((h) => Math.abs(h.got - h.t) <= 0.001),
       hits.map((h) => `${h.t}->${h.got.toFixed(3)}`).join(", ") +
       ". C6: a mechanism that could not hit a known rate would return a meaningless tau, and a null measured " +
       "through it would be a fact about the mechanism.");
    // ...and the ORACLE's own scores, which are 0/1, must round-trip to the oracle's keep rate
    const oracle = Uint8Array.from({ length: 100 }, (_, i) => (i < 37 ? 1 : 0));
    const rm = rateMatch(Float32Array.from(oracle), 0.37);
    ok("...and applied to the ORACLE's own 0/1 scores it reproduces the oracle's keep rate",
       Math.abs(rm.rate - 0.37) < 1e-9, `target 0.37, got ${rm.rate.toFixed(4)} at tau ${rm.tau}`);
    ok("...and a degenerate target is answered rather than thrown",
       rateMatch(s, 0).rate === 0 && rateMatch(s, 1).rate === 1,
       "keeping nothing and keeping everything are both reachable answers, not errors");
}

console.log("\n2a. THIS FILE'S OWN MODULE, ASSERTED RATHER THAN MENTIONED");
{
    // tools/ship/definitionGates-selfcheck.mjs counts exported symbols no gate NAMES, and its header says the
    // 81 before these were closed BY ASSERTION. A row that only spelled the names would satisfy the census
    // and measure nothing, so each is exercised.
    const rows = [{ scene: "x", frame: 1, x: Array.from({ length: NF * 2 }, (_, i) => i), y: [1, 0], base: 0.5 },
                  { scene: "x", frame: 2, x: Array.from({ length: NF }, (_, i) => 100 + i), y: [0], base: 0 }];
    const F = flatten(rows);
    ok("*** flatten unpacks frames into blocks, keeping each block's own row of features ***",
       F.n === 3 && F.x.length === 3 * NF && F.y.length === 3 &&
       F.x[0] === 0 && F.x[NF] === NF && F.x[2 * NF] === 100 &&
       F.y[0] === 1 && F.y[1] === 0 && F.y[2] === 0,
       `${rows.length} frames carrying 2 and 1 blocks -> ${F.n} rows of ${NF}. A flatten that dropped or ` +
       "reordered a block would mis-pair every feature row with somebody else's label, silently.");
    // writeV2 is driven on a synthetic model into the scratch path, so the file CONTRACT this gate reads at
    // the top is the contract a run actually writes -- rather than two descriptions of a shape that agree
    // only until one of them changes.
    const tmp = "tools/ship/__cal-fixture.json";
    const fake = { model: { layers: [{ nIn: NF, nOut: 2, act: "relu", W: new Float32Array(NF * 2), b: new Float32Array(2) }],
                            scaler: { mean: new Float32Array(NF), sd: new Float32Array(NF).fill(1) }, n: 7, base: 0.5, steps: 3 },
                   val: { n: 5, base: 0.25, auc: { auc: 0.6 }, rateMatch: { tau: 0.42, rate: 0.25 }, bestTau: 0.7, bestAcc: 0.8 } };
    let wrote = null, threw = null;
    try { wrote = writeV2(tmp, fake); } catch (e) { threw = String(e.message); }
    ok("*** writeV2 emits exactly the keys this gate reads back at the top of section 1 ***",
       !threw && wrote && wrote.tau === 0.42 && wrote.tauRule === "rateMatch to the validation base rate" &&
       JSON.stringify(wrote.trainedOn) === JSON.stringify([...TRAIN_ONLY]) && wrote.validatedOn === VALIDATE_ON &&
       wrote.heldOut === HELD_OUT && wrote.validation.auc === 0.6 && wrote.layers.length === 1,
       threw || `tau ${wrote.tau}, rule ${JSON.stringify(wrote.tauRule)}, slices ` +
       `${JSON.stringify(wrote.trainedOn)}/${JSON.stringify(wrote.validatedOn)}/${JSON.stringify(wrote.heldOut)}. ` +
       "The reader and the writer are held to one shape here rather than to two descriptions that agree until " +
       "one of them changes.");
    try { fs.unlinkSync(path.join(ENG, tmp)); } catch {}
    ok("...and the fixture file is removed, so this gate does not leave a weights file behind",
       !fs.existsSync(path.join(ENG, tmp)),
       "gateActivity's rule: a gate that leaves its output behind grows the population something else measures");
    ok("*** calibrate is the one entry point that touches the page, and it names the two fitted slices only ***",
       typeof calibrate === "function" &&
       !/HELD_OUT|checker/.test(calibrate.toString()),
       "its body harvests TRAIN_ONLY and VALIDATE_ON through trainThreeWay and never names the held-out " +
       "scene -- C5 again, one level up: the leak is refused by what the code can reach, not by care.");
}

console.log("\n2b. THE TWO FUNCTIONS, ON FIXTURES THE LIVE DATA DOES NOT REACH");
{
    // *** THREE SABOTAGES SCORED 0 RED AGAINST THE LIVE RUN ALONE, AND ALL THREE ARE REACHABLE ON A FIXTURE. ***
    // A tau interpolated between two observed scores, an AUC that calls a one-class sample a coin, and an AUC
    // that gives tied scores consecutive ranks are each invisible on data that happens not to contain the
    // shape they break. Same lesson as v4686's nearerIsLess and v4687's t: a case, not a note.
    const tied = Float32Array.from([0.2, 0.2, 0.2, 0.2, 0.8, 0.8, 0.8, 0.8]);
    const rm = rateMatch(tied, 0.5);
    let got = 0; for (const v of tied) if (v >= rm.tau) got++;
    ok("*** rateMatch returns a tau the scores ATTAIN, on a sample that is all ties ***",
       rm.rate === 0.5 && got === 4 && tied.some((v) => v === rm.tau),
       `tau ${rm.tau}, keeping ${got} of ${tied.length}. The rate is a STEP function of tau, so a tau ` +
       "interpolated between two observed scores is one no threshold test can land on -- and against the live " +
       "run, where scores are near-continuous, interpolating changed nothing and scored 0 RED.");
    const tieAuc = auc(Float32Array.from([0.5, 0.5, 0.5, 0.5]), Uint8Array.from([0, 1, 0, 1]));
    ok("*** auc gives TIED scores their average rank, so an all-ties sample scores exactly a coin ***",
       tieAuc.auc === 0.5,
       `four identical scores, two of each class -> AUC ${tieAuc.auc}. Consecutive ranks would make the order ` +
       "the sort happened to produce into a signal, and the live data has few exact ties to notice it.");
    const oneClass = auc(Float32Array.from([0.1, 0.9]), Uint8Array.from([1, 1]));
    ok("*** auc refuses a ONE-CLASS sample with a reason instead of returning 0.5 ***",
       oneClass.auc === null && /one class only/.test(oneClass.why || ""),
       `${JSON.stringify(oneClass.why)}. 0.5 is the value a coin scores, so returning it for a sample with no ` +
       "negatives would report a measurement where there is none -- the shape pairedStats uses for a constant " +
       "sample, and the reason a null is a result rather than a gap.");
    ok("...and a perfectly separating score still reads 1, so none of the above softened it",
       auc(Float32Array.from([0.1, 0.2, 0.8, 0.9]), Uint8Array.from([0, 0, 1, 1])).auc === 1 &&
       auc(Float32Array.from([0.9, 0.8, 0.2, 0.1]), Uint8Array.from([0, 0, 1, 1])).auc === 0,
       "perfect ranking 1, perfectly inverted 0 -- the ends of the scale are still the ends");
}

console.log("\n3. *** THE DIAGNOSTIC THAT SEPARATES E1 FROM E2, ON VALIDATION ***");
{
    const V = W.validation;
    say(`TRAIN (${TRAIN_ONLY.join("/")}): ${W.rows} blocks, base rate ${W.baseRate.toFixed(4)}`);
    say(`VALIDATION (${VALIDATE_ON}): ${V.n} blocks, base rate ${V.base.toFixed(4)}, AUC ${V.auc === null ? "n/a" : V.auc.toFixed(4)}`);
    say(`tau ${W.tau.toFixed(4)} keeps ${(V.keptRate * 100).toFixed(1)}%  [S5, never promoted: bestTau ${V.bestTau.toFixed(2)} acc ${V.bestAcc.toFixed(4)}]`);
    // *** THE BASE RATE MOVES BY A FACTOR OF NEARLY THREE BETWEEN TWO TRAINING-SIDE SCENES. ***
    ok("*** the per-block answer is STRONGLY scene-dependent, which is the fact the rest of this round turns on ***",
       Math.abs(W.baseRate - V.base) > 0.2,
       `generation wins ${(W.baseRate * 100).toFixed(1)}% of blocks on ${TRAIN_ONLY.join("/")} and ` +
       `${(V.base * 100).toFixed(1)}% on ${VALIDATE_ON}. Neither scene is held out; both are training-side. ` +
       "A predictor fitted on one is being asked about a population with a different prior, which is the " +
       "distribution shift a per-block mechanism would have to survive and a scene-identity feature would not.");
    ok("*** E2 RATHER THAN E1: the ranking does NOT transfer, so the operating point was never the problem ***",
       V.auc !== null && V.auc < 0.5,
       `validation AUC ${V.auc.toFixed(4)}, and 0.5 is a coin. Section 2 declared this the diagnostic: E1 ` +
       "(calibration) predicted comfortably above 0.5 and E2 (representation) predicted about 0.5. It reads " +
       "BELOW 0.5 -- the network ranks blocks on an unseen scene slightly worse than chance. Section 7 named " +
       "this outcome in advance as MORE important than H2 would have been, because it retires the feature set " +
       "rather than its threshold.");
}

console.log(`\n4. THE HELD-OUT SCENE, LOOKED AT ONCE -- FRAMES ${FROM}-${TO} OF ${HELD_OUT}`);
const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 5400000, args: { UPTO, ARMS, scene: WINDOW.scene, speed: WINDOW.speed }, script: `async (a) => {
    const drive = async (gate) => {
        const ifr = document.createElement("iframe");
        ifr.style.width = "1200px"; ifr.style.height = "900px"; ifr.src = "/fsr.html";
        document.body.appendChild(ifr);
        await new Promise((res) => { ifr.onload = res; });
        const d = ifr.contentDocument, $ = (id) => d.getElementById(id);
        const until = async (fn, ms) => { const t0 = Date.now();
            while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch {} await new Promise(r2 => setTimeout(r2, 40)); } return false; };
        const fno = () => { const m = /frame (\\d+)/.exec((($("metric") || {}).textContent || "")); return m ? Number(m[1]) : -1; };
        await until(() => fno() === 0 && /engine:/.test(($("engine") || {}).textContent || ""), 180000);
        const want = [["scene", a.scene], ["shading", "off"], ["reactive", "off"], ["camera", "objects"],
                      ["slabspeed", a.speed], ["genfield", "block"], ["gensource", "presented"],
                      ["genengine", "cpu"], ["gengate", gate], ["genframe", "on"]];
        let last = null;
        for (const [id, v] of want) { const e = $(id); if (e) { e.value = v; last = e; } }
        last.dispatchEvent(new Event("change"));
        await until(() => fno() === 0, 180000);
        const seen = [];
        $("run").click();
        for (let f = 1; f <= a.UPTO; f++) {
            const wantT = "scene time " + (f - 0.5).toFixed(1);
            await until(() => { if (fno() < f) return false;
                const g = ($("genstat") || {}).textContent || "";
                if (f === 1) return true;
                return g.indexOf(wantT) >= 0 || /OFF -- the control/.test(g); }, 900000);
            seen.push(($("genstat") || {}).textContent || "");
        }
        $("run").click(); ifr.remove();
        return { seen };
    };
    const out = {};
    for (const g of a.ARMS) out[g] = await drive(g);
    return out;
}` });

if (!r.ok) { ok("the page ran", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 400)}`); }
else {
const num = (s, re) => { const m = re.exec(s); return m ? Number(m[1]) : NaN; };
const parse = (arm) => r.result[arm].seen.map((g, i) => ({
    frame: i + 1, gen: num(g, /scores (-?[\d.]+) dB against/), cf: num(g, /presented frames scores (-?[\d.]+) dB/),
    of: (/GATE (.+?) kept/.exec(g) || [null, null])[1], kept: num(g, /kept (\d+) of/), blocks: num(g, /kept \d+ of (\d+) blocks/),
})).filter((x) => x.frame >= FROM && x.frame <= TO);
const A = Object.fromEntries(ARMS.map((g) => [g, parse(g)]));
for (const g of ARMS) say(`${g.padEnd(7)}: mean gen ${avg(A[g].map((x) => x.gen)).toFixed(4)} dB` +
    (A[g][0] && A[g][0].of ? `, gate ${A[g][0].of}, kept ${avg(A[g].map((x) => x.kept)).toFixed(1)} of ${A[g][0].blocks}` : ""));

const dOracle = A.oracle.map((x, i) => x.gen - A.off[i].gen), sOracle = pairedBoth(dOracle);
ok("*** C1 carried forward: the ORACLE still beats ungated generation, so the rig is the rig ***",
   sOracle.cleared && avg(dOracle) > 0,
   `mean ${avg(dOracle).toFixed(4)} dB, t p=${pStr(sOracle.t)}, sign p=${pStr(sOracle.sign)}, ${sOracle.sign.up}/${sOracle.sign.n} up`);

const dH2 = A.cpu2.map((x, i) => x.gen - A.off[i].gen), sH2 = pairedBoth(dH2);
const verdict = sH2.cleared && avg(dH2) > 0;
say(`*** H2 ${verdict ? "CONFIRMED" : "REFUTED"} *** -- mean ${avg(dH2).toFixed(4)} dB over ${dH2.length} frames; ` +
    `t p=${pStr(sH2.t)}, sign p=${pStr(sH2.sign)} (${sH2.sign.up} up, ${sH2.sign.down} down)`);
ok("*** the pre-registered rule was applied to the pre-registered window, and BOTH tests really ran ***",
   WINDOW.from === 6 && WINDOW.to === 38 && WINDOW.scene === HELD_OUT && WINDOW.speed === "2" &&
   dH2.length === 33 && Number.isFinite(sH2.t.p) && Number.isFinite(sH2.sign.p) && sH2.alpha === 0.05 &&
   verdict === (sH2.t.p < 0.05 && sH2.sign.p < 0.05 && avg(dH2) > 0),
   `${dH2.length} frames, and ${PREREG} declares ${WINDOW.from}-${WINDOW.to} on ${WINDOW.scene} at x${WINDOW.speed} -- ` +
   "READ FROM THAT FILE. THE OUTCOME IS NOT ASSERTED: section 7 named a refutation as a result in advance.");

const keptMean = avg(A.cpu2.map((x) => x.kept));
const keptFrac = keptMean / A.cpu2[0].blocks;
// *** SECTION 7 NAMED ONE COLLAPSE AND THE OTHER ONE HAPPENED. *** The pre-registration warned that rate
// matching might keep NEARLY EVERYTHING, turning the gate into ungated generation and making H2 untestable
// in that direction. The first draft of this row checked exactly that and PASSED -- while the gate kept
// essentially NOTHING on the held-out scene, which is the same failure mirrored. A detector aimed at one
// end of a range is not a detector, and this is the second time in three rounds that a row here measured
// the wrong direction of the thing it was named for. It is two-sided now, and it is a FUNCTION so the
// fixtures below can drive both ends of it.
const collapse = (frac) => (frac <= 0.01 ? "keeps nothing" : frac >= 0.99 ? "keeps everything" : null);
ok("*** the collapse detector fires at BOTH ends, not just the one the pre-registration happened to name ***",
   collapse(0) === "keeps nothing" && collapse(1) === "keeps everything" && collapse(0.5) === null &&
   collapse(0.005) === "keeps nothing" && collapse(0.995) === "keeps everything",
   "fixtures at 0, 0.005, 0.5, 0.995 and 1. The first draft tested only the upper end and passed over a " +
   "lower-end collapse in the very run it was written for.");
say(`*** THE GATE COLLAPSED: it keeps ${keptMean.toFixed(1)} of ${A.cpu2[0].blocks} blocks ` +
    `(${(keptFrac * 100).toFixed(2)}%) on the held-out scene -- "${collapse(keptFrac)}" ***`);
ok("*** and the collapse is REPORTED rather than the resulting near-zero difference being sold as a finding ***",
   collapse(keptFrac) !== null,
   `the detector says "${collapse(keptFrac)}" at ${(keptFrac * 100).toFixed(2)}%. Section 7: name it as a ` +
   "collapse, do not report the near-zero difference as a measurement of the predictor's quality. H2 is " +
   "refuted AND the arm that refuted it was barely an arm -- tau 0.3667 was chosen on `zone` and NOTHING on " +
   "`checker` scores above it. Those are one fact, not two: the scores do not transfer, so no threshold " +
   "chosen elsewhere lands anywhere useful here.");

const dC2 = A.cpu2.map((x, i) => x.gen - A.never[i].gen), sC2 = pairedBoth(dC2);
say(`C2: learned gate - always-cross-fade, mean ${avg(dC2).toFixed(4)} dB, t p=${pStr(sC2.t)}, sign p=${pStr(sC2.sign)}`);
say(`S6: held-out keep rate ${(keptMean / A.cpu2[0].blocks * 100).toFixed(1)}% against the oracle's ` +
    `${(avg(A.oracle.map((x) => x.kept)) / A.oracle[0].blocks * 100).toFixed(1)}%`);
say(`S8 (the confound this round introduced): weights are fitted on ${TRAIN_ONLY.join("/")} ALONE, where v4691 used two scenes`);
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
//   P2  rateMatch ignores its target and always keeps half   -> 3 red
//   P5  the collapse detector goes back to one-sided         -> 2 red
//   P1  rateMatch interpolates a tau nothing attains         -> 1 red, AFTER AN ALL-TIES FIXTURE
//   P3  auc calls a one-class sample a coin                  -> 1 red, AFTER A ONE-CLASS FIXTURE
//   P4  auc gives tied scores consecutive ranks              -> 1 red, AFTER AN ALL-TIES FIXTURE
//   P6  the PRE-REGISTRATION's threshold rule is swapped     -> 1 red, AFTER THE RULE STOPPED BEING RESTATED
//
// *** P6 IS v4691'S DEFECT ONE FIELD OVER, AND THAT IS THE ONE TO READ. *** v4691 restated the measurement
// WINDOW in its gate and checked the window against its own constants; this round restated the threshold
// RULE, checking the weights file's `tauRule` string -- which is written by the tool that chose the
// threshold and therefore agrees with itself by construction. Swapping the pre-registration's PRIMARY rule
// for its declared SECONDARY changed nothing and scored 0 RED. The rule is now parsed out of
// render/learned-calibration-preregistration.md alongside the window, so changing either means editing the
// document, which is the act the document exists to make visible. Two rounds, two restatements, the same
// shape: a record is only a record if the code reads it.
//
// *** P1, P3 AND P4 WERE ALL INVISIBLE AGAINST THE LIVE RUN, FOR ONE REASON: THE DATA HAS NO TIES. *** Block
// scores are near-continuous, so a tau interpolated between two of them still keeps about the right count,
// and an AUC that mishandles ties never meets any. A one-class sample never occurs either. Section 2b drives
// all three on fixtures and each mutation then reddens. Fourth round running that this arc has found a guard
// whose adversarial population was empty -- v4686's nearerIsLess, v4687's t and fill radius, v4688's two
// timingKind clauses, and now these.
//
// *** AND P5 IS THE ROUND'S OWN DEFECT, CAUGHT BY ITS OWN DATA. *** The pre-registration named ONE collapse
// -- rate matching keeping nearly everything -- and the first draft of that row checked exactly that. The
// gate then kept essentially NOTHING on the held-out scene and the row PASSED over it. A detector aimed at
// one end of a range is not a detector. It is two-sided now, with fixtures at both ends.

console.log(`\ngenGateCalibrate-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: WHETHER A DIFFERENT FEATURE SET WOULD TRANSFER -- this round moved the operating " +
    "point and nothing else, by design, so that a result could be attributed to the operating point and " +
    "nothing else. NOTHING ABOUT FSR4. NO TIMING CLAIM: SwiftShader. AND THE VALIDATION SCENE IS ONE SCENE: " +
    "an AUC below a coin on `zone` says the ranking did not transfer THERE, and two training-side scenes are " +
    "not a distribution.");
process.exit(fails ? 1 : 0);
