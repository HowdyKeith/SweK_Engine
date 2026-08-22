// FILE: debug/frameProfiler.js
// VERSION: v1 — round 309
//
// Section-level frame profiler. Lets you find which part of the main
// game loop is eating CPU when FPS is low.
//
// Why this is more useful than _fpsProfile (round 306):
//   _fpsProfile samples external frame INTERVALS via requestAnimationFrame
//   — it tells you "FPS is slow" but not WHY. This profiler instruments
//   the main loop's major sections (kaijuManager.tick, render,
//   civLoop.update, etc.) and reports per-section mean/total/max time,
//   so the offender is named explicitly.
//
// Usage:
//   await window._frameProf.start(5)   // measure for 5 sec
//   // ...returns automatically, prints report
//   window._frameProf.report()         // re-print last report
//   window._frameProf.reset()          // clear data
//
// Cost when disabled: two property reads per profSection call. The
// `_active` boolean gate is checked first; when false, function returns
// immediately without map access or performance.now() call. Negligible
// production overhead — leaving instrumentation in place is fine.

// Module state
const _sectionTimes = new Map();   // name → { totalMs, calls, maxMs }
let _active = false;
let _startTimes = new Map();        // name → t0 for in-flight sections
let _windowStartT = 0;
let _windowEndT = 0;
let _frameCount = 0;
let _lastReport = null;

// =============================================================================
// Public API for instrumented code (in main.js loop)
// =============================================================================

/**
 * Mark the start of a named section. Cheap no-op when profiler is off.
 */
export function profStart(name) {
    if (!_active) return;
    _startTimes.set(name, performance.now());
}

/**
 * Mark the end of a named section. Cheap no-op when profiler is off.
 * Pairs with a prior profStart(name).
 */
export function profEnd(name) {
    if (!_active) return;
    const t0 = _startTimes.get(name);
    if (t0 === undefined) return;
    const dt = performance.now() - t0;
    let rec = _sectionTimes.get(name);
    if (!rec) {
        // Round 318 — durations[] tracks per-call timings so we can
        // compute median/p95/max distribution at report time. The mean
        // alone hides spike pathology — at 21 frames sampled, one bad
        // frame at 600ms drags the mean up by 30ms and FPS looks
        // worse than it is.
        rec = { totalMs: 0, calls: 0, maxMs: 0, durations: [] };
        _sectionTimes.set(name, rec);
    }
    rec.totalMs += dt;
    rec.calls++;
    if (dt > rec.maxMs) rec.maxMs = dt;
    // Cap stored durations to keep memory bounded on long profiles.
    // For 5s @ 60fps that's 300 entries; 60s @ 60fps would be 3600 ×
    // ~30 sections = 100K entries. Cap each at 600 (~10s of 60fps).
    if (rec.durations.length < 600) rec.durations.push(dt);
}

/**
 * Mark the start of a new frame. Used to count total frames in window.
 */
export function profFrame() {
    if (!_active) return;
    _frameCount++;
}

// =============================================================================
// Console-side API
// =============================================================================

/**
 * Round 318 — compute a percentile from a sorted (or unsorted) duration
 * array. Linear interpolation between samples. Returns 0 for empty arrays.
 * P50 = median, P95 = "spike but not worst", P99 = near-worst-case.
 */
function _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function _start(seconds = 5) {
    return new Promise((resolve) => {
        if (_active) {
            console.warn("[_frameProf] already profiling — call .stop() first");
            resolve(null);
            return;
        }
        _sectionTimes.clear();
        _startTimes.clear();
        _frameCount = 0;
        _windowStartT = performance.now();
        // Round 316 — reset entityPerf cumulative counters so the
        // averages we report are constrained to this sample window
        // (not a session-lifetime average).
        if (typeof window !== "undefined" && window.entityPerf?.resetCumulative) {
            window.entityPerf.resetCumulative();
        }
        _active = true;
        console.log(`[_frameProf] sampling for ${seconds}s...`);
        setTimeout(() => {
            _active = false;
            _windowEndT = performance.now();
            _report();
            resolve(_lastReport);
        }, seconds * 1000);
    });
}

function _stop() {
    if (!_active) {
        console.warn("[_frameProf] not active");
        return;
    }
    _active = false;
    _windowEndT = performance.now();
    _report();
}

function _report() {
    const totalMs = _windowEndT - _windowStartT;
    const frames = _frameCount;
    const avgFrameMs = frames > 0 ? totalMs / frames : 0;
    const avgFps = frames > 0 ? frames / (totalMs / 1000) : 0;

    console.group("[_frameProf] section breakdown");
    console.log(`Window: ${totalMs.toFixed(0)}ms, ${frames} frames, avg ${avgFrameMs.toFixed(1)}ms/frame (${avgFps.toFixed(1)} FPS)`);
    if (frames === 0) {
        console.warn("No frames sampled");
        console.groupEnd();
        return;
    }

    // Round 314 — distinguish "wrapper" sections (which include other
    // sections inside them) from "leaf" sections. Wrappers double-count
    // their inner sections; we exclude them from the leaf-sum to keep
    // the inner-gap calculation accurate.
    //
    // Round 316 — added "render.entities" since v315 split it into
    // entities.rigged + entities.batched inside the renderer.
    const WRAPPER_NAMES = new Set(["wholeLoopBody", "render.entities"]);

    // Sort sections by total time descending. Round 317 — pctFrame
    // is now per-FRAME (totalMs / frames) / avgFrameMs, not per-CALL.
    // The old per-call math understated sections that fire many times
    // per frame (entities.batched fires once per asset group, ~7
    // calls/frame; per-call was 5.5ms = "2.7%" but per-frame it's
    // ~39ms = ~19% of a 205ms frame).
    const rows = [];
    for (const [name, rec] of _sectionTimes) {
        const perFrameMs = frames > 0 ? rec.totalMs / frames : 0;
        rows.push({
            section: name,
            calls: rec.calls,
            totalMs: rec.totalMs,
            meanMs: rec.totalMs / rec.calls,        // per-call mean (display only)
            perFrameMs,                             // per-frame mean (drives pctFrame)
            maxMs: rec.maxMs,
            pctFrame: avgFrameMs > 0 ? perFrameMs / avgFrameMs * 100 : 0,
            isWrapper: WRAPPER_NAMES.has(name),
        });
    }
    rows.sort((a, b) => b.totalMs - a.totalMs);

    // Pretty-print as table (DevTools-rich view)
    console.table(rows.map(r => ({
        section: r.section + (r.isWrapper ? " (wrapper)" : ""),
        calls: r.calls,
        "ms/call":  r.meanMs.toFixed(2),
        "ms/frame": r.perFrameMs.toFixed(2),
        "max ms":   r.maxMs.toFixed(1),
        "total ms": r.totalMs.toFixed(0),
        "% of frame": r.pctFrame.toFixed(1) + "%",
    })));

    // Round 314 — emit a plain-text version of the top sections so that
    // /copy in the in-engine console grabs the data. console.table by
    // itself doesn't always render as text in the log buffer.
    // Round 317 — columns are now ms/frame (per-frame mean) and max,
    // since per-call mean was misleading for sections that fire many
    // times per frame.
    console.log("[_frameProf] TEXT SUMMARY (ms/frame · max ms · % of frame):");
    const summaryRows = rows.slice(0, 12);    // top 12 only
    for (const r of summaryRows) {
        const label = (r.section + (r.isWrapper ? " (wrapper)" : "")).padEnd(28);
        const perFrame = r.perFrameMs.toFixed(2).padStart(7);
        const max  = r.maxMs.toFixed(1).padStart(7);
        const pct  = (r.pctFrame.toFixed(1) + "%").padStart(7);
        console.log(`  ${label} ${perFrame}  ${max}  ${pct}`);
    }
    if (rows.length > summaryRows.length) {
        console.log(`  ... and ${rows.length - summaryRows.length} more sections (use console.table in DevTools)`);
    }

    // Round 314 — two meaningful gaps:
    //  1. outsideBodyMs  = totalFrame - wholeLoopBody (≈ GPU stall, vsync, composite)
    //  2. innerGapMs     = wholeLoopBody - Σ(leaf sections)
    //
    // Round 317 — wholeBodyMs uses ONLY wholeLoopBody.totalMs. The
    // v316 code summed all wrappers (wholeLoopBody + render.entities),
    // which double-counted since render.entities is nested INSIDE
    // wholeLoopBody. The fix is to single out the top-level wrapper.
    // (We never have two parallel wrappers — wholeLoopBody wraps the
    // entire frame body.)
    let leafSumMs = 0;
    let wholeBodyMs = 0;
    for (const r of rows) {
        if (r.section === "wholeLoopBody") {
            wholeBodyMs = r.totalMs;
        } else if (!r.isWrapper) {
            // entities.rigged / entities.batched are leaves; their
            // parent render.entities is a wrapper and we count its
            // total time implicitly via wholeLoopBody. Leaf-sum here
            // intentionally excludes BOTH wrappers since both are
            // double-counts of leaves.
            leafSumMs += r.totalMs;
        }
    }
    const outsideBodyMs = totalMs - wholeBodyMs;
    const outsidePct = totalMs > 0 ? (outsideBodyMs / totalMs * 100) : 0;
    const innerGapMs = wholeBodyMs - leafSumMs;
    const innerGapPct = wholeBodyMs > 0 ? (innerGapMs / wholeBodyMs * 100) : 0;
    const perFrameWholeBody = frames > 0 ? wholeBodyMs / frames : 0;
    const perFrameLeafSum   = frames > 0 ? leafSumMs   / frames : 0;
    const perFrameOutside   = frames > 0 ? outsideBodyMs / frames : 0;
    const perFrameInnerGap  = frames > 0 ? innerGapMs / frames : 0;

    console.log(
        `[_frameProf] BUDGET — per-frame averages (target ≤16ms for 60fps):\n` +
        `  total frame:           ${avgFrameMs.toFixed(1)}ms (${avgFps.toFixed(1)} FPS)\n` +
        `  wholeLoopBody (JS):    ${perFrameWholeBody.toFixed(1)}ms\n` +
        `  outside body (GPU…):   ${perFrameOutside.toFixed(1)}ms (${outsidePct.toFixed(0)}% of frame)\n` +
        `  leaf sections sum:     ${perFrameLeafSum.toFixed(1)}ms\n` +
        `  inner gap (unnamed):   ${perFrameInnerGap.toFixed(1)}ms (${innerGapPct.toFixed(0)}% of body)`
    );

    // Round 318 — frame-time distribution. With 21 frames sampled the
    // mean is heavily skewed by 1-2 outlier frames. Median tells you
    // the steady-state cost; p95 tells you "bad but not worst"; max
    // is the catastrophic spike. If median is much lower than mean,
    // the engine isn't fundamentally slow — it just has outlier
    // frames (GC, Ollama bursts, asset uploads) dragging the average.
    const wholeRec = _sectionTimes.get("wholeLoopBody");
    if (wholeRec && wholeRec.durations.length >= 3) {
        const ds = wholeRec.durations;
        const p50 = _percentile(ds, 0.50);
        const p95 = _percentile(ds, 0.95);
        const min = Math.min(...ds);
        const max = wholeRec.maxMs;
        // FPS implied by median frame (steady state, no spikes)
        // We need the FULL frame time at the median; outside-body
        // varies but we approximate using average outside time.
        const approxOutsidePerFrame = frames > 0 ? outsideBodyMs / frames : 0;
        const medianFrameMs = p50 + approxOutsidePerFrame;
        const medianFps = medianFrameMs > 0 ? 1000 / medianFrameMs : 0;
        console.log(
            `[_frameProf] wholeLoopBody DISTRIBUTION (JS only, ${ds.length} samples):\n` +
            `  min:    ${min.toFixed(1)}ms\n` +
            `  p50 (median): ${p50.toFixed(1)}ms\n` +
            `  mean:   ${perFrameWholeBody.toFixed(1)}ms ${perFrameWholeBody > p50 * 1.3 ? "← inflated by spikes" : ""}\n` +
            `  p95:    ${p95.toFixed(1)}ms\n` +
            `  max:    ${max.toFixed(1)}ms\n` +
            `  steady-state estimate: ~${medianFrameMs.toFixed(0)}ms/frame (~${medianFps.toFixed(1)} FPS) at median`
        );
    }

    // Top suspects
    if (rows.length > 0) {
        const top = rows.find(r => !r.isWrapper);    // skip wrapper for "top section"
        if (top && top.meanMs > avgFrameMs * 0.2) {
            console.warn(`⚠ Top leaf section "${top.section}" using ${top.pctFrame.toFixed(0)}% of frame budget. Consider profiling further.`);
        }
        const slowSections = rows.filter(r => !r.isWrapper && r.maxMs > 50);
        if (slowSections.length > 0) {
            console.warn(`⚠ ${slowSections.length} leaf section(s) had spikes >50ms: ${slowSections.map(r => r.section).join(", ")}`);
        }
        if (perFrameOutside > 30) {
            console.warn(`⚠ Significant outside-body time (${perFrameOutside.toFixed(0)}ms/frame). GPU/composite/vsync is contributing — consider reducing shadow resolution, bloom, or overlay canvases.`);
        }
        if (perFrameInnerGap > 30) {
            console.warn(`⚠ Significant inner gap (${perFrameInnerGap.toFixed(0)}ms/frame uninstrumented inside JS body). Add more profStart/profEnd to narrow it down.`);
        }
    }

    _lastReport = {
        totalMs, frames, avgFrameMs, avgFps,
        sections: rows,
        wholeBodyMs, leafSumMs, outsideBodyMs, innerGapMs,
        perFrameWholeBody, perFrameLeafSum, perFrameOutside, perFrameInnerGap,
    };

    // Round 316 — read cumulative stats accumulated during the
    // profile window. Falls back to per-frame stats if cumulative
    // bucket isn't available (old entityPerf without it).
    if (typeof window !== "undefined" && window.entityPerf?.snapshot) {
        const ep = window.entityPerf.snapshot();
        const cum = ep.cumulative ?? ep;
        const fc = Math.max(1, cum.framesCounted || 1);
        console.log(
            `[_frameProf] ENTITY PERF — ` +
            `${(cum.totalEntities / fc).toFixed(0)} avg/frame seen, ` +
            `frustum-cull ${(cum.culledFrustum / fc).toFixed(0)}, ` +
            `far-cull ${(cum.culledFar / fc).toFixed(0)}, ` +
            `drew rigged ${(cum.drewRigged / fc).toFixed(0)} + ` +
            `batched ${(cum.drewNonRigged / fc).toFixed(0)} | ` +
            `anim updates ${(cum.animatorUpdates / fc).toFixed(0)} / ` +
            `skips ${(cum.animatorSkips / fc).toFixed(0)} ` +
            `(thresh far=${ep.farCullDistance}m, frust=${ep.frustumCull ? "on" : "off"})`
        );
    }

    console.groupEnd();
}

function _reset() {
    _sectionTimes.clear();
    _startTimes.clear();
    _frameCount = 0;
    _lastReport = null;
    console.log("[_frameProf] reset");
}

// v376 — Live sampling for the perf dashboard. enableLive() turns the
// profiler on with no auto-timeout; snapshot() returns a frozen copy
// of the current accumulator without resetting it.
function _enableLive() {
    if (_active) {
        console.warn("[_frameProf] already active");
        return;
    }
    _sectionTimes.clear();
    _startTimes.clear();
    _frameCount = 0;
    _windowStartT = performance.now();
    _active = true;
}

function _disableLive() {
    if (!_active) return;
    _active = false;
    _windowEndT = performance.now();
}

function _snapshot() {
    // Shallow copy of section accumulator + frame count + window bounds.
    // dashboard reads this, diffs against previous snapshot, and shows
    // per-second deltas.
    const sections = {};
    for (const [name, rec] of _sectionTimes) {
        sections[name] = {
            totalMs: rec.totalMs,
            calls:   rec.calls,
            maxMs:   rec.maxMs,
            // durations array intentionally NOT cloned — too heavy. The
            // dashboard reads totals + calls and computes its own
            // ring-buffer-based recent averages.
        };
    }
    return {
        active: _active,
        sections,
        frames: _frameCount,
        windowStartT: _windowStartT,
        nowT: performance.now(),
    };
}

function _clearAccumulator() {
    // Reset counters but keep sampling on. Used by the dashboard after
    // each pull so totals don't grow unbounded.
    _sectionTimes.clear();
    _startTimes.clear();
    _frameCount = 0;
    _windowStartT = performance.now();
}

if (typeof window !== "undefined") {
    window._frameProf = {
        start: _start,
        stop:  _stop,
        report: () => _lastReport ? _report() : console.warn("[_frameProf] no data — call .start(seconds) first"),
        reset: _reset,
        isActive: () => _active,
        // v376 — live-sampling API for the perf dashboard
        enableLive:        _enableLive,
        disableLive:       _disableLive,
        snapshot:          _snapshot,
        clearAccumulator:  _clearAccumulator,
    };
    console.log("[frameProfiler] window._frameProf ready — try await window._frameProf.start(5)");
}
