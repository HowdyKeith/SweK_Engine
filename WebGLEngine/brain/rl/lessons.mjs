// WebGLEngine/brain/rl/lessons.mjs -- v3968
//
// THE MACHINE-WRITTEN HALF OF THE LESSON CORPUS. Append-only, one JSON object per line.
//
// *** WHY THIS EXISTS, AND WHY IT IS NOT okf/claims. *** SweK already carries 241 hand-authored claims
// (Prediction / Why / Measured / Kill condition) and one brain patchnote whose whole point is a line reading
// "Two earlier obvious fixes were tried and measured INSUFFICIENT (documented so they're not re-attempted)".
// That pattern demonstrably pays. It is also written BY HAND, AFTER THE FACT, BY SOMEBODY WHO REMEMBERED --
// and measured: ZERO of those 241 claims name a single RL environment. dockEnv, huntEnv, rocketEnv,
// occludedHuntEnv: twenty-eight files, no recorded lessons. The corpus a retrieval step would read DOES NOT
// EXIST for this subsystem, which is why the read step is not being built yet. Retrieval against an empty
// corpus is theatre.
//
// *** AND IT MUST NOT BE WRITTEN INTO okf/claims/, WHICH IS A GENERATED DIRECTORY. *** tools/okf/emitOKF.mjs
// opens with `fs.rmSync(outDir, { recursive: true, force: true })` and rebuilds every claim file from
// predictions.html. A stub written there would survive exactly until the next emit and then vanish, which is
// the worst failure mode available: a corpus that looks like it is accumulating and silently is not. The
// hand-authored corpus and the machine-written one stay separate ON PURPOSE -- one is distilled prose a person
// stands behind, the other is raw telemetry, and merging them would let telemetry dilute the thing that made
// claims worth reading.
//
// *** OUTSIDE THE TREE, FOR THE REASON githubBridge ALREADY GIVES. *** ~/.voxelbridge/ is where this project
// puts state that accumulates at runtime: it cannot be swept into a release zip, and it does not churn git on
// every training run. A lessons file committed to the repo would produce a diff every time anybody trained
// anything, which is how a useful record becomes a thing people delete.
"use strict";

const FILE_ENV = "SWEK_BRAIN_LESSONS";
const REL = [".voxelbridge", "brain-lessons.jsonl"];

// *** THIS FILE IS .mjs, SO `require` DOES NOT EXIST IN IT -- AND THE FIRST CUT USED IT ANYWAY. ***
// Every fs call sat inside `try { require("fs") } catch { return false }`, so on the very first real run the
// watchdog fired three stalls and a NaN revert, the recorder wrote NOTHING, and it reported nothing wrong.
// The "never throws" contract below is right, and it turned a total failure into silence -- which is the one
// outcome worse than a crash, because a crash gets fixed on the spot. `node:` modules are loaded ONCE here,
// with top-level await, and the browser simply never gets one.
const IS_NODE = typeof process !== "undefined" && !!(process.versions && process.versions.node);
let _fs = null, _path = null, _os = null;
if (IS_NODE) {
    try {
        _fs = (await import("node:fs")).default;
        _path = (await import("node:path")).default;
        _os = (await import("node:os")).default;
    } catch { _fs = _path = _os = null; }
}

// *** SILENCE HAS TO BE CHECKABLE. *** A recorder that cannot break the training loop can still be broken, and
// the only way anybody finds out is by asking. health() is what a gate asserts against, so "wrote nothing"
// and "worked fine, nothing worth writing" stop looking identical.
const _health = { attempted: 0, written: 0, lastError: "", sink: IS_NODE ? (_fs ? "file" : "none") : "post" };
export function health() { return { ..._health, path: lessonsPath() }; }

/** Where the corpus lives. Exported so a gate and a reader can agree without a second spelling. */
export function lessonsPath() {
    if (typeof process !== "undefined" && process.env && process.env[FILE_ENV]) return process.env[FILE_ENV];
    if (!IS_NODE || !_os || !_path) return "";                              // browser: no path, POSTs instead
    try { return _path.join(_os.homedir(), ...REL); } catch { return ""; }
}

/**
 * ONE RECORD SHAPE, and every field is here because a reader would need it to decide RELEVANCE.
 *
 * `env` is what a later run greps for. `event` is what happened. `params` is the configuration that produced
 * it -- a stall with no record of the hyperparameters that stalled is a fact you cannot act on. `score` and
 * `iters` say how far it got before the trouble started, which separates "stalled immediately" from "stalled
 * after real progress"; those want different responses and look identical without the number.
 */
export function makeRecord({ env, event, params, score, iters, stats, note, runtime: entryRuntime }) {
    return {
        at: new Date().toISOString(),
        env: String(env || "unknown"),
        event: String(event || "unknown"),
        params: params && typeof params === "object" ? params : {},
        score: Number.isFinite(score) ? +score.toFixed(4) : null,
        iters: Number.isFinite(iters) ? iters : null,
        stats: stats && typeof stats === "object" ? stats : {},
        note: note ? String(note).slice(0, 400) : "",
        // The runtime is recorded because a stall that only happens under one of them is the most useful kind
        // of lesson and the easiest to misattribute.
        //
        // *** AND THIS FIELD MISATTRIBUTED ITS FIRST REAL RECORDS, WHICH IS THE MISTAKE THE LINE ABOVE WARNS
        // ABOUT. *** A browser run in brain-lab.html POSTs to /brain/lessons, the route re-validates the body
        // through makeRecord, and makeRecord recomputed `runtime` FROM THE SERVER -- so three records produced
        // by Chromium landed on disk stamped "node 22.22.2". An incoming runtime is now KEPT: the caller that
        // observed the event knows where it ran, and a validator downstream of it does not.
        runtime: (entryRuntime && typeof entryRuntime === "string") ? entryRuntime.slice(0, 40)
            : (typeof Bun !== "undefined" && Bun.version) ? "bun " + Bun.version
                : (typeof process !== "undefined" && process.versions && process.versions.node) ? "node " + process.versions.node
                    : "browser",
    };
}

/**
 * Append one record. NEVER THROWS, and that is the contract: this is instrumentation hanging off a training
 * loop, and instrumentation that can crash the thing it observes is worse than no instrumentation. Every
 * failure path here returns false and says nothing.
 */
export function recordLesson(entry) {
    _health.attempted++;
    let rec;
    try { rec = makeRecord(entry || {}); } catch (e) { _health.lastError = "makeRecord: " + String((e && e.message) || e).slice(0, 80); return false; }
    const line = (() => { try { return JSON.stringify(rec) + "\n"; } catch { return ""; } })();
    if (!line) return false;

    // ---- browser: hand it to the bridge, which owns the one file --------------------------------------------
    if (typeof process === "undefined" || !process.versions || !process.versions.node) {
        try {
            if (typeof fetch === "function") {
                // keepalive so a record survives the page being closed right after a stall -- which is exactly
                // when somebody gives up on a training run and navigates away.
                fetch("/brain/lessons", { method: "POST", headers: { "Content-Type": "application/json" },
                                          body: line, keepalive: true }).catch(() => { });
                _health.written++;
                return true;
            }
        } catch { }
        return false;
    }

    // ---- node/bun: straight to disk -------------------------------------------------------------------------
    try {
        if (!_fs || !_path) { _health.lastError = "node fs unavailable"; return false; }
        const p = lessonsPath();
        if (!p) { _health.lastError = "no lessons path"; return false; }
        _fs.mkdirSync(_path.dirname(p), { recursive: true });
        _fs.appendFileSync(p, line);
        _health.written++;
        return true;
    } catch (e) { _health.lastError = String((e && e.message) || e).slice(0, 120); return false; }
}

/** Read the corpus back. Bad lines are SKIPPED rather than throwing -- a half-written line from a killed
 *  process must not make the whole record unreadable. */
export function readLessons(file) {
    try {
        if (!_fs) return [];
        const p = file || lessonsPath();
        if (!p || !_fs.existsSync(p)) return [];
        return _fs.readFileSync(p, "utf8").split("\n").filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    } catch { return []; }
}

/**
 * Wrap a watchdog so its EXISTING verdicts are recorded, changing none of them.
 *
 * *** THE WRAPPER RETURNS THE WATCHDOG'S OWN ANSWER, UNTOUCHED. *** watchdog.js decides whether training is
 * healthy; this decides whether the decision is worth writing down. Letting a recorder alter a verdict would
 * make the instrument part of the experiment.
 *
 * Only `reverted-nan` and `stalled-kicked` are written. "ok" and "improving" happen thousands of times per run
 * and record nothing a later run could use -- a corpus that logs every healthy step is a log file, not a
 * lesson, and the noise is what would stop anybody reading it.
 */
export const RECORDED_EVENTS = new Set(["reverted-nan", "stalled-kicked"]);

export function recordingWatchdog(wd, { env, params, iters } = {}) {
    if (!wd || typeof wd.check !== "function") return wd;
    let n = 0;
    // *** ONE PLATEAU IS ONE LESSON, NOT ONE ROW PER KICK -- AND ONLY A REAL RUN SHOWED THAT. ***
    // Forty ES steps on the real dockEnv produced NINE stall records: three at bestScore -127.7566, three at
    // -60.8869, three at -45.2518. The watchdog is behaving correctly -- it re-kicks every `patience` steps
    // while the score sits still -- but those nine rows describe THREE plateaus. A later run grepping this
    // corpus would read nine failures where three happened, and the duplicates carry no information the first
    // row did not: same env, same params, same score. A corpus whose noise scales with run length is one
    // nobody reads twice, which would have made the read step useless for a reason that has nothing to do with
    // retrieval.
    //
    // So consecutive events with the SAME status AND an unchanged bestScore are folded into one pending record
    // that counts them. It is written when the plateau BREAKS (the score moved) or when flush() is called at
    // the end of a run. Append-only means a record cannot be revised after the fact, so it is held until its
    // count is final rather than written early and corrected -- there is nothing to correct it with.
    let pending = null;
    const SAME = (a, b) => (a == null && b == null) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9);

    function write(pnd) {
        if (!pnd) return;
        recordLesson({
            env, event: pnd.event, params, score: pnd.score, iters: pnd.lastIters,
            stats: { ...pnd.stats, repeats: pnd.repeats, firstIters: pnd.firstIters },
            note: pnd.event === "reverted-nan"
                ? "weights went non-finite; watchdog restored the last-good params" +
                  (pnd.repeats > 1 ? " (x" + pnd.repeats + " consecutive)" : "")
                : "no improvement within patience; watchdog re-centred exploration on best-known params" +
                  (pnd.repeats > 1 ? " -- " + pnd.repeats + " consecutive kicks at this plateau" : ""),
        });
    }

    return Object.assign({}, wd, {
        check(...a) {
            const r = wd.check(...a);
            try {
                n++;
                const it = typeof iters === "function" ? iters() : (Number.isFinite(iters) ? iters : n);
                if (r && RECORDED_EVENTS.has(r.status)) {
                    const score = typeof r.best === "number" ? r.best : null;
                    const stats = typeof wd.stats === "function" ? wd.stats() : {};
                    if (pending && pending.event === r.status && SAME(pending.score, score)) {
                        pending.repeats++; pending.lastIters = it; pending.stats = stats;
                    } else {
                        write(pending);
                        pending = { event: r.status, score, stats, repeats: 1, firstIters: it, lastIters: it };
                    }
                } else if (pending && r && (r.status === "improving")) {
                    // The plateau genuinely ended -- write it now rather than waiting for a flush the caller
                    // might never make. A trainer killed mid-run should still leave its finished plateaus behind.
                    write(pending); pending = null;
                }
            } catch { /* instrumentation never breaks the loop it observes */ }
            return r;
        },
        /** Write the plateau still in hand. Callers that finish a run should call this; forgetting costs only
         *  the LAST plateau, never an earlier one. */
        flush() { try { write(pending); pending = null; } catch { } },
    });
}


/**
 * v3969 -- OBSERVE A TRAINER THAT HAS NO WATCHDOG, WHICH IS MOST OF THEM.
 *
 * *** THE CADENCE GAP WAS NOT "NOTHING RUNS ON A TIMER", IT WAS "THE THINGS THAT RUN CONTRIBUTE NOTHING". ***
 * createWatchdog is used in exactly ONE place in this tree -- brain-lab.html, a page a person has to open. The
 * gates that train on every ship round (dock, dock-hazard) call dockPolicy.trainDockES, which has no watchdog
 * at all, so the corpus only grew when somebody happened to open a page. Wiring a scheduler would have been
 * the wrong fix for that: the runs were already happening.
 *
 * This adapts a plain per-iteration callback to the SAME plateau folding recordingWatchdog uses, so a lesson
 * written by a gate and a lesson written by the lab are the same shape and a reader cannot tell which loop
 * produced it. `patience` and `minDelta` mirror watchdog.js's defaults ON PURPOSE -- two definitions of "this
 * has stopped improving" would make the corpus mean two things.
 *
 * @returns {{ onIter: Function, flush: Function }} pass onIter straight to the trainer.
 */
export function watchTraining({ env, params, patience = 8, minDelta = 0.5 } = {}) {
    let bestSeen = -Infinity, since = 0, pending = null;
    const SAME = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;

    function write(p) {
        if (!p) return;
        recordLesson({
            env, event: "stalled-kicked", params, score: p.score, iters: p.lastIt,
            stats: { repeats: p.repeats, firstIters: p.firstIt, source: "trainer-observer" },
            note: "no improvement for " + patience + " iterations at this score" +
                  (p.repeats > 1 ? " -- " + p.repeats + " consecutive stall windows at this plateau" : ""),
        });
    }

    return {
        onIter({ it, bestScore }) {
            const b = Number.isFinite(bestScore) ? bestScore : -Infinity;
            if (b > bestSeen + minDelta) {
                bestSeen = b; since = 0;
                if (pending) { write(pending); pending = null; }   // the plateau genuinely ended
                return;
            }
            since++;
            if (since < patience) return;
            since = 0;
            if (pending && SAME(pending.score, b)) { pending.repeats++; pending.lastIt = it; }
            else { write(pending); pending = { score: b, repeats: 1, firstIt: it, lastIt: it }; }
        },
        flush() { try { write(pending); pending = null; } catch { } },
    };
}


// =====================================================================================================
// THE READ SIDE (v3969)
// =====================================================================================================
//
// *** IT RANKS BY REPEAT COUNT, NOT BY SCORE, AND THAT IS A MEASUREMENT RATHER THAN A PREFERENCE. ***
// v3968 ran three environments and recorded what they produced:
//     dockEnv        plateaus at   -127.8 ..   -45.3
//     dockHazardEnv  plateaus at  -1901.2 .. -1322.9
//     huntEnv        plateaus at    -95.8 ..   -31.9
// The scores are environment-specific reward sums with no shared zero. A reader that sorted lessons by score
// would put every dockHazard lesson above every hunt lesson forever and call it relevance -- IT WOULD BE
// RANKING BY ENVIRONMENT AND REPORTING IT AS IMPORTANCE. The repeat count has no such problem: it counts how
// many consecutive stall windows sat at one plateau, which means the same thing in every environment. Six
// kicks over iters 12-27 is a wall; one kick at iter 7 is a blip; they are indistinguishable by score.
//
// *** AND A LESSON FROM A DIFFERENT ENVIRONMENT IS LABELLED AS SUCH RATHER THAN BLENDED IN. *** Matching
// "dock" against dockEnv and dockHazardEnv is useful -- they share a policy shape and most hyperparameters --
// but a hazard-field stall is not a plain-dock stall, and presenting them as the same finding is how a
// retrieval step starts producing confident nonsense. Exact matches come first and cross-env matches are
// marked.

/** Split an env name into the tokens a related run would match on: dockHazardEnv -> ["dock","hazard"]. */
function _familyTokens(env) {
    return String(env || "").replace(/Env$/, "").replace(/[-_/]/g, " ")
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/\s+/).filter((t) => t.length > 2);
}

/**
 * Lessons relevant to `env`, most instructive first.
 *
 * @returns {{exact: object[], related: object[], total: number, corpus: string}}
 */
export function lessonsFor(env, { limit = 5, minRepeats = 1, file } = {}) {
    const all = readLessons(file);
    const want = String(env || "").toLowerCase();
    const toks = _familyTokens(env);
    const rank = (a, b) => (b.stats?.repeats || 1) - (a.stats?.repeats || 1)
        || (b.stats?.lastIters || b.iters || 0) - (a.stats?.lastIters || a.iters || 0);

    const exact = [], related = [];
    for (const r of all) {
        const e = String(r.env || "").toLowerCase();
        if ((r.stats?.repeats || 1) < minRepeats) continue;
        if (e === want) exact.push(r);
        else if (toks.length && toks.some((t) => e.includes(t))) related.push(r);
    }
    exact.sort(rank); related.sort(rank);
    return { exact: exact.slice(0, limit), related: related.slice(0, limit),
             total: all.length, corpus: file || lessonsPath() };
}

/**
 * One short block a training run can print before its first step.
 *
 * *** AN EMPTY CORPUS SAYS SO, LOUDLY. *** The whole reason the writer was built before the reader is that
 * retrieval against nothing looks identical to retrieval that found nothing relevant, and both look identical
 * to a broken reader. Each of those wants a different response, so each gets a different sentence.
 */
export function lessonsBrief(env, opts = {}) {
    const { exact, related, total, corpus } = lessonsFor(env, opts);
    if (!total) return "[lessons] corpus is empty (" + corpus + ") -- nothing has recorded a stall yet, so this run has no priors to read.";
    if (!exact.length && !related.length) return "[lessons] " + total + " record(s) on file, none matching " + env + " -- this environment has no recorded stalls.";
    const line = (r, tag) => "[lessons]   " + tag + " " + String(r.env).padEnd(15) +
        "plateau " + String(r.score) + " for " + (r.stats?.repeats || 1) + " stall window(s)" +
        " (iters " + (r.stats?.firstIters ?? "?") + "-" + (r.iters ?? "?") + ")" +
        (r.params && Object.keys(r.params).length ? "  params " + JSON.stringify(r.params) : "");
    const out = ["[lessons] " + exact.length + " prior stall(s) for " + env +
                 (related.length ? " and " + related.length + " from related environments" : "") +
                 ", worst-first by how long they held:"];
    for (const r of exact) out.push(line(r, "  "));
    // Marked, never blended: a related environment shares a policy shape, not a reward scale.
    for (const r of related) out.push(line(r, "~ "));
    return out.join("\n");
}
