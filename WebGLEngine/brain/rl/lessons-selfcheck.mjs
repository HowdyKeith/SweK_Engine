// WebGLEngine/brain/rl/lessons-selfcheck.mjs -- v3968
//
// Run: node brain/rl/lessons-selfcheck.mjs   (~1s MEASURED; no browser, no GPU)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** THE STUB-EMITTER, DRIVEN -- INCLUDING THE THREE WAYS IT WAS ALREADY WRONG. ***
//
// This is the write half of a lesson corpus: watchdog verdicts (`reverted-nan`, `stalled-kicked`) become
// append-only JSONL records that a LATER training run could read before it starts. The read half is
// deliberately not built. SweK has 241 hand-authored claims and ZERO of them name an RL environment, so a
// retrieval step would have been searching an empty corpus -- the emitter has to accumulate something real
// first, which is why this gate is about WRITING and about the record being worth reading.
//
// Three defects are pinned here because all three shipped and all three were found by running it, not reading
// it:
//
//   1. *** `require` DOES NOT EXIST IN .mjs, AND THE CATCH BLOCKS ATE IT. *** Every fs call sat inside
//      `try { require("fs") } catch { return false }`. The first real run drove the real watchdog to three
//      stalls and a NaN revert, wrote NOTHING, and reported nothing wrong. "Never throws" is the right
//      contract for instrumentation and it turned total failure into silence -- so health() exists, and this
//      gate asserts through it. A recorder that cannot say whether it recorded is not instrumentation.
//
//   2. *** NINE ROWS FOR THREE PLATEAUS. *** Forty real ES steps on dockEnv produced nine stall records: three
//      at bestScore -127.7566, three at -60.8869, three at -45.2518. The watchdog was right -- it re-kicks
//      every `patience` steps while the score sits still -- but a corpus whose row count scales with run
//      length is one nobody reads twice. Consecutive events at an unchanged score fold into one record with a
//      repeat count.
//
//   3. *** THE BROWSER'S RECORDS CLAIMED TO BE NODE'S. *** brain-lab.html POSTs to /brain/lessons; the route
//      re-validates through makeRecord; makeRecord recomputed `runtime` from the SERVER. Three records made by
//      Chromium landed stamped "node 22.22.2" -- the exact misattribution the field's own comment warns about.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWatchdog } from "./watchdog.js";
import { recordingWatchdog, recordLesson, readLessons, makeRecord, health, lessonsPath, RECORDED_EVENTS,
         lessonsFor, lessonsBrief, watchTraining, recordSweepFinding } from "./lessons.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("lessons-selfcheck -- the brain lesson emitter, driven\n");

// A scratch corpus, so a gate run never appends to the real one.
const TMP = path.join(os.tmpdir(), "swek-lessons-selfcheck-" + process.pid + ".jsonl");
process.env.SWEK_BRAIN_LESSONS = TMP;
try { fs.rmSync(TMP, { force: true }); } catch { }

// ---- 1. it writes at all, and SAYS SO ---------------------------------------------------------------------
{
    const before = health().written;
    const wrote = recordLesson({ env: "selfcheckEnv", event: "stalled-kicked", params: { pop: 4 }, score: 1.5, iters: 7 });
    ok("!! *** a record actually reaches disk *** -- the first version silently wrote nothing for a whole run",
        wrote === true && health().written === before + 1, JSON.stringify({ ...health(), path: undefined }));
    ok("!! ...and health() reports the failure when there is one, so SILENCE IS CHECKABLE",
        health().lastError === "", health().lastError || "no error");
    const back = readLessons(TMP);
    ok("it reads back as one parseable record", back.length === 1 && back[0].env === "selfcheckEnv");
}

// ---- 2. a malformed line does not poison the corpus --------------------------------------------------------
{
    fs.appendFileSync(TMP, "{ this is not json\n");
    const back = readLessons(TMP);
    ok("!! a half-written line is SKIPPED, not thrown -- a killed process must not make the record unreadable",
        back.length === 1, back.length + " parsed");
}

// ---- 3. THE REAL WATCHDOG, DRIVEN TO BOTH RECORDED VERDICTS ------------------------------------------------
// Not a mock of the watchdog: what is being tested is whether its OWN verdicts reach the recorder.
{
    try { fs.rmSync(TMP, { force: true }); } catch { }
    let params = new Float32Array([0.1, 0.2, 0.3]);
    const flat = { best: () => params, bestEval: () => ({ dockRate: 0.5, avgDist: 10, avgCrashes: 0 }),
                   setParams: (p) => { params = Float32Array.from(p); } };
    const wd = recordingWatchdog(createWatchdog(flat, { patience: 3, minDelta: 0.5 }), { env: "stallEnv", params: { pop: 4 } });
    const seen = [];
    for (let i = 0; i < 10; i++) seen.push(wd.check().status);
    wd.flush();
    ok("the real watchdog reaches 'stalled-kicked' on a flat trainer", seen.includes("stalled-kicked"), seen.join(","));

    // *** THE DE-DUPLICATION CLAIM, WHICH IS THE DIFFERENCE BETWEEN A CORPUS AND A LOG FILE. ***
    const kicks = seen.filter((s) => s === "stalled-kicked").length;
    const rows = readLessons(TMP);
    ok("!! *** consecutive kicks at ONE unchanged score collapse into ONE record ***",
        kicks >= 3 && rows.length === 1 && rows[0].stats.repeats === kicks,
        kicks + " kicks -> " + rows.length + " record(s), repeats=" + (rows[0] && rows[0].stats.repeats));
    ok("   ...and the record keeps the span it covered, so a reader can tell a long plateau from a blip",
        rows[0] && Number.isFinite(rows[0].stats.firstIters) && Number.isFinite(rows[0].iters));

    // the other recorded verdict
    try { fs.rmSync(TMP, { force: true }); } catch { }
    let bad = new Float32Array([1, 2, 3]);
    const nan = { best: () => bad, bestEval: () => ({ dockRate: 0.5, avgDist: 10, avgCrashes: 0 }),
                  setParams: (p) => { bad = Float32Array.from(p); } };
    const wd2 = recordingWatchdog(createWatchdog(nan, { patience: 3 }), { env: "nanEnv", params: {} });
    wd2.check(); bad = new Float32Array([NaN, 2, 3]);
    const st = wd2.check().status; wd2.flush();
    ok("the real watchdog reaches 'reverted-nan' on non-finite weights", st === "reverted-nan", st);
    ok("...and that verdict is recorded too", readLessons(TMP).some((r) => r.event === "reverted-nan"));
}

// ---- 4. THE WRAPPER MUST NOT CHANGE THE VERDICT ------------------------------------------------------------
// The watchdog decides whether training is healthy; the recorder decides whether that decision is worth
// writing down. If the wrapper could alter a verdict, the instrument would be part of the experiment.
{
    const mk = () => { let p = new Float32Array([1, 2, 3]);
        return { best: () => p, bestEval: () => ({ dockRate: 0.5, avgDist: 10, avgCrashes: 0 }), setParams: (x) => { p = Float32Array.from(x); } }; };
    const plain = createWatchdog(mk(), { patience: 3, minDelta: 0.5 });
    const wrapped = recordingWatchdog(createWatchdog(mk(), { patience: 3, minDelta: 0.5 }), { env: "cmpEnv", params: {} });
    const a = [], b = [];
    for (let i = 0; i < 12; i++) { a.push(plain.check().status); b.push(wrapped.check().status); }
    ok("!! *** wrapped and unwrapped watchdogs return the IDENTICAL verdict sequence ***",
        a.join(",") === b.join(","), a.join(",") + "  vs  " + b.join(","));
}

// ---- 5. healthy steps are NOT recorded ---------------------------------------------------------------------
{
    ok("!! only the two verdicts worth remembering are recorded -- 'ok'/'improving' happen thousands of times",
        RECORDED_EVENTS.has("stalled-kicked") && RECORDED_EVENTS.has("reverted-nan")
        && !RECORDED_EVENTS.has("ok") && !RECORDED_EVENTS.has("improving"),
        [...RECORDED_EVENTS].join(", "));
}

// ---- 6. THE RUNTIME FIELD TELLS THE TRUTH ------------------------------------------------------------------
{
    const kept = makeRecord({ env: "e", event: "stalled-kicked", runtime: "browser" });
    ok("!! *** an incoming runtime is KEPT, not recomputed *** -- three browser records once landed as 'node'",
        kept.runtime === "browser", kept.runtime);
    const own = makeRecord({ env: "e", event: "stalled-kicked" });
    ok("...and a record made with no runtime still stamps the one it was made on",
        /^(node|bun|browser)/.test(own.runtime), own.runtime);
}

// ---- 7. THE CORPUS MUST NOT LIVE WHERE A GENERATOR WOULD WIPE IT --------------------------------------------
// tools/okf/emitOKF.mjs opens with fs.rmSync(outDir, {recursive:true}) and rebuilds every claim from
// predictions.html. A stub written into okf/claims/ would survive until the next emit and then vanish -- a
// corpus that looks like it is accumulating and is not.
{
    const emit = fs.readFileSync(path.join(ROOT, "tools", "okf", "emitOKF.mjs"), "utf8");
    ok("!! emitOKF still WIPES its output dir (the reason the corpus is not kept in okf/claims/)",
        /rmSync\(outDir,\s*\{\s*recursive:\s*true/.test(emit),
        "if this ever stops being true the separation can be revisited -- until then it is load-bearing");
    // *** THE OVERRIDE IS REMOVED FOR THIS ONE CHECK, WHICH IS THE WHOLE POINT OF IT. *** The first cut asked
    // lessonsPath() while SWEK_BRAIN_LESSONS still pointed at a scratch file in /tmp, so it was asserting that
    // /tmp is not inside the engine tree -- true, trivial, and blind to the DEFAULT being wrong. A check that
    // can only pass is not a check.
    const saved = process.env.SWEK_BRAIN_LESSONS;
    delete process.env.SWEK_BRAIN_LESSONS;
    const p = lessonsPath();
    process.env.SWEK_BRAIN_LESSONS = saved;
    ok("!! ...so the DEFAULT corpus path is outside the engine tree and outside okf/claims/",
        !!p && !p.includes(path.join("okf", "claims")) && !p.startsWith(ROOT + path.sep),
        p + "  (engine tree: " + ROOT + ")");
}

// ---- 8. THE READ SIDE: RANKING (v3969) ---------------------------------------------------------------------
// *** RANKED BY REPEAT COUNT, NOT SCORE, BECAUSE SCORES ARE NOT COMPARABLE. *** Measured at v3968: dockEnv
// plateaus near -127..-45, dockHazardEnv near -1901..-1323, huntEnv near -96..-32. Sorting by score would put
// every dockHazard lesson above every hunt lesson forever and call that relevance. The fixture below is built
// so score order and repeat order DISAGREE -- a reader that quietly sorted by score would pass a fixture where
// they happened to agree.
{
    try { fs.rmSync(TMP, { force: true }); } catch { }
    const rows = [
        // *** THE TWO ORDERINGS MUST DISAGREE OR THE CHECK CANNOT SEE THE DIFFERENCE. *** The first version of
        // this fixture put the worst score (-900) on the longest hold (repeats 5), so ranking by score and
        // ranking by repeats produced the SAME list -- and a probe that swapped the comparator for a score sort
        // passed cleanly. A fixture where the wrong answer looks like the right one tests nothing. Here the
        // longest-held plateau has the BETTER score, so only a repeat-ranked reader puts it first.
        { env: "dockHazardEnv", event: "stalled-kicked", score: -900, iters: 20, stats: { repeats: 1, firstIters: 19 } },
        { env: "dockHazardEnv", event: "stalled-kicked", score: -100, iters: 60, stats: { repeats: 5, firstIters: 40 } },
        { env: "dockEnv",       event: "stalled-kicked", score: -50,  iters: 30, stats: { repeats: 3, firstIters: 25 } },
        { env: "huntEnv",       event: "stalled-kicked", score: -10,  iters: 15, stats: { repeats: 9, firstIters: 5 } },
    ];
    for (const r of rows) fs.appendFileSync(TMP, JSON.stringify(makeRecord(r)) + "\n");

    const got = lessonsFor("dockHazardEnv", { file: TMP });
    ok("!! *** the top lesson is the one that HELD LONGEST, not the worst-scoring one ***",
        got.exact[0] && got.exact[0].stats.repeats === 5 && got.exact[0].score === -100,
        "top repeats=" + (got.exact[0] && got.exact[0].stats.repeats) + " score=" + (got.exact[0] && got.exact[0].score) +
        "  (a score-ranked reader would put -900 first)");
    ok("   ...and the ranking is strictly repeats-descending",
        got.exact.map((r) => r.stats.repeats).join(",") === "5,1",
        got.exact.map((r) => r.stats.repeats).join(","));

    // *** A RELATED ENVIRONMENT IS SEPARATED, NOT BLENDED. *** dockEnv shares a policy shape with
    // dockHazardEnv and NOT a reward scale; presenting them as one list is how retrieval starts producing
    // confident nonsense. huntEnv shares neither and must not appear at all.
    ok("!! *** a related env (dockEnv) is offered SEPARATELY, never merged into the exact list ***",
        got.exact.every((r) => r.env === "dockHazardEnv") && got.related.some((r) => r.env === "dockEnv"),
        "exact=" + got.exact.map((r) => r.env).join(",") + "  related=" + got.related.map((r) => r.env).join(","));
    ok("   ...and an unrelated env (huntEnv) is not offered at all, despite having the highest repeat count",
        !got.related.some((r) => r.env === "huntEnv") && !got.exact.some((r) => r.env === "huntEnv"),
        "huntEnv has repeats=9 -- ranking must not reach across an unrelated environment to find it");
}

// ---- 9. THE READ SIDE: THREE OUTCOMES THAT MUST NOT LOOK ALIKE ----------------------------------------------
// Retrieval against an empty corpus, retrieval that found nothing relevant, and a broken reader all produce
// "no lessons" -- and each wants a different response from whoever reads the gate output.
{
    const empty = lessonsBrief("dockEnv", { file: path.join(os.tmpdir(), "swek-no-such-corpus.jsonl") });
    ok("!! an EMPTY corpus says so", /corpus is empty/.test(empty), empty.slice(0, 80));
    const none = lessonsBrief("zzzNoSuchEnv", { file: TMP });
    ok("!! ...and a corpus with NO MATCH says something different", /none matching/.test(none) && !/corpus is empty/.test(none), none.slice(0, 80));
    const hit = lessonsBrief("dockHazardEnv", { file: TMP });
    ok("...and a hit names the environment and the plateaus", /prior stall\(s\) for dockHazardEnv/.test(hit));
}

// ---- 10. THE TRAINER OBSERVER (v3969) ------------------------------------------------------------------------
// dock/dock-hazard train on every ship round through dockPolicy.trainDockES, which has no watchdog -- so
// wrapping createWatchdog alone left the gates contributing nothing. watchTraining adapts a plain per-iteration
// callback to the SAME plateau folding, so a gate lesson and a lab lesson are indistinguishable in the corpus.
{
    try { fs.rmSync(TMP, { force: true }); } catch { }
    const w = watchTraining({ env: "obsEnv", params: { pop: 4 }, patience: 3, minDelta: 0.5 });
    // best score climbs, then sits flat long enough to stall twice at one value, then climbs again
    const seq = [10, 20, 30, 30, 30, 30, 30, 30, 30, 99];
    seq.forEach((bestScore, it) => w.onIter({ it, bestScore }));
    w.flush();
    const rows = readLessons(TMP);
    ok("!! the observer records a plateau from a plain iteration callback", rows.length >= 1, rows.length + " record(s)");
    ok("   ...folded into ONE record for the one flat stretch, with a repeat count",
        rows.length === 1 && rows[0].stats.repeats >= 2,
        rows.length + " record(s), repeats=" + (rows[0] && rows[0].stats.repeats));
    ok("   ...and it is tagged as coming from the trainer observer, not a watchdog",
        rows[0] && rows[0].stats.source === "trainer-observer");
}

// ---- 11. THE HOOK IS OPTIONAL, AND THE GATES USE IT ----------------------------------------------------------
{
    const dp = fs.readFileSync(path.join(HERE, "dockPolicy.js"), "utf8");
    ok("!! *** trainDockES's observer is OPT-IN -- with no hook the branch is never taken ***",
        /if \(opts\.onIter\)/.test(dp) && /catch \{ \/\* an observer must never take the run down/.test(dp),
        "dock and dock-hazard verdicts were byte-identical before and after the hook was added");
    for (const g of ["dock-selfcheck.mjs", "dock-hazard-selfcheck.mjs"]) {
        const src = fs.readFileSync(path.join(HERE, g), "utf8");
        ok("   " + g + " both READS priors and WRITES its own",
            /lessonsBrief\(/.test(src) && /watchTraining\(/.test(src) && /onIter: _watch\.onIter/.test(src));
    }
}

// ---- 12. recordSweepFinding (v3970) -- FOR A DEVICE THAT DOES NOT TRAIN --------------------------------------
// The kh gate family sweeps expensive independent simulations (steps, box size) rather than training one
// continuously-scored policy, so watchTraining does not fit -- this exists for that shape, and khConvergence /
// khMichalke ALREADY hand-compute the "did it settle" verdict per point; the function must not recompute it.
{
    try { fs.rmSync(TMP, { force: true }); } catch { }

    // khConvergence's own real numbers, from its source header: steps 1000/2000/4000/8000, one ratio (2000/1000
    // = 3.931) exceeds the gate's own 2x/0.5x band.
    const series = [
        { x: 1000, y: 0.03340, settled: true },     // no "previous" -- never itself a jump
        { x: 2000, y: 0.13131, settled: false },    // ratio 3.931 vs the gate's own threshold
        { x: 4000, y: 0.13985, settled: true },     // ratio 1.065
        { x: 8000, y: 0.10788, settled: true },     // ratio 0.771
    ];
    const wrote = recordSweepFinding({ env: "kh", axis: "steps", series, params: { steps: [1000, 2000, 4000, 8000] } });
    ok("!! an UNSETTLED sweep is recorded", wrote === true);
    const rows = readLessons(TMP);
    ok("   as ONE record for the whole sweep, not one per point",
        rows.length === 1, rows.length + " record(s) for a 4-point sweep");
    ok("   ...with repeats counting the JUMPS, not the points",
        rows[0] && rows[0].stats.repeats === 1, "1 of 3 transitions failed the gate's own band; repeats=" + (rows[0] && rows[0].stats.repeats));
    ok("!! it is filed under a THIRD event name, not folded into the watchdog's two",
        rows[0] && rows[0].event === "sweep-unsettled", rows[0] && rows[0].event);

    // *** A SWEEP THAT SETTLES WRITES NOTHING. *** Same rule as RECORDED_EVENTS: a corpus that logged every
    // clean sweep would be a run log, not a lesson.
    try { fs.rmSync(TMP, { force: true }); } catch { }
    const clean = [
        { x: 1, y: 1.00, settled: true },
        { x: 2, y: 1.02, settled: true },
        { x: 3, y: 0.99, settled: true },
    ];
    const wroteClean = recordSweepFinding({ env: "kh", axis: "steps", series: clean, params: {} });
    ok("!! a sweep where EVERY point settled writes NOTHING",
        wroteClean === false && readLessons(TMP).length === 0,
        "a corpus that logged every clean sweep would be a run log, not a lesson");
}

// ---- 13. THE BRIEF'S WORDING IS EVENT-AWARE -------------------------------------------------------------------
// The first cut of lessonsBrief hardcoded "plateau ... stall window(s)" for every record. A sweep finding is
// the OPPOSITE shape -- a sequence that SCATTERED, not one that sat still -- and describing a scatter as a
// plateau would send a reader looking for the wrong failure.
{
    try { fs.rmSync(TMP, { force: true }); } catch { }
    const series = [{ x: 1, y: 1, settled: true }, { x: 2, y: 9, settled: false }];
    recordSweepFinding({ env: "kh", axis: "box", series, params: {} });
    const brief = lessonsBrief("kh", { file: TMP });
    ok("!! a sweep finding reads as 'did not settle', never as 'plateau'",
        /did not settle/.test(brief) && !/plateau/.test(brief), brief.slice(0, 120));
    ok("...and names the axis that was swept, so a reader knows which knob to avoid re-sweeping",
        /over box/.test(brief), brief.slice(0, 120));
}

// ---- 14. THE THREE kh GATES ACTUALLY WIRE THIS IN --------------------------------------------------------------
{
    const ROUNDHOUSE = path.join(ROOT, "tools", "roundhouse");
    const conv = fs.readFileSync(path.join(ROUNDHOUSE, "khConvergence-selfcheck.mjs"), "utf8");
    const mich = fs.readFileSync(path.join(ROUNDHOUSE, "khMichalke-selfcheck.mjs"), "utf8");
    const grow = fs.readFileSync(path.join(ROUNDHOUSE, "khGrowthKey-selfcheck.mjs"), "utf8");
    ok("!! khConvergence both READS priors and WRITES its own ratio-test verdict",
        /lessonsBrief\("kh"\)/.test(conv) && /recordSweepFinding\(/.test(conv));
    ok("!! khMichalke both READS priors and WRITES its own box-refinement verdict",
        /lessonsBrief\("kh"\)/.test(mich) && /recordSweepFinding\(/.test(mich));
    ok("!! khGrowthKey READS priors but writes NOTHING -- it asserts an expected trend, not a stall",
        /lessonsBrief\("kh"\)/.test(grow) && !/recordSweepFinding\(/.test(grow),
        "a trend assertion has no 'did it settle' verdict to record");
    // Both writers must be resilient the same way the RL side is: a physics gate must never go red because a
    // lesson file could not be imported or written.
    for (const [name, src] of [["khConvergence", conv], ["khMichalke", mich]]) {
        ok("   " + name + "'s import AND its recordSweepFinding call are both wrapped in try/catch",
            (src.match(/try \{[\s\S]{0,40}await import\(pathToFileURL/g) || []).length >= 1 &&
            /try \{[\s\S]{0,300}recordSweepFinding/.test(src));
    }
}

// ---- 15. levelClaim (v3972) -- THE TREE'S MOST EXPENSIVE GATE, AND THE SWEEP IT REFUSES ------------------------
//
// *** THE REFUSAL IS THE PART THAT NEEDS A CHECK. *** levelClaim runs THREE sweeps and wires TWO. The third --
// section 4's spread-against-tilt rows -- has the same shape and the OPPOSITE semantics: the spread is meant to
// RISE with the angle, so its failure is "the statistic went deaf", not "the value would not settle". Writing
// that under the event name "sweep-unsettled" would file a discrimination failure as a convergence failure.
// A DOCUMENTED REFUSAL THAT NOTHING ENFORCES IS A COMMENT, so the count is pinned here: the day somebody adds
// a third call, this goes red and they have to read the reasoning before widening it.
{
    // THREE DIFFERENT VIEWS OF THE SAME FILE, AND PICKING THE WRONG ONE IS THIS SESSION'S RECURRING BUG.
    // codeOnly() blanks comments AND the CONTENTS of string literals -- right for counting calls, useless for
    // reading a key name, which is exactly what it is for. noComments() keeps strings and drops prose -- right
    // for "is this literal present". prose() is the inverse, for grading the comment itself.
    const { codeOnly, noComments, prose } = await import(path.join(ROOT, "tools", "ship", "sourceScan.mjs"));
    const lvlPath = path.join(ROOT, "physics", "sph", "levelClaim-selfcheck.mjs");
    const lvl = fs.readFileSync(lvlPath, "utf8");
    const code = codeOnly(lvl), live = noComments(lvl), why = prose(lvl);

    ok("!! levelClaim READS priors under the sph-level key",
        /lessonsBrief\("sph-level"\)/.test(live));

    const calls = (code.match(/recordSweepFinding\(/g) || []).length;
    ok("!! ...and WRITES exactly TWO verdicts -- the levelling series and the tilt stationarity", calls === 2,
        calls + " call(s). Both are settle questions the gate already answers in its own PASS lines");

    ok("!! *** and the TILT-ANGLE sweep is NOT among them ***",
        !/axis:\s*["']tiltDeg["']/.test(live),
        "the spread RISING with tilt is the load-bearing negative; a sweep that is supposed to move has no " +
        "'did it settle' verdict to record, and 'sweep-unsettled' is the wrong word for one that went deaf");

    ok("   the refusal is written down where the next editor will hit it",
        /OPPOSITE SEMANTICS/.test(why) && /LOAD-BEARING NEGATIVE/.test(why),
        "the count check above is the enforcement; this is the explanation it points at");

    ok("   levelClaim's import AND both recordSweepFinding calls are wrapped in try/catch",
        /try \{[\s\S]{0,40}await import\(pathToFileURL/.test(code) &&
        (code.match(/try \{[\s\S]{0,200}recordSweepFinding/g) || []).length === 2,
        "a physics gate must never go red because a lesson file could not be read or written");

    // *** AND THE SEMANTICS ARE DRIVEN, NOT INSPECTED. *** Source inspection proves the call is THERE; it
    // cannot prove the boolean handed to it means what the gate means. levelClaim is green, so its real sweep
    // writes NOTHING -- which makes a silent wiring bug indistinguishable from a correct one at run time. So
    // the mapping is replayed here against levelClaim's OWN MEASURED SERIES (v3972, from the section 2 line:
    // 300:11.045 -> 900:1.980 -> 1800:0.000 -> 3000:0.000) with and without a planted reversal.
    //
    // STATED LIMIT, BECAUSE IT WOULD OTHERWISE READ AS AIRTIGHT: the mapping below is a COPY of levelClaim's,
    // not an import of it, so this replay grades the intended semantics rather than the live expression. If
    // somebody edits levelClaim's ternary the count and try/catch checks above still bite but this one does
    // not. Extracting the mapping into levelClaim.mjs so both sides share one declaration is the fix, and it
    // is a refactor of a 646s gate rather than a line here -- named so the next reader can do it deliberately.
    const MEASURED = [[300, 11.045], [900, 1.980], [1800, 0.000], [3000, 0.000]];
    const asSeries = (rows) => rows.map(([steps, sd], i) =>
        ({ x: steps, y: sd, settled: i === 0 ? true : !(sd > rows[i - 1][1]) }));

    const before = readLessons(TMP).length;
    const cleanWrote = recordSweepFinding({ env: "sph-level", axis: "steps", series: asSeries(MEASURED), params: {} });
    ok("!! levelClaim's REAL series is silent -- including the 0.000 -> 0.000 tail",
        cleanWrote === false && readLessons(TMP).length === before,
        "a flat tail is SETTLED, not a reversal: `!(0 > 0)` is true. Getting that backwards would file the " +
        "tree's most expensive gate as failing every run, which is the failure mode this replay exists to catch");

    const bent = MEASURED.map((r, i) => (i === 2 ? [1800, 3.5] : r));   // the spread climbs back mid-settle
    const bentWrote = recordSweepFinding({ env: "sph-level", axis: "steps", series: asSeries(bent), params: {} });
    const rec = readLessons(TMP).filter((r) => r.env === "sph-level").pop();
    ok("!! *** and a planted reversal DOES land, so the write path is live rather than merely present ***",
        bentWrote !== false && rec && rec.event === "sweep-unsettled" && rec.stats.repeats === 1 &&
        rec.stats.axis === "steps" && rec.stats.points === 4,
        rec ? "repeats=" + rec.stats.repeats + " of " + (rec.stats.points - 1) + " transitions, axis " +
              rec.stats.axis : "no record written");
}

try { fs.rmSync(TMP, { force: true }); } catch { }
console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
