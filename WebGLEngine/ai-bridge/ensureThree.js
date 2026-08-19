// ai-bridge/ensureThree.js — self-heal for the bundled three.js viewer assets.
//
// vendor/three (three.module.js + the three jsm modules the 3D viewer pages need:
// pipboy-models / glb_viewer / graph_viewer / voxel-photo-cube) normally SHIPS in
// the zip, so it loads instantly and offline. This is only a safety net: if those
// files are ever missing (a ship-strip slip, or the user deleted them), the bridge
// quietly re-fetches the exact r160 closure from GitHub on boot so the regression
// that broke the viewers before can't recur.
"use strict";
const fs = require("fs");
const path = require("path");

// vendor/three is served to the browser from the WebGLEngine web root, which is
// the parent of ai-bridge (the import map resolves "/vendor/three/..."). ai-bridge
// has its OWN vendor/ (go2rtc) — do NOT confuse them.
const DIR = path.join(__dirname, "..", "vendor", "three");
const REV = "r160";   // must match the version the viewer pages were authored against
const BASE = "https://raw.githubusercontent.com/mrdoob/three.js/" + REV + "/";

// [ local path under vendor/three , remote path in the three.js repo ]
const FILES = [
    ["three.module.js", "build/three.module.js"],
    ["jsm/controls/OrbitControls.js", "examples/jsm/controls/OrbitControls.js"],
    ["jsm/loaders/GLTFLoader.js", "examples/jsm/loaders/GLTFLoader.js"],
    ["jsm/utils/BufferGeometryUtils.js", "examples/jsm/utils/BufferGeometryUtils.js"],
];
const SENTINEL = path.join(DIR, "three.module.js");

// "present" = the main build is on disk and looks real (not a truncated/error page).
function present() { try { return fs.statSync(SENTINEL).size > 100000; } catch { return false; } }

let _running = false;
let _last = null;
function status() { return { present: present(), running: _running, rev: REV, last: _last }; }

// Fetch any missing files into vendor/three. Returns once done (or on first error).
async function ensure(force) {
    if (!force && present()) return { ok: true, present: true };
    if (_running) return { ok: true, running: true };
    _running = true;
    try {
        fs.mkdirSync(DIR, { recursive: true });
        let fetched = 0;
        for (const pair of FILES) {
            const dest = path.join(DIR, pair[0]);
            if (!force) { try { if (fs.statSync(dest).size > 200) continue; } catch (e) {} }
            const r = await fetch(BASE + pair[1], { headers: { "User-Agent": "swek-engine" } });
            if (!r.ok) throw new Error(pair[1] + " -> HTTP " + r.status);
            const buf = Buffer.from(await r.arrayBuffer());
            if (buf.length < 200) throw new Error(pair[1] + " -> suspiciously small (" + buf.length + " bytes)");
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

module.exports = { ensure, present, status, DIR, REV };
