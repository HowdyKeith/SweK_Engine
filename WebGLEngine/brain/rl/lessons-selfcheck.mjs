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
import { recordingWatchdog, recordLesson, readLessons, makeRecord, health, lessonsPath, RECORDED_EVENTS } from "./lessons.mjs";

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

try { fs.rmSync(TMP, { force: true }); } catch { }
console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
