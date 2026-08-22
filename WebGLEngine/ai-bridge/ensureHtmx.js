// ai-bridge/ensureHtmx.js — self-heal for the bundled htmx assets (mirrors ensureThree.js).
//
// vendor/htmx (htmx core + the SSE extension) normally SHIPS in the zip, so the
// htmx-powered light pages (clients.html, and the ones converted after it) load
// instantly and offline. This is only a safety net: if those files are ever
// missing (a ship-strip slip, or a manual delete), the bridge quietly re-fetches
// the exact pinned versions on boot so the htmx pages can't silently break.
//
// This is NOT a user-facing toggle. htmx is a static vendored library, not a
// service — it doesn't start/stop and there's nothing to turn on/off. The right
// robustness mechanism for a vendored lib is an automatic presence check + refetch,
// exactly like vendor/three. (That's the answer to "should htmx be a Boot Options
// checkbox that auto-installs": no — it's this instead, and it runs on its own.)
"use strict";
const fs = require("fs");
const path = require("path");

// vendor/htmx is served to the browser from the WebGLEngine web root (parent of
// ai-bridge), the same place vendor/three lives.
const DIR = path.join(__dirname, "..", "vendor", "htmx");
const HTMX_VER = "2.0.10";        // pinned core (stable 2.x line, NOT the 4.0 beta which rewrites SSE)
const SSE_VER = "2.2.4";          // pinned SSE extension

// [ local filename under vendor/htmx , remote URL to refetch from ]
// jsdelivr serves the exact versioned files directly (Keith's boxes reach it fine;
// the sandbox can't, but the self-heal only ever runs on a real box that's missing files).
const FILES = [
    ["htmx." + HTMX_VER + ".min.js", "https://cdn.jsdelivr.net/npm/htmx.org@" + HTMX_VER + "/dist/htmx.min.js"],
    ["htmx-ext-sse." + SSE_VER + ".min.js", "https://cdn.jsdelivr.net/npm/htmx-ext-sse@" + SSE_VER + "/dist/sse.min.js"],
];
const SENTINEL = path.join(DIR, "htmx." + HTMX_VER + ".min.js");

// "present" = the core file is on disk and looks real (htmx min is ~50KB; guard well below that).
function present() { try { return fs.statSync(SENTINEL).size > 20000; } catch { return false; } }

let _running = false;
let _last = null;
function status() { return { present: present(), running: _running, htmxVer: HTMX_VER, sseVer: SSE_VER, last: _last }; }

// Fetch any missing files into vendor/htmx. Returns once done (or on first error).
async function ensure(force) {
    if (!force && present()) return { ok: true, present: true };
    if (_running) return { ok: true, running: true };
    _running = true;
    try {
        fs.mkdirSync(DIR, { recursive: true });
        let fetched = 0;
        for (const pair of FILES) {
            const dest = path.join(DIR, pair[0]);
            if (!force) { try { if (fs.statSync(dest).size > 500) continue; } catch (e) {} }
            const r = await fetch(pair[1], { headers: { "User-Agent": "swek-engine" } });
            if (!r.ok) throw new Error(pair[1] + " -> HTTP " + r.status);
            const buf = Buffer.from(await r.arrayBuffer());
            if (buf.length < 500) throw new Error(pair[1] + " -> suspiciously small (" + buf.length + " bytes)");
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, buf);
            fetched++;
        }
        _last = { ok: true, fetched, ts: Date.now() };
        return _last;
    } catch (e) {
        _last = { ok: false, error: String((e && e.message) || e), ts: Date.now() };
        return _last;
    } finally {
        _running = false;
    }
}

module.exports = { ensure, present, status, DIR, HTMX_VER, SSE_VER };
