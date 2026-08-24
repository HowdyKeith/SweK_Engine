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
