// ai-bridge/ensureSpark.js -- self-heal / first-use vendoring for the Spark 3DGS renderer.
//
// v2859. Same shape as ensureThree.js and ensureHtmx.js, and deliberately so: Keith asked whether the splat
// renderer could install itself the way the engine already installs its other browser libs. It can, and this is
// that -- no new mechanism, no npm on the request path, no build step.
//
// WHY NOT `npm install @sparkjsdev/spark`. The instructions this replaces were three commands ending in a `cp`
// out of node_modules. That works, but it drags a node_modules tree into the web root's neighbourhood for ONE
// file, needs npm present, and leaves the page broken until a human runs it. Spark ships a prebuilt ES module;
// fetching that one file into vendor/ is the whole install. ensureThree does exactly this for three.js.
//
// PINNED, NOT LATEST. The version is a constant here, so a page authored against this API cannot be broken by an
// upstream release landing overnight. Bumping it is a deliberate edit with a changelog line, which is the same
// reason ensureThree pins r160.
//
// TWO SOURCES, ONE VERSION. The vendor's own release host first, jsDelivr's npm mirror second. Both serve the
// SAME pinned version, so the fallback cannot silently give you different code -- it is a route around an outage,
// not a different package.
"use strict";
const fs = require("fs");
const path = require("path");

// vendor/ here is the WEB ROOT's vendor (parent of ai-bridge), which is what the browser importmap resolves.
// ai-bridge has its OWN vendor/ (go2rtc) -- do NOT confuse them. Same warning ensureThree carries, same reason.
const DIR = path.join(__dirname, "..", "vendor", "spark");
const VERSION = "2.1.0";
const FILE = "spark.module.js";
const SOURCES = [
    "https://sparkjs.dev/releases/spark/" + VERSION + "/" + FILE,
    "https://cdn.jsdelivr.net/npm/@sparkjsdev/spark@" + VERSION + "/dist/" + FILE,
];
const SENTINEL = path.join(DIR, FILE);

// "present" = on disk AND big enough to be the real module rather than a truncated download or an error page
// served with a 200. ensureThree learned this the same way: a 404 HTML body written to disk is "present" to
// statSync and broken to the browser.
const MIN_BYTES = 50000;
function present() { try { return fs.statSync(SENTINEL).size > MIN_BYTES; } catch { return false; } }

let _running = false;
let _last = null;
function status() {
    return {
        ok: true, present: present(), running: _running, version: VERSION, file: "/vendor/spark/" + FILE,
        sources: SOURCES, last: _last,
        note: "Spark (World Labs, MIT) -- the 3DGS renderer splat_viewer.html uses. The engine runs fine without it; only that page needs it.",
    };
}

async function ensure(force) {
    if (!force && present()) return { ok: true, present: true };
    if (_running) return { ok: true, running: true };
    _running = true;
    const tried = [];
    try {
        fs.mkdirSync(DIR, { recursive: true });
        let lastErr = null;
        for (const url of SOURCES) {
            try {
                const r = await fetch(url, { headers: { "User-Agent": "swek-engine" } });
                if (!r.ok) throw new Error("HTTP " + r.status);
                const buf = Buffer.from(await r.arrayBuffer());
                if (buf.length < MIN_BYTES) throw new Error("suspiciously small (" + buf.length + " bytes) -- probably an error page, not the module");
                // Write to a temp path and rename, so an interrupted fetch can never leave a half-file that
                // `present()` would then call good.
                const tmp = SENTINEL + ".part";
                fs.writeFileSync(tmp, buf);
                fs.renameSync(tmp, SENTINEL);
                _last = { ok: true, fetched: 1, bytes: buf.length, from: url, version: VERSION, ts: Date.now() };
                return _last;
            } catch (e) {
                lastErr = e;
                tried.push(url + " -> " + String((e && e.message) || e));
            }
        }
        throw lastErr || new Error("no sources available");
    } catch (e) {
        _last = { ok: false, error: String((e && e.message) || e), tried, ts: Date.now() };
        return _last;
    } finally {
        _running = false;
    }
}

module.exports = { ensure, present, status, DIR, VERSION, SENTINEL, SOURCES, MIN_BYTES };
