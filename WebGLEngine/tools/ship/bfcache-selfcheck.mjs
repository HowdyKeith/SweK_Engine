// WebGLEngine/tools/ship/bfcache-selfcheck.mjs -- v3052
//
// Run: node tools/ship/bfcache-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// THE BACK-FORWARD CACHE IS NOT AN UNLOAD, AND TWO DIFFERENT BUGS CAME FROM TREATING IT AS ONE.
//
// Chrome freezes a page into bfcache on a back-navigation and restores it INTACT -- same DOM, same variables,
// same timers. To freeze it, it SEVERS WEBSOCKETS ("WebSocket connection failed: Page entered Back-Forward
// Cache", which is what Keith saw). Two consequences the tree had never handled:
//
//   1. A SOCKET OPENED ONCE AT LOAD IS GONE AFTER A RESTORE and nothing reopens it. server.html's push socket
//      died on every back-navigation, leaving only the 10s poll fallback -- which reads as a page that
//      half-loaded rather than one that lost its push channel. NOTHING in the tree listened for pageshow.
//
//   2. CLEANUP ON pagehide FIRES FOR THE FREEZE TOO. v3050 added GL context disposal on pagehide with
//      {once:true}: entering bfcache released the context AND removed the listener, so a restored page had no
//      context and no way to clean up again. A dead page that looks like a broken one. Release only when
//      event.persisted is false.
//
// The rule: pagehide with persisted=true means PAUSED, not GONE. Anything torn down there must be rebuilt on
// pageshow, or not torn down at all.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

const SKIP = /node_modules|[\\/]\.git|[\\/]vendor|GPU_Assets|demos_code/;
function walkHtml(dir, out = []) {
    let e = []; try { e = fs.readdirSync(dir); } catch { return out; }
    for (const f of e) {
        const p = path.join(dir, f);
        if (SKIP.test(p)) continue;
        let st; try { st = fs.statSync(p); } catch { continue; }
        if (st.isDirectory()) walkHtml(p, out); else if (/\.html$/.test(f)) out.push(p);
    }
    return out;
}

// 1. NO DESTRUCTIVE pagehide ANYWHERE WITHOUT A persisted GUARD. This is the general form of the v3050 bug --
//    the next page that adds cleanup gets caught instead of shipping the same thing again.
{
    const bad = [];
    for (const p of walkHtml(ENG)) {
        const src = fs.readFileSync(p, "utf8");
        if (!/pagehide/.test(src)) continue;
        const code = noComments(src);   // KEEPS strings: "pagehide" is one
        // a pagehide handler that disposes/closes/terminates must check persisted
        const destructive = /pagehide[\s\S]{0,400}?(dispose|close|terminate|loseContext|abort)\s*\(/.test(code);
        const guarded = /pagehide[\s\S]{0,200}?persisted/.test(code);
        if (destructive && !guarded) bad.push(path.relative(ENG, p).split(path.sep).join("/"));
    }
    ok("!! NO PAGE TEARS THINGS DOWN ON pagehide WITHOUT CHECKING event.persisted", bad.length === 0,
        bad.length ? bad.join(", ") : "entering bfcache is PAUSED, not GONE -- releasing there leaves a restored page dead");
}

// 2. the two pages that own GL contexts release on a real unload and rebuild on a restore
{
    for (const page of ["raymarch-live.html", "volume-cache.html"]) {
        const code = noComments(read(page));
        ok(page + ": skips disposal when the page is only being frozen", /persisted\) return/.test(code));
        ok(page + ": rebuilds on a bfcache restore rather than half-living around a stale context",
            /pageshow/.test(read(page)) && /persisted\) location\.reload\(\)/.test(code));
        ok(page + ": the cleanup listener is NOT once-only (it must survive a freeze/restore round trip)",
            !/pagehide[\s\S]{0,300}\{ once: true \}/.test(code));
    }
}

// 3. the push socket comes back
{
    const raw = read("server.html");
    const code = noComments(raw);
    ok("server.html reopens its WebSocket after a bfcache restore", /pageshow/.test(raw) && /new WebSocket/.test(code));
    ok("...only when it is actually gone (an open socket is not reopened)",
        /readyState === WebSocket\.OPEN[\s\S]{0,60}CONNECTING[\s\S]{0,10}return/.test(code),
        "reopening a live socket would leave two, and both would fire the handler");
    ok("...and only for a RESTORE, not a normal load (which already has a fresh socket)",
        /if \(!e\.persisted\) return;/.test(code));
    ok("...wiring the message handler through one function, so the two sockets cannot diverge",
        /const wire = \(sock\)/.test(code) && (code.match(/wire\(ws\)/g) || []).length >= 2);
}

// 4. detection power
{
    const planted = '<script>addEventListener("pagehide", () => { thing.dispose(); }, { once: true });</script>';
    const code = noComments(planted);
    const destructive = /pagehide[\s\S]{0,400}?(dispose|close|terminate|loseContext|abort)\s*\(/.test(code);
    const guarded = /pagehide[\s\S]{0,200}?persisted/.test(code);
    ok("SABOTAGE: an unguarded destructive pagehide IS detected", destructive && !guarded);
    const fixed = '<script>addEventListener("pagehide", (e) => { if (e.persisted) return; thing.dispose(); });</script>';
    const c2 = noComments(fixed);
    ok("...and the guarded form is not", /pagehide[\s\S]{0,200}?persisted/.test(c2));
    const harmless = '<script>addEventListener("pagehide", () => { log("bye"); });</script>';
    const c3 = noComments(harmless);
    ok("...a non-destructive pagehide is not reported", !/pagehide[\s\S]{0,400}?(dispose|close|terminate|loseContext|abort)\s*\(/.test(c3));
}

console.log("bfcache-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
