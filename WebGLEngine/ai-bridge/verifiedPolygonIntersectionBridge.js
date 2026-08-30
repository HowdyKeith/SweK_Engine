// WebGLEngine/ai-bridge/verifiedPolygonIntersectionBridge.js -- v4143
//
// AN INSTALL BUTTON FOR schildep/verified-polygon-intersection -- A LEAN4-VERIFIED MULTIPOLYGON INTERSECTION
// DEMO -- WHERE NOTHING OF THEIRS EVER ENTERS THIS TREE.
//
// Keith pointed at the repo, same as grdpwasm before it. Same v4124 reasoning holds for MIT here even more
// simply than it did for grdpwasm's GPL-3.0: MIT places essentially no restriction beyond keeping the notice,
// so there is no copyleft question to answer at all -- only the ordinary discipline this tree already applies
// to every install button: fetch onto the user's own machine, outside the tree, pinned, credited, never
// vendored into a release zip.
//
// *** THIS ONE IS LOWER RISK THAN grdpwasm OR galaxy-profile, AND THAT IS MEASURED, NOT ASSUMED. *** grdpwasm
// builds and RUNS a Go binary that opens a real listening socket a caller can point at arbitrary hosts.
// galaxy-profile runs a Python subprocess. This repo's docs/ folder is FOUR STATIC FILES -- index.html,
// coi-serviceworker.min.js, lean_app.js, lean_app.wasm -- the exact prebuilt output GitHub Pages already
// serves at schildep.github.io/verified-polygon-intersection. There is no build step (no Lean toolchain, no
// emscripten -- those only matter to someone rebuilding the WASM from source, which nobody here does), no
// subprocess to spawn, no port of its own to bind, and no place for a caller to inject a target the way
// grdpwasm's `target` query parameter could. It is downloaded and served, nothing more.
//
// *** AND THEN I READ WHY IT USES A SERVICE WORKER, WHICH IS WHY THIS BRIDGE SETS HEADERS ITSELF INSTEAD. ***
// build.sh's emcc invocation (and emcc-wasm.sh's wrapper) both pass -pthread, which means the WASM needs
// SharedArrayBuffer, which browsers only hand out to a CROSS-ORIGIN-ISOLATED page (real Cross-Origin-Opener-
// Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp response headers on the top document).
// index.html's own comment explains coi-serviceworker.min.js exists because "GitHub Pages can't set HTTP
// headers" -- a service worker is upstream's workaround for hosting somewhere that can't set real ones. WE
// CAN: ai-bridge/server.js sets both headers directly on the served index.html response (see the /vpi/app
// route), which is strictly more robust than a service worker (nothing to register, nothing that can silently
// fail to activate before first paint) and needs no change to their files at all -- coi-serviceworker.min.js
// still ships and still runs; it is simply redundant here rather than load-bearing.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const REPO = "https://github.com/schildep/verified-polygon-intersection";
// Measured 2026-08-29 by cloning upstream unshallowed: 2 commits total, ONE branch (main), no tags.
const PINNED_COMMIT = "26f5110a5b22cd1493d6a0ec5ce106f1e10cac1e";
const DEFAULT_BRANCH = "main";
const LICENSE = "MIT";

const UPSTREAM = Object.freeze({
    repo: REPO,
    commit: PINNED_COMMIT,
    branch: DEFAULT_BRANCH,
    committed: "2026-05-30",
    license: LICENSE,
    licenseVerified: "2026-08-29 -- LICENSE fetched from the main branch and read: 1067 bytes, MIT License, " +
                     "\"Copyright (c) 2026 P Schilde\". Not inferred from a badge.",
    what: "a formally verified multipolygon intersection algorithm: the intersection logic and its correctness " +
          "proof are written and machine-checked in Lean 4, compiled to WebAssembly via Emscripten, with a " +
          "browser demo you draw two multipolygons on and see the Lean-proved intersection computed live",
    author: "P Schilde (schildep)",
    verification: "trust in the algorithm's correctness comes from the Lean 4 checker and human review of a " +
                   "small specification file, not from the LLM that (per the repo's own README/CLAUDE.md) " +
                   "helped write the implementation and proofs -- this bridge does not re-verify that claim, " +
                   "it only fetches and serves the files upstream already built and publishes at " +
                   "schildep.github.io/verified-polygon-intersection",
});

const MAINTENANCE = Object.freeze({
    commits: 2,
    tags: 0,
    branches: ["main"],
    lastCommit: "2026-05-30",
    howChecked: "git clone (unshallowed) " + REPO + ", then git rev-list --count / git branch -r / git tag",
});

const REFUSED = Object.freeze([
    { what: "vendoring the repo's source (Lean, C, the build scripts) into this tree or a release zip",
      why: "only the FOUR PREBUILT STATIC FILES GitHub Pages already serves are ever fetched -- index.html, " +
           "coi-serviceworker.min.js, lean_app.js, lean_app.wasm -- onto the user's own machine, outside the " +
           "tree, exactly as grdpwasm and galaxy-profile's checkouts are. Nothing of theirs is imported into " +
           "this engine's own process." },
    { what: "rebuilding the WASM from source",
      why: "that needs the Lean 4 toolchain (elan, lake) plus emscripten, zstd and wasm-opt -- a large, slow " +
           "install for a demo whose already-built output is what GitHub Pages itself serves. Fetching the " +
           "same bytes GitHub Pages serves, pinned to a reviewed commit, is the honest shortcut: it is not a " +
           "different artifact, it is the SAME one, fetched rather than reproduced." },
    { what: "patching their JS/WASM to remove the service worker or otherwise modify their code",
      why: "coi-serviceworker.min.js is left exactly as shipped. This bridge gets the same cross-origin-" +
           "isolation effect a different way -- real response headers on ai-bridge's own /vpi/app route -- " +
           "without touching a single byte of upstream's files. If the header approach and the service worker " +
           "ever disagree, upstream's files are still the ones served; only server.js's headers are ours." },
    { what: "running any commit other than the pinned one without a deliberate edit here",
      why: "these are files that get EXECUTED (WASM) in a real browser. Fetching whatever main's tip currently " +
           "holds means upstream's next push runs unreviewed on a real machine tomorrow. PINNED_COMMIT only " +
           "moves when this file is edited to move it, same discipline as every other install button here." },
]);

// Overridable for the gate, same convention as grdpwasmBridge's GRDPWASM_SRC_DIR.
const SRC_DIR = process.env.VPI_SRC_DIR || path.join(os.homedir(), ".voxelbridge", "verified-polygon-intersection");

// The exact four files docs/ holds at the pinned commit, and their real sizes (measured by cloning), so a
// truncated or corrupted fetch is caught by more than "the file exists".
const ARTEFACTS = Object.freeze([
    { rel: "index.html", minBytes: 15000 },
    { rel: "coi-serviceworker.min.js", minBytes: 2000 },
    { rel: "lean_app.js", minBytes: 60000 },
    { rel: "lean_app.wasm", minBytes: 900000 },
]);

function _rawUrl(rel) {
    return "https://raw.githubusercontent.com/schildep/verified-polygon-intersection/" + PINNED_COMMIT + "/docs/" + rel;
}

// *** WHY curl AND NOT NODE'S BUILT-IN https MODULE. *** Measured, not assumed: a first draft used
// require("https").get() directly and it failed on this box with "socket connection was closed unexpectedly"
// -- this sandbox routes outbound HTTPS through an agent proxy (HTTPS_PROXY is set in the environment), and
// Node's own http/https modules have never honored HTTP_PROXY/HTTPS_PROXY -- that is a Node-wide gap, not
// something specific to this box. A REAL corporate/office network behind its own proxy would hit the exact
// same silent failure. curl DOES read those env vars (confirmed here: curl -sS on the same URL succeeded,
// 17182 bytes, exact match), and every install script in this tree already shells out to curl for downloads
// (install-mac.sh, install-steamdeck.sh's Bun/Node install lines) -- this is the established, portable tool,
// not a workaround bolted on for one sandbox.
function _fetchToFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const tmp = destPath + ".part";
        execFile("curl", ["-fsSL", "--max-time", "30", "-o", tmp, url], { windowsHide: true }, (err) => {
            if (err) { try { fs.unlinkSync(tmp); } catch {} reject(new Error("curl failed for " + url + ": " + ((err && err.message) || err))); return; }
            try { fs.renameSync(tmp, destPath); resolve(); } catch (e) { reject(e); }
        });
    });
}

let _job = null; // one install job at a time

function _appendLog(s) { if (_job) { _job.log.push(s); if (_job.log.length > 400) _job.log.shift(); } }

/** Every artefact, checked by EXISTENCE AND SIZE rather than by a fetch's own reported success. */
function built() {
    return ARTEFACTS.every((a) => {
        try { return fs.statSync(path.join(SRC_DIR, a.rel)).size >= a.minBytes; }
        catch { return false; }
    });
}

/**
 * Fetch the four pinned static files. Returns as soon as the job STARTS; the panel polls installStatus(),
 * the same fire-and-poll shape grdpwasmBridge/galaxyProfileBridge use, even though this finishes in seconds --
 * consistency with the front-end polling loop matters more than shaving a round trip off a sub-second job.
 */
function install() {
    if (_job && !_job.done) return { ok: false, error: "an install is already running", job: installStatus().job };
    _job = { kind: "fetch", log: [], done: false, code: null, startedAt: Date.now() };
    try { fs.mkdirSync(SRC_DIR, { recursive: true }); } catch (e) {
        _job.done = true; _job.code = -1; _appendLog("[install] could not create " + SRC_DIR + ": " + ((e && e.message) || e) + "\n");
        return { ok: true, started: true, srcDir: SRC_DIR };
    }
    _appendLog("[install] fetching 4 files from raw.githubusercontent.com at pinned commit " + PINNED_COMMIT.slice(0, 12) + "...\n");
    (async () => {
        for (const a of ARTEFACTS) {
            const url = _rawUrl(a.rel);
            _appendLog("[install]   " + a.rel + " <- " + url + "\n");
            try {
                await _fetchToFile(url, path.join(SRC_DIR, a.rel));
                const size = fs.statSync(path.join(SRC_DIR, a.rel)).size;
                _appendLog("[install]   " + a.rel + " -- " + size + " bytes" + (size >= a.minBytes ? "" : " -- SMALLER THAN EXPECTED (min " + a.minBytes + ")") + "\n");
            } catch (e) {
                _job.done = true; _job.code = -1;
                _appendLog("[install] FAILED fetching " + a.rel + ": " + ((e && e.message) || e) + "\n");
                return;
            }
        }
        _job.done = true;
        _job.code = built() ? 0 : -1;
        if (_job.code !== 0) _appendLog("[install] all fetches completed but built() still reports missing/undersized artefacts\n");
        else _appendLog("[install] done -- all 4 files present at expected size\n");
    })();
    return { ok: true, started: true, srcDir: SRC_DIR };
}

function installStatus() {
    if (!_job) return { ok: true, job: null };
    return { ok: true, job: { kind: _job.kind, done: _job.done, code: _job.code,
                              ms: Date.now() - _job.startedAt, log: _job.log.join("").slice(-8000) } };
}

function status() {
    return {
        ok: true,
        srcDir: SRC_DIR,
        built: built(),
        missingArtefacts: ARTEFACTS.filter((a) => {
            try { return fs.statSync(path.join(SRC_DIR, a.rel)).size < a.minBytes; } catch { return true; }
        }).map((a) => a.rel),
        appUrl: built() ? "/vpi/app/index.html" : null,
        upstream: UPSTREAM,
        maintenance: MAINTENANCE,
        refused: REFUSED,
        installJob: installStatus().job,
    };
}

/** Serve one artefact from SRC_DIR, or null if it isn't (yet) installed / isn't a recognized file. */
function readArtefact(rel) {
    const known = ARTEFACTS.find((a) => a.rel === rel);
    if (!known) return null;
    const p = path.join(SRC_DIR, rel);
    try { return fs.readFileSync(p); } catch { return null; }
}

module.exports = { install, installStatus, status, built, readArtefact,
                   UPSTREAM, MAINTENANCE, REFUSED, REPO, PINNED_COMMIT, DEFAULT_BRANCH,
                   SRC_DIR, ARTEFACTS };
