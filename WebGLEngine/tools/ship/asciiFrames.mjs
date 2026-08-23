// tools/ship/asciiFrames.mjs -- v3775
//
// *** THE DATA HALF OF AN ASCII-VIDEO PIPELINE, AND IT DELIBERATELY OWNS NO GENERATOR.
// Keith asked about stong/gradscii-art (VERIFIED: 261 stars, 8 forks, 27 commits, PyTorch + Pillow,
// **AGPL-3.0**, and the author asks third parties to negotiate for redistribution or SaaS). THAT LICENCE IS
// THE REASON THIS MODULE EXISTS IN THIS SHAPE: it imports TEXT FRAMES that some other program produced and
// has no idea which program that was. Nothing here is derived from gradscii-art, nothing links against it,
// and SweK inherits nothing. If Keith later wants it vendored, that is a LICENCE DECISION and a separate
// round -- this half is useful either way, including with a plain LUT converter or hand-typed frames. ***
//
// *** WHAT IT REFUSES, AND WHY EACH ONE IS THE SILENT KIND:
//   RAGGED LINES -- a frame whose rows are shorter than the declared grid renders FINE in a <pre>. It just
//     looks like art with a soft right edge. NOTHING THROWS, and the reader blames the source video.
//   WRONG ROW COUNT -- a frame with fewer rows plays as a JUMP, which reads as a dropped frame in the source.
//   CONTROL CHARACTERS -- a stray \r or \t silently reflows a monospace grid; \t especially, because it moves
//     everything after it on the line and looks like a rendering bug.
//   A DECLARED COUNT THAT DISAGREES WITH THE ARRAY -- the v3729 shape: a census keyed by a number nobody
//     compared against the thing it counts. ***
//
// *** AND THE ONE MEASUREMENT THAT IS NOT A REFUSAL: CHURN. Frame-independent optimisation FLICKERS -- each
// frame converges to its own local optimum, so characters jump between visually identical frames. churn()
// reports the FRACTION OF CELLS THAT CHANGED between consecutive frames, computed from the text alone with
// nothing rendered. ITS SHARP USE: on a pair of IDENTICAL SOURCE frames churn MUST BE ZERO, and if it is not,
// the generator is flickering rather than the video moving. That is a measurable answer to a question that is
// otherwise a matter of opinion about how the playback "looks". ***

/** The accepted shape: { fps, cols, rows, frames: [string, ...] } -- each frame is rows lines of cols chars. */
export function validateFrames(doc) {
    const errs = [];
    const push = (e) => errs.push(e);
    if (!doc || typeof doc !== "object") return { ok: false, errors: ["document is not an object"], frames: [] };

    const fps = doc.fps;
    if (!Number.isFinite(fps) || fps <= 0 || fps > 240) push("fps must be a number in (0, 240] (got " + JSON.stringify(fps) + ")");
    const cols = doc.cols, rows = doc.rows;
    if (!Number.isInteger(cols) || cols <= 0) push("cols must be a positive integer (got " + JSON.stringify(cols) + ")");
    if (!Number.isInteger(rows) || rows <= 0) push("rows must be a positive integer (got " + JSON.stringify(rows) + ")");
    if (!Array.isArray(doc.frames) || doc.frames.length === 0) push("frames must be a non-empty array");
    if (errs.length) return { ok: false, errors: errs, frames: [] };

    // *** A DECLARED COUNT IS A SECOND DECLARATION AND MUST BE COMPARED, NOT TRUSTED (v3729). It is OPTIONAL --
    // absent is fine -- but present and wrong is an error, because the whole point of stating it is the check. ***
    if (doc.frameCount !== undefined && doc.frameCount !== doc.frames.length) {
        push("frameCount says " + doc.frameCount + " but frames holds " + doc.frames.length);
    }

    const out = [];
    for (let i = 0; i < doc.frames.length; i++) {
        const f = doc.frames[i], at = "frame " + i;
        if (typeof f !== "string") { push(at + ": not a string"); continue; }
        // \r is stripped rather than refused: a file written on Windows is not a malformed file, and the
        // line-ending rules this project already carries say so. \t and other controls ARE refused.
        const body = f.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const lines = body.split("\n");
        // a trailing newline is conventional and harmless -- drop exactly one
        if (lines.length === rows + 1 && lines[lines.length - 1] === "") lines.pop();
        if (lines.length !== rows) { push(at + ": has " + lines.length + " rows, declared " + rows); continue; }
        let bad = null;
        for (let r = 0; r < lines.length; r++) {
            if (lines[r].length !== cols) { bad = at + ": row " + r + " is " + lines[r].length + " chars, declared " + cols +
                " -- A SHORT ROW RENDERS FINE IN A <pre> AND JUST LOOKS LIKE A SOFT RIGHT EDGE"; break; }
            if (/[\t\v\f\u0000-\u0008\u000e-\u001f]/.test(lines[r])) {
                bad = at + ": row " + r + " contains a control character -- a tab silently reflows a monospace grid"; break;
            }
        }
        if (bad) { push(bad); continue; }
        out.push(lines);
    }
    return { ok: errs.length === 0, errors: errs, frames: out };
}

/** @returns {{ ok, errors, fps, cols, rows, count, durationSec, frames }} */
export function importFrames(doc) {
    const v = validateFrames(doc);
    if (!v.ok) return { ok: false, errors: v.errors, frames: [], count: 0, durationSec: null };
    return { ok: true, errors: [], fps: doc.fps, cols: doc.cols, rows: doc.rows,
             count: v.frames.length, durationSec: v.frames.length / doc.fps, frames: v.frames };
}

/**
 * *** THE FLICKER MEASUREMENT. Fraction of grid cells that differ between consecutive frames.
 * Returned per-pair AND as a mean, because a mean alone hides a single catastrophic frame. ***
 */
export function churn(frames) {
    if (!Array.isArray(frames) || frames.length < 2) return { pairs: [], mean: null, worst: null };
    const pairs = [];
    for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1], b = frames[i];
        let diff = 0, total = 0;
        for (let r = 0; r < Math.min(a.length, b.length); r++) {
            const la = a[r], lb = b[r];
            for (let c = 0; c < Math.min(la.length, lb.length); c++) { total++; if (la[c] !== lb[c]) diff++; }
        }
        pairs.push(total > 0 ? diff / total : 0);
    }
    return { pairs, mean: pairs.reduce((x, y) => x + y, 0) / pairs.length, worst: Math.max(...pairs) };
}

/**
 * *** THE SHARP USE OF CHURN, AND IT IS A BINARY: on frames that are IDENTICAL IN THE SOURCE, churn MUST BE
 * ZERO. Anything above zero means the GENERATOR moved, not the video -- which is exactly the frame-independent
 * flicker a per-frame optimiser produces. This does not need the source: it needs two frames the CALLER knows
 * were the same, which a still section of any clip provides. ***
 */
export function flickerOnStill(frames) {
    const c = churn(frames);
    if (c.mean === null) return { stable: null, why: "need at least two frames" };
    return { stable: c.worst === 0, worstChurn: c.worst, meanChurn: c.mean,
             why: c.worst === 0 ? "identical frames produced identical text"
                : "identical source frames differ in " + (100 * c.worst).toFixed(1) + "% of cells -- THE GENERATOR IS FLICKERING" };
}

// v3900 -- GUARDED. This module is loaded by a PAGE as well as run as a CLI, and `process` at module
// top level is a ReferenceError in a browser -- not a caught failure, an EVALUATION failure, so the
// whole module fails to load and every import of it dies with it. browserSafety-selfcheck caught this
// on Keith's rig; the guard is the tree's existing idiom (physics/mpm/step.mjs and three siblings).
// v3941 -- SEPARATOR-TOLERANT AND ANCHORED. `split("/")` returns THE WHOLE PATH on Windows, so this
// guard was false and the block below never ran there. The leading "/" matters too: without it
// `.../loopScope.mjs`.endsWith("Scope.mjs") is true, and a sibling could wake somebody else's main
// block. THIS FILE MAY NOT IMPORT node:url -- a browser page imports it -- so a basename compare is
// the strongest form available here, and winPathGuard re-derives that exemption rather than trusting it.
if (typeof process !== "undefined" && process.argv[1] && import.meta.url.endsWith("/" + process.argv[1].split(/[\\/]/).pop())) {
    const mk = (ch, cols, rows) => Array.from({ length: rows }, () => ch.repeat(cols)).join("\n");
    const good = importFrames({ fps: 12, cols: 8, rows: 3, frames: [mk(".", 8, 3), mk("#", 8, 3)] });
    console.log("[asciiFrames] 2 frames at 12 fps -> ok=" + good.ok + "  duration " + good.durationSec.toFixed(3) + "s");
    console.log("[asciiFrames] churn between them: " + (100 * churn(good.frames).mean).toFixed(1) + "% of cells");
    const still = importFrames({ fps: 12, cols: 8, rows: 3, frames: [mk(".", 8, 3), mk(".", 8, 3)] });
    console.log("[asciiFrames] two IDENTICAL frames -> " + flickerOnStill(still.frames).why);
    const ragged = importFrames({ fps: 12, cols: 8, rows: 3, frames: [mk(".", 7, 3)] });
    console.log("[asciiFrames] a short row -> ok=" + ragged.ok + "\n              " + ragged.errors[0]);
}
