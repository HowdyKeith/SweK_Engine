// WebGLEngine/ai-bridge/codemapBridge.js — v2519
//
// WHAT THIS IS, AND WHAT IT IS NOT. cosmtrek/mindwalk replays a CODING-AGENT SESSION on a 3D map of a codebase: it
// reads ~/.claude/projects and ~/.codex/sessions, and colours each file by how deeply an agent touched it during
// one run. We have no such transcripts — this engine is built through claude.ai, which writes no session files —
// so replaying a session is not something this box can honestly do, and pretending otherwise would be a
// visualisation of nothing.
//
// What we DO have is better in one specific way and worse in every other: this tree has carried a vNNNN marker in
// its comments for 2500 versions. That is a real, per-file record of WHEN each file was last thought about, mined
// from a convention that was never intended as telemetry. It is not one session — it is every session, flattened.
//
// AND AN UNMARKED FILE IS "UNKNOWN", NOT "OLD". 61% of this tree carries no marker at all. That is a finding, not
// a gap to fill with a plausible colour: some of those are third-party, some predate the convention, and some were
// simply never commented. Guessing an age for them would be the exact failure this engine's changelog is about.
"use strict";
const fs = require("fs");
const path = require("path");

let ENGINE = path.join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", ".venv", "__pycache__", "dist", "build-wasm", ".cache"]);
const EXT = new Set([".js", ".mjs", ".html", ".c", ".h", ".css", ".py", ".bat", ".sh", ".wgsl", ".glsl"]);

// v3976 -- THE SEAM, MATCHING androidPeerBridge's configure(). Production callers never call this: the default
// ENGINE above is the real tree. The gate needs it because the bug this file just had (a scan-wide cap of 9999
// instead of the tree's own newest version) can only be PROVEN against a tree where "the real newest version"
// and "a fixture pretending to be newer" are both known values chosen by the test, not read off whatever this
// box happens to be shipped at today.
function configure({ engineDir } = {}) {
    if (engineDir) ENGINE = engineDir;
    _cache = null; _cacheAt = 0;   // a stale production-tree cache answered for a sandbox would defeat the seam
}

// v3976 -- THE CAP WAS 9999, A NUMBER NO REAL MARKER CAN EVER REACH, AND EIGHT SELFCHECKS PROVE IT WRONG EVERY
// RUN. markerSingleSource-selfcheck.mjs, applyStaged-selfcheck.mjs and six others plant `"v9999"` as SYNTHETIC
// TEST DATA for the marker-parsing convention itself -- fixture strings, never a shipped version. The old cap
// could not tell that literal apart from a real one, so `newest` came back v9999 against a tree actually at
// v3975, and every real marker (188-3975) got squeezed into the bottom ~40% of the colour range the page built
// around that number. THE MAP WAS NOT DARK, THE SCALE WAS LYING TO IT.
//
// The cap is now the tree's OWN authoritative newest version -- main.js's ENGINE_VERSION, read by the SAME
// regex staleness.mjs already uses for it, so this does not invent a second declaration of what "current" means.
// A marker above that cap is not clamped INTO range (that would assign a file a version it was never actually
// at) and not zeroed to unmarked (a real, lower marker earlier in the same file would be thrown away with it)
// -- the scan simply keeps looking past it for the highest token that IS plausible, exactly as it already skips
// any non-numeric noise the regex does not match.
// NOT MEMOIZED, ON PURPOSE. ai-bridge/server.js is long-running and outlives a version bump; caching this
// alongside the 60s file-walk cache would need a second TTL kept in lockstep with the first, and the two
// drifting apart is exactly the "the cap does not match the tree's real newest" bug this file exists to fix,
// just delayed rather than avoided. One regex against one already-open-sized file costs nothing next to the
// walk it guards.
function shipVersion() {
    try {
        const m = fs.readFileSync(path.join(ENGINE, "main.js"), "utf8").match(/ENGINE_VERSION = "v(\d+)"/);
        return m ? parseInt(m[1], 10) : 9999;
    } catch { return 9999; }
}

/** The newest vNNNN mentioned anywhere in the file, no larger than the tree's own current version.
 *  Not perfect the other direction: a file that mentions v2100 in a comment ABOUT history reads as v2100 even
 *  if it was edited yesterday without a new marker. It is a floor on the file's age, not a timestamp, and the
 *  page says so rather than dressing it up as one. */
function newestMarker(text, cap) {
    let best = 0;
    const re = /\bv(\d{3,4})\b/g;
    let m;
    while ((m = re.exec(text))) {
        const n = parseInt(m[1], 10);
        if (n > best && n <= cap) best = n;
    }
    return best || null;
}

function walk(dir, out, depth, cap) {
    if (depth > 8) return out;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        if (e.name.startsWith(".") && e.name !== ".github") continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name)) continue;
            walk(p, out, depth + 1, cap);
        } else if (EXT.has(path.extname(e.name))) {
            let st, text;
            try { st = fs.statSync(p); } catch { continue; }
            // A 23,000-line main.js is normal here; a 40 MB anything is not source and reading it would stall the
            // loop for no information.
            if (st.size > 4 * 1024 * 1024) continue;
            try { text = fs.readFileSync(p, "utf8"); } catch { continue; }
            const rel = path.relative(ENGINE, p).split(path.sep).join("/");
            out.push({
                path: rel,
                dir: path.dirname(rel) === "." ? "" : path.dirname(rel),
                lines: text.split("\n").length,
                bytes: st.size,
                marker: newestMarker(text, cap),
                mtime: Math.round(st.mtimeMs),
            });
        }
    }
    return out;
}

let _cache = null;
let _cacheAt = 0;

function codemap(force) {
    // Walking ~1200 files and reading every one costs a second or two. Cache it: this is a map of a tree that
    // changes when someone ships, not thirty times a page load.
    if (!force && _cache && Date.now() - _cacheAt < 60000) return _cache;
    const t0 = Date.now();
    const files = walk(ENGINE, [], 0, shipVersion());
    const marked = files.filter((f) => f.marker);
    const markers = marked.map((f) => f.marker).sort((a, b) => a - b);
    _cache = {
        ok: true,
        files,
        stats: {
            files: files.length,
            lines: files.reduce((s, f) => s + f.lines, 0),
            marked: marked.length,
            unmarked: files.length - marked.length,
            oldest: markers[0] || null,
            newest: markers[markers.length - 1] || null,
            median: markers.length ? markers[markers.length >> 1] : null,
            ms: Date.now() - t0,
        },
    };
    _cacheAt = Date.now();
    return _cache;
}

module.exports = { codemap, configure };
