#!/usr/bin/env node
// WebGLEngine/tools/ship/genGateTransfer-selfcheck.mjs -- v4696
//
// *** CONTROL C8 FAILED, SO THIS ROUND REPORTS THE HARNESS AND MEASURES NOTHING THROUGH IT. ***
//
// render/learned-transfer-preregistration.md section 6 declared C8 before anything ran: a SHUFFLED-label run
// must score pooled AUC within 0.02 of 0.5, "if shuffling produces signal, every number here is an artefact
// of the harness". It scored 0.2451. Section 7 says what to do about that -- stop, report the harness, and do
// not measure through it -- and that is what this gate does.
//
// *** THE PRIMARY STATISTIC ITSELF IS UNSOUND, AND THAT IS THE FINDING. *** Section 4 made POOLED
// leave-one-scene-out AUC the primary. Pooling ranks blocks scored by THREE DIFFERENT MODELS, each trained on
// a different label prior, so each fold's scores sit in a different band -- and the folds' own base rates
// differ so widely that fold identity is itself predictive of the label. The pooled number is then mostly
// "which fold was this block in", which is a property of the design and not of any predictor.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auc, aucP, N_FEATURES as N1, N_FEATURES_V2 as N2 } from "../../render/genGate.mjs";
import { rowsOf, leaveOneOut, harvestAll, SCENES, CACHE } from "./genGateTransfer.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);

const PREREG = "render/learned-transfer-preregistration.md";
const TXT = fs.readFileSync(path.join(ENG, PREREG), "utf8");
const RESULTS = JSON.parse(fs.readFileSync(path.join(ENG, "tools/ship/genGate-transfer.json"), "utf8"));
const byScene = JSON.parse(fs.readFileSync(path.join(ENG, CACHE), "utf8"));

console.log("genGateTransfer-selfcheck -- a control that fired, and a primary statistic that cannot stand\n");

console.log("1. *** CONTROL C8 FIRED, AND THE PRE-REGISTRATION SAYS WHAT THAT MEANS ***");
{
    const tol = (() => { const m = /within (0\.\d+) of 0\.5/.exec(TXT); if (!m) throw new Error(`${PREREG} does not declare C8's tolerance`); return Number(m[1]); })();
    const sh = RESULTS.shuffled.pooled.auc;
    say(`shuffled-label pooled AUC ${sh.toFixed(4)}, against a declared tolerance of 0.5 +/- ${tol}`);
    ok("*** C8 FAILED: shuffling the training labels still produces a pooled AUC far from a coin ***",
       Math.abs(sh - 0.5) > tol,
       `|${sh.toFixed(4)} - 0.5| = ${Math.abs(sh - 0.5).toFixed(4)} > ${tol}. The pre-registration's own words: ` +
       `"if shuffling produces signal, every number here is an artefact of the harness". THIS ROW ASSERTS THE ` +
       `CONTROL FIRED, which is a fact about the design; it is not a result about learning and is not one.`);
    ok("*** ...and section 7 says to stop, so H3 IS NOT REPORTED -- neither clause, in either direction ***",
       /C8 fails.*stop and report the harness, measure nothing through it/s.test(TXT),
       "the failure condition was written before the run. Reporting H3 now would be choosing to believe a " +
       "statistic the round's own control just refuted, and a pre-registration that can be overruled by its " +
       "result is decoration.");
}

console.log("\n1b. THIS FILE'S OWN MODULE, ASSERTED RATHER THAN MENTIONED");
{
    // definitionGates-selfcheck counts exported symbols no gate NAMES, and its header says the 81 before them
    // were closed BY ASSERTION. Each is exercised rather than spelled.
    // v4698 -- THIS ROW SAID "fsr.html offers exactly these" FOR A ROUND AFTER IT STOPPED BEING TRUE. v4697 gave
    // the page seven scenes, and the row stayed green because it compared SCENES against a literal and never
    // read the page. It now asserts what is still true -- these are v4695's pre-registered three, all of them
    // on the page -- and says the page offers more, reading the page to say it.
    ok("*** SCENES is v4695's pre-registered three, every one of them on the page -- which offers MORE since v4697 ***",
       (() => {
           const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
           const m = /<select id="scene">([\s\S]*?)<\/select>/.exec(html);
           const page = m ? [...m[1].matchAll(/<option value="(\w+)">/g)].map((x) => x[1]) : [];
           const pre = fs.readFileSync(path.join(ENG, "render/learned-transfer-preregistration.md"), "utf8");
           return SCENES.length === 3 && SCENES.every((s2) => page.includes(s2) && pre.includes("`" + s2 + "`")) &&
                  page.length > SCENES.length;
       })(),
       `${SCENES.join(", ")}: the three v4695 pre-registered, and v4696's folds are over those three alone. The ` +
       "page's scene list is larger now and a seven-fold design is render/learned-folds-preregistration.md's.");
    ok("*** rowsOf drops a block whose row is non-finite, and drops it from BOTH sets alike ***",
       (() => {
           // v4698 -- block 1 non-finite in v2 ALONE, block 2 in v1 alone. The v4696 fixture made one block
           // non-finite in BOTH sets, which is the one case where filtering each set on its own row and
           // filtering jointly agree -- so the row could not see that the code did the former.
           const bad = [{ scene: "x", y: [1, 0, 1], base: 0.67,
                          x: [...Array(N1).fill(1), ...Array(N1).fill(1), ...Array(N1).fill(NaN)],
                          x2: [...Array(N2).fill(1), ...Array(N2).fill(NaN), ...Array(N2).fill(1)] }];
           return rowsOf(bad, "v1").n === 1 && rowsOf(bad, "v2").n === 1;
       })(),
       "a declined block can carry a non-finite log-ratio in v2 and a finite absolute in v1. Dropping it from " +
       "one set and not the other would make the two runs differ by their POPULATION as well as their " +
       "features, and clause (b) would no longer be a comparison.");
    ok("*** leaveOneOut holds out each scene in turn and never trains on the one it scores ***",
       (() => {
           const r = leaveOneOut(byScene, "v2", { seed: 3 });
           return r.perFold.length === 3 && r.perFold.map((f) => f.held).join(",") === SCENES.join(",") &&
                  r.perFold.every((f) => f.n > 0);
       })(),
       "three folds, each named by the scene it held out, each with blocks to score -- C5 one level up: the " +
       "held-out scene is absent from the fold's training set by construction of the loop, not by care.");
    ok("...and harvestAll is the page-driving entry point, which is why this gate reads a CACHE instead",
       typeof harvestAll === "function" && fs.existsSync(path.join(ENG, CACHE)),
       `${CACHE} exists, so this gate costs 419 ms instead of the minutes a drive costs. The cache is the ` +
       "round's data and is committed with it; re-deriving it means running the tool.");
}

console.log("\n2. *** WHY THE POOLED STATISTIC CANNOT STAND -- THE PRIORS, MEASURED ***");
{
    const rows = [];
    for (const held of SCENES) {
        const tr = rowsOf(SCENES.filter((s) => s !== held).flatMap((s) => byScene[s]), "v2");
        const te = rowsOf(byScene[held], "v2");
        const b = (a) => a.reduce((x, v) => x + v, 0) / a.length;
        rows.push({ held, train: b(tr.y), test: b(te.y) });
        say(`fold ${held.padEnd(8)} trains on base ${b(tr.y).toFixed(4)}, tested on base ${b(te.y).toFixed(4)}`);
    }
    const trSpread = Math.max(...rows.map((r) => r.train)) - Math.min(...rows.map((r) => r.train));
    const teSpread = Math.max(...rows.map((r) => r.test)) - Math.min(...rows.map((r) => r.test));
    ok("*** each fold's model is trained on a DIFFERENT prior, so its scores sit in a different band ***",
       trSpread > 0.15,
       `training base rates span ${trSpread.toFixed(4)}. A sigmoid head fitted to a 0.69 prior outputs higher ` +
       "numbers than one fitted to a 0.44 prior, for every input, and pooling puts those numbers in one ranking.");
    ok("*** ...and the folds' OWN base rates differ so widely that fold identity predicts the label ***",
       teSpread > 0.4,
       `test base rates span ${teSpread.toFixed(4)} (${rows.map((r) => `${r.held} ${r.test.toFixed(3)}`).join(", ")}). ` +
       "So the pooled ranking is largely WHICH FOLD A BLOCK CAME FROM. That is a property of the design, and it " +
       "is present whatever the predictor does -- which is exactly why the shuffled control reproduces it.");
}

console.log("\n3. *** A POSITIVE CONTROL ON THE MECHANISM, WITH NO FSR DATA IN IT AT ALL ***");
{
    // Two groups whose WITHIN-group ranking is exactly chance by construction, different priors, different
    // score bands. If pooling is the defect, this must reproduce a far-from-0.5 pooled AUC from nothing.
    let sd = 5; const rnd = () => ((sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const P = [], Y = [], perGroup = [];
    for (const [band, base, n] of [[0.8, 0.25, 4000], [0.3, 0.75, 4000]]) {
        const p = [], y = [];
        for (let i = 0; i < n; i++) { p.push(band + 0.01 * rnd()); y.push(rnd() < base ? 1 : 0); }
        perGroup.push(auc(Float32Array.from(p), Uint8Array.from(y)).auc);
        P.push(...p); Y.push(...y);
    }
    const pooled = auc(Float32Array.from(P), Uint8Array.from(Y));
    say(`within-group AUCs ${perGroup.map((a) => a.toFixed(3)).join(" and ")}, pooled ${pooled.auc.toFixed(4)}`);
    ok("*** two groups at CHANCE within themselves pool to an AUC nowhere near chance ***",
       perGroup.every((a) => Math.abs(a - 0.5) < 0.05) && Math.abs(pooled.auc - 0.5) > 0.2,
       `each group's own ranking is a coin (${perGroup.map((a) => a.toFixed(3)).join(", ")}) and the pooled ` +
       `number is ${pooled.auc.toFixed(4)}. NO FSR DATA IS INVOLVED -- the scores are made up. This is the ` +
       "pooled statistic manufacturing a result out of group structure, which is the defect the shuffled " +
       "control detected in the real run and the reason section 4's primary cannot be evaluated.");
}

console.log("\n4. C9 -- THE PER-FOLD NUMBERS, REPORTED BECAUSE THEY WERE DECLARED, NOT PROMOTED");
{
    for (const k of ["v2", "v1", "shuffled"])
        say(`${k.padEnd(9)} per-fold ${RESULTS[k].perFold.map((f) => `${f.held}:${f.auc.toFixed(3)}`).join("  ")}` +
            `   (pooled ${RESULTS[k].pooled.auc.toFixed(4)} -- NOT USABLE, see section 1)`);
    // *** AND THE PER-FOLD NUMBERS CANNOT BE PROMOTED TO THE PRIMARY EITHER, WHICH IS THE HARDER POINT. ***
    const shFolds = RESULTS.shuffled.perFold.map((f) => f.auc);
    const spread = Math.max(...shFolds) - Math.min(...shFolds);
    const v1v2 = RESULTS.perFoldGap === undefined
        ? Math.max(...SCENES.map((s, i) => Math.abs(RESULTS.v2.perFold[i].auc - RESULTS.v1.perFold[i].auc)))
        : RESULTS.perFoldGap;
    // *** THE PER-FOLD NUMBERS ARE CONTAMINATED TOO, AND THE SHUFFLED CONTROL IS HOW THAT IS KNOWN. ***
    // A shuffled-label model has no signal to find, so each fold's AUC should sit at chance to within its own
    // sampling error -- which at these fold sizes is about 0.004. It does not. The deviations are an order of
    // magnitude larger, and they are tested against the SAME Mann-Whitney null section 4 declared rather than
    // against an eyeballed threshold.
    //
    // THIS REPLACED A ROW THAT COMPARED THE SHUFFLED SPREAD AGAINST THE v1-TO-v2 GAP. That comparison was
    // decisive under the feature set this round started with and MARGINAL under the corrected one (0.088
    // against 0.089), and a claim that turns on the third decimal of two quantities with no declared
    // relationship is not a claim. What is unambiguous is that a control with nothing to learn is not at
    // chance, which needs no comparison at all.
    const shDev = RESULTS.shuffled.perFold.map((f) => {
        const n = f.n, nPos = Math.round(f.base * n), t = aucP(f.auc, nPos, n - nPos);
        return { held: f.held, auc: f.auc, dev: Math.abs(f.auc - 0.5), p: t.p };
    });
    for (const d of shDev)
        say(`shuffled fold ${d.held.padEnd(8)} AUC ${d.auc.toFixed(3)} -- ${d.dev.toFixed(3)} from chance, p=${d.p.toExponential(2)}`);
    ok("*** a control with NOTHING TO LEARN is not at chance per-fold either, so per-fold AUC is contaminated too ***",
       shDev.some((d) => d.p < 0.05),
       `${shDev.filter((d) => d.p < 0.05).length} of ${shDev.length} shuffled folds reject the null AUC = 0.5 at ` +
       `p < 0.05 (${shDev.map((d) => `${d.held} p=${d.p.toExponential(1)}`).join(", ")}). Sampling error at these ` +
       "fold sizes is about 0.004 and the deviations are far larger. SO SWITCHING TO PER-FOLD AUC WOULD NOT " +
       "RESCUE THE ROUND: the statistic that was not pre-registered is contaminated by the same fold structure " +
       "as the one that was, and choosing it now -- after the declared one failed -- would be the exact move a " +
       "pre-registration exists to prevent.");
    ok("  CONTROL: the same test calls a genuinely chance-level AUC chance, so the row above is not simply strict",
       aucP(0.5, 11000, 11000).p > 0.9 && aucP(0.504, 11000, 11000).p > 0.05,
       `AUC exactly 0.5 at n=22000 -> p=${aucP(0.5, 11000, 11000).p.toFixed(3)}; 0.504 -> ` +
       `p=${aucP(0.504, 11000, 11000).p.toFixed(3)}. A test that rejected everything would make the row above vacuous.`);
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
//   T1  the pre-registration's C8 tolerance is loosened until the control does not fire  -> 1 red
//   T2  the pre-registration's stop-and-report failure condition is deleted              -> 1 red
//   T3  the synthetic control's two groups share one score band                          -> 1 red
//   T4  the synthetic control's two groups share one prior                               -> 1 red
//   T7  aucP is made to reject everything                                                -> 1 red
//   T5  the contamination row's p threshold is loosened to 1.01          -> 0 RED, population empty
//   T6  the strictness CONTROL's condition is replaced by `true`         -> 0 RED, see below
//
// *** T1 AND T2 REDDEN BY EDITING THE PRE-REGISTRATION, WHICH IS THE PROPERTY v4693 PAID FOR. *** The
// tolerance and the failure condition are PARSED out of render/learned-transfer-preregistration.md rather
// than restated here, so loosening the bar or deleting the instruction to stop means editing the record --
// the act the record exists to make visible. v4691 restated its window and v4693 restated its rule, and both
// scored 0 RED for it; this round inherited the repair rather than the defect.
//
// *** T3 AND T4 ARE THE TWO HALVES OF THE MECHANISM, SEPARATED. *** The synthetic control manufactures a
// far-from-chance pooled AUC from two groups that are each a coin within themselves, and it needs BOTH a
// score-band difference and a prior difference to do it. Removing either sends the pooled number back to 0.5
// and the row reddens, which is what says the control demonstrates the STATED mechanism rather than some
// other one that happens to produce a number.
//
// *** T5 IS A THRESHOLD NOTHING IS NEAR. *** All three shuffled folds reject the null at p of 0.0e+0, 4.5e-5
// and 0.0e+0, so the 0.05 boundary has no member within orders of magnitude of it and loosening it to 1.01
// changes no live answer. Its adversarial population is empty -- the sixth instance of that class in this
// arc, after v4686's nearerIsLess, v4687's t and fill radius, v4688's two timingKind clauses, v4693's tie
// handling and v4695's non-vacuity clause.
//
// *** T6 IS THE ONE WORTH READING, BECAUSE IT IS A CONTROL BEING MADE VACUOUS AND NOTHING NOTICING. ***
// Replacing the strictness control's condition with `true` leaves it printing PASS in the voice of a check --
// the shape v4688 and v4691 both found in their own new rows. No row in a file can detect that about another
// row in the same file; what CAN be shown is that the control does real work when the thing it guards breaks,
// and that is T7: making aucP reject everything reddens the strictness control by one. So the control is
// load-bearing against the failure it was written for, and its vacuity under direct edit is the same
// irreducible limit v4688's hardwired-[] mutation recorded -- stated rather than chased.

console.log(`\ngenGateTransfer-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: WHETHER THE SCALE-FREE FEATURES TRANSFER. That was H3 and it is NOT ANSWERED -- " +
    "the design cannot answer it, which is what this round found. A sound test needs a statistic that does not " +
    "pool across models with different priors (per-fold, aggregated by a method declared in advance), enough " +
    "seeds to put an error bar on it, and more than three scenes, since three folds were never a distribution. " +
    "That is a new pre-registration and this round does not pre-empt it. NOTHING ABOUT FSR4. NO TIMING CLAIM.");
process.exit(fails ? 1 : 0);
