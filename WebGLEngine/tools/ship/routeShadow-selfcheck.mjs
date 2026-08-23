// WebGLEngine/tools/ship/routeShadow-selfcheck.mjs -- v3951
//
// Run: node tools/ship/routeShadow-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** TWO REAL PAGES WERE UNREACHABLE THROUGH THE SERVER, AND THE FILES WERE ON DISK THE WHOLE TIME. ***
//
// economyBridge and frugonBridge each claim a URL prefix with `startsWith("/economy")` / `startsWith("/frugon")`.
// That is true of "/economy.html" and "/frugon.html", so every request for the PAGE was swallowed by the API
// front door and answered 404. Keith's render-qa run reported them as missing pages -- a white 404, meanLum 254 --
// which is precisely the shape that hides the cause: the page looks absent, so you go looking for the file, and
// the file is right there.
//
// A PREFIX IS NOT A PATH SEGMENT, and the difference is invisible until somebody names a file after a route. This
// gate asserts the general property rather than re-checking those two names: NO route owner may claim a static
// file that exists beside it. Every owner in ai-bridge is driven against every real page in the tree, so the next
// bridge to take a prefix is caught by the page it shadows rather than by a QA run months later.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
const BRIDGES = path.join(ENG, "ai-bridge");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("routeShadow-selfcheck -- a bridge that owns a URL prefix must not own a page\n");

// Every module in ai-bridge that exports an owns() -- discovered, not listed, so a new one is covered on arrival.
const owners = [];
for (const f of fs.readdirSync(BRIDGES).filter((x) => x.endsWith(".js"))) {
    let m = null;
    try { m = require_(path.join(BRIDGES, f)); } catch { continue; }        // a bridge that will not load is not this gate's business
    if (m && typeof m.owns === "function") owners.push({ file: f, owns: m.owns });
}
ok("!! route owners were discovered rather than listed", owners.length > 0,
   owners.length + " bridge(s) export owns(): " + owners.map((o) => o.file).join(", "));

// Every page a browser could actually ask for.
const pages = fs.readdirSync(ENG).filter((f) => /\.(html|js|mjs|json|css)$/.test(f));
ok("...and there are real files to check them against", pages.length > 10, pages.length + " root files");

// ---- THE PROPERTY -------------------------------------------------------------------------------------------
{
    console.log("\n1. *** NO OWNER MAY SWALLOW A FILE THAT EXISTS ***");
    const shadowed = [];
    for (const o of owners) {
        for (const f of pages) {
            let claimed = false;
            try { claimed = !!o.owns("/" + f); } catch { claimed = false; }
            if (claimed) shadowed.push(o.file + " owns /" + f);
        }
    }
    ok("!! no bridge claims a URL that is a real file on disk",
       shadowed.length === 0,
       shadowed.length ? "SHADOWED: " + shadowed.join(", ") + " -- the file is served by nothing, and the page " +
                         "reports as missing rather than as taken"
                       : "checked " + owners.length + " owner(s) against " + pages.length + " root files");
}

// ---- AND THE ROUTES THEY DO NEED STILL WORK -----------------------------------------------------------------
//
// The cheap way to pass the check above is to make owns() return false for everything, which would take the
// bridges off the air -- so the other direction is asserted too.
//
// *** MY FIRST VERSION OF THIS SECTION SCRAPED EVERY QUOTED "/a/b" OUT OF THE SOURCE AND CALLED IT A ROUTE, ***
// which reported terrainBuildBridge as broken for not owning "/usr/local/bin" and ragBridge for not owning
// "/api/generate" -- an upstream URL. Nine failures, none of them real. A check that fires on correct files is
// the same disease as one that cannot fire at all, and this tree has a name for it.
//
// So the segment is DISCOVERED BY ASKING THE OWNER, not by reading strings: probe each first-segment that
// appears in the source and keep the ones owns() actually claims. Then the property is exact and needs no route
// list at all -- an owner must claim its own segment and its children, and must NOT claim that segment with a
// file extension glued on. That last clause IS the bug this gate was written for.
{
    console.log("\n2. ...AND THEY STILL CLAIM WHAT THEY EXIST FOR");
    for (const o of owners) {
        const src = fs.readFileSync(path.join(BRIDGES, o.file), "utf8");
        const code = src.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n");
        const segs = [...new Set([...code.matchAll(/"\/([a-z0-9-]+)/gi)].map((m) => m[1].toLowerCase()))];
        const mine = segs.filter((s) => { try { return o.owns("/" + s + "/__canary__"); } catch { return false; } });
        if (!mine.length) { ok(o.file + ": owns an identifiable segment", true, "(claims no /<segment>/... path -- nothing to assert)"); continue; }
        const bad = [];
        for (const s of mine) {
            try {
                if (!o.owns("/" + s)) bad.push("stopped owning /" + s);
                if (o.owns("/" + s + ".html")) bad.push("still owns /" + s + ".html");
            } catch (e) { bad.push("threw on /" + s); }
        }
        ok("!! " + o.file + " owns /" + mine.join(", /") + " and its children, but NOT /<name>.html",
           bad.length === 0,
           bad.length ? bad.join("; ") : "segment and children claimed; the .html form left for the file server");
    }
}

console.log(fails ? `\nrouteShadow-selfcheck: ${fails} FAILED` : "\nrouteShadow-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
