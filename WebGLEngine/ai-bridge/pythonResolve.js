// WebGLEngine/ai-bridge/pythonResolve.js -- v3948
//
// ONE PLACE THAT KNOWS HOW TO FIND A PYTHON THAT ACTUALLY RUNS.
//
// *** FOUR BRIDGES RESOLVED PYTHON AND ONLY ONE OF THEM CHECKED THE ANSWER. *** cellTrackingBridge.js earned
// the rule at v1834 and wrote it down: "On Windows, a bare `python` / `python3` usually hits the Microsoft Store
// app-execution-alias STUB, which prints 'Python was not found...' and exits 9009 -- it isn't a real
// interpreter." It then PROBES each candidate and accepts only one that prints a real version.
//
// agentReachBridge.js, autoInstall.js and camoufoxBridge.js all pick an interpreter by NAME and hand it back
// unverified -- three copies carrying exactly the bug the fourth had already diagnosed, in the same directory.
// Measured: `grep -c PYOK` over the four is 0, 0, 0, 3.
//
// This is that probe, extracted, so a fifth caller cannot repeat it a fifth time -- the same argument
// tools/ship/playwrightResolve.mjs makes about a stale browser path, and the same one this tree keeps re-earning.
//
// WHAT IS DELIBERATELY *NOT* UNIFIED: which interpreter each caller WANTS. camoufoxBridge wants its own venv,
// agentReachBridge wants ComfyUI's embedded python, and those are different questions with different right
// answers. Callers pass their own candidates in; what they share is "does this thing actually run", which is
// the half that was being got wrong.
"use strict";
const fs = require("fs");
const { execFileSync } = require("child_process");

const IS_WIN = process.platform === "win32";

/**
 * The default search order. VOXEL_VENV_PY first because an explicit choice must win over discovery; then the
 * Windows `py` launcher, which is the reliable one there precisely BECAUSE it is not the Store alias.
 */
function candidates() {
    const out = [];
    const v = process.env.VOXEL_VENV_PY;
    if (v && fs.existsSync(v)) out.push({ cmd: v, base: [] });
    if (IS_WIN) {
        out.push({ cmd: "py", base: ["-3"] });
        out.push({ cmd: "py", base: [] });
        out.push({ cmd: "python", base: [] });
        out.push({ cmd: "python3", base: [] });
    } else {
        out.push({ cmd: "python3", base: [] });
        out.push({ cmd: "python", base: [] });
    }
    return out;
}

/**
 * *** THE WHOLE POINT OF THE MODULE. *** A name on PATH is not an interpreter: it is asked to print something
 * only a real one can print. The Store stub prints its own "not found" text and exits 9009, which fs.existsSync
 * and a bare spawn both read as success.
 */
function verify(cand) {
    if (!cand || !cand.cmd) return false;
    try {
        const out = String(execFileSync(cand.cmd, [...(cand.base || []), "-c", "import sys;print('PYOK',sys.version.split()[0])"],
            { timeout: 8000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }));
        return /PYOK\s+\d+\.\d+/.test(out);
    } catch { return false; }
}

/** The verified version string, or "" -- so a caller can report WHICH python it got rather than that it got one. */
function version(cand) {
    if (!cand || !cand.cmd) return "";
    try {
        const out = String(execFileSync(cand.cmd, [...(cand.base || []), "-c", "import sys;print('PYOK',sys.version.split()[0])"],
            { timeout: 8000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }));
        return (out.match(/PYOK\s+(\d+\.\d+\.\d+)/) || out.match(/PYOK\s+(\d+\.\d+)/) || ["", ""])[1];
    } catch { return ""; }
}

let _cached = null;
/**
 * First candidate that actually runs, cached. Pass `extra` to put caller-specific interpreters (a venv, an
 * embedded python) AHEAD of the general search without this module having to know why they exist.
 */
function resolve(extra) {
    if (_cached && !extra) return _cached;
    const list = [...(Array.isArray(extra) ? extra : []), ...candidates()];
    for (const cand of list) if (verify(cand)) { if (!extra) _cached = cand; return cand; }
    return null;
}

/** A printable command, for log lines and for telling a user what to install against. */
function label(cand) { return cand ? [cand.cmd, ...(cand.base || [])].join(" ") : (IS_WIN ? "py -3" : "python3"); }

module.exports = { IS_WIN, candidates, verify, version, resolve, label, _reset: () => { _cached = null; } };
