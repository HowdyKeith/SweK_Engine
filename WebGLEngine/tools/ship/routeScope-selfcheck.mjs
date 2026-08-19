// WebGLEngine/tools/ship/routeScope-selfcheck.mjs -- v2857
//
// Run: node tools/ship/routeScope-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// THE BUG: GET /codemap returned 404 from v2519 until v2857, and codemap.html was dead that entire time.
//
// The handler was correct. Its PLACEMENT was not -- it sat INSIDE
//
//     if (req.url.split("?")[0].startsWith("/box3d/")) { ... if (p === "/codemap") { ... } ... }
//
// so it was reachable only by a request whose path began "/box3d/", while its own condition demanded the path be
// exactly "/codemap". THOSE TWO CAN NEVER BOTH BE TRUE. Every real request fell past it to static file serving,
// found no file named "codemap", and 404'd -- which is why render QA reported it as a missing FILE rather than a
// missing ROUTE, and why it read as a content problem for 338 versions.
//
// THIS IS THE STANDING LAW IN ITS PUREST FORM -- "IF I MOVED A FILE, I MOVED ITS ASSUMPTIONS AND IT DOESN'T KNOW"
// -- except the thing that moved was a brace. Same family as the v2760 EDITING LAW, where an automated insert
// "after the first import line" landed inside a multi-line import. Both parse. Both are silent. Nothing about
// reading the handler tells you which scope it woke up in.
//
// So this gate does not just pin /codemap. It SCANS for the whole class: a route whose literal path cannot
// possibly match the prefix guard it is nested inside. That is a contradiction a machine can find and a reader
// cannot.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const src = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
// STRIP COMMENT LINES BEFORE MATCHING. My first version of this gate reported the fix as broken because it
// matched the guard string quoted inside the very comment EXPLAINING the fix. That is the browser-safety regex
// firing on the word "window" in a comment, all over again -- an instrument that reads prose as code. Blank the
// comment lines (keep the numbering) so every match below is real executable text.
const lines = src.split("\n").map((l) => (/^\s*\/\//.test(l) ? "" : l));

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. /codemap is reachable: it must NOT be inside the /box3d/ guard --------------------------------------
{
    const codemapLine = lines.findIndex((l) => /=== "\/codemap"|p === "\/codemap"/.test(l));
    const box3dGuard = lines.findIndex((l) => /startsWith\("\/box3d\/"\)/.test(l));
    ok("the /codemap route still exists", codemapLine > 0, "line " + (codemapLine + 1));
    ok("the /box3d/ guard still exists", box3dGuard > 0, "line " + (box3dGuard + 1));
    ok("!! /codemap is NOT trapped inside the /box3d/ guard", codemapLine >= 0 && box3dGuard >= 0 && codemapLine < box3dGuard,
       "codemap@" + (codemapLine + 1) + " must come BEFORE box3d guard@" + (box3dGuard + 1) +
       " -- nested after it, the route can never run");
    ok("...and it matches the bare path, not a prefixed one", /req\.url\.split\("\?"\)\[0\] === "\/codemap"/.test(src),
       "the handler now reads the URL itself rather than a `p` bound inside another block's scope");
}

// ---- 2. THE CLASS, not just the instance ---------------------------------------------------------------------
//
// Walk the file tracking any `startsWith("/prefix/")` guard we are inside, and flag any exact-path route within
// it whose literal cannot start with that prefix. Brace-depth tracking is crude but this is a lint, not a parser:
// it only ever REPORTS a contradiction that is true by string comparison.
{
    const guards = [];        // {prefix, depth}
    let depth = 0;
    const trapped = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const g = line.match(/startsWith\("(\/[A-Za-z0-9_-]+\/)"\)/);
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        if (g && opens > closes) guards.push({ prefix: g[1], depth });
        // an exact-path comparison inside a prefix guard
        const r = line.match(/=== "(\/[A-Za-z0-9_./-]*)"/);
        if (r && guards.length) {
            const inner = guards[guards.length - 1];
            const route = r[1];
            // A route is trapped when it cannot possibly begin with the guard's prefix.
            if (route !== "/" && !route.startsWith(inner.prefix) && !inner.prefix.startsWith(route)) {
                trapped.push(`${route} nested inside startsWith("${inner.prefix}") at line ${i + 1}`);
            }
        }
        depth += opens - closes;
        while (guards.length && depth <= guards[guards.length - 1].depth) guards.pop();
    }
    ok("!! NO ROUTE IS TRAPPED INSIDE A PREFIX GUARD IT CANNOT MATCH", trapped.length === 0,
       trapped.length ? trapped.slice(0, 4).join(" | ") : "scanned " + lines.length + " lines, none contradictory");
}

// ---- 3. the scan can actually fail (a control that cannot fail is decoration) ---------------------------------
{
    // Reconstruct the exact v2519 shape and confirm the walker flags it. If this ever stops flagging, the check
    // above is decoration and the next misplaced route ships silently.
    const sabotage = [
        'if (req.url.split("?")[0].startsWith("/box3d/")) {',
        '    const p = req.url.split("?")[0];',
        '    if (p === "/codemap" && req.method === "GET") {',
        '        sendJson({});',
        '    }',
        '}',
    ];
    const guards = []; let depth = 0; const trapped = [];
    for (let i = 0; i < sabotage.length; i++) {
        const line = sabotage[i];
        const g = line.match(/startsWith\("(\/[A-Za-z0-9_-]+\/)"\)/);
        const opens = (line.match(/\{/g) || []).length, closes = (line.match(/\}/g) || []).length;
        if (g && opens > closes) guards.push({ prefix: g[1], depth });
        const r = line.match(/=== "(\/[A-Za-z0-9_./-]*)"/);
        if (r && guards.length) {
            const inner = guards[guards.length - 1], route = r[1];
            if (route !== "/" && !route.startsWith(inner.prefix) && !inner.prefix.startsWith(route)) trapped.push(route);
        }
        depth += opens - closes;
        while (guards.length && depth <= guards[guards.length - 1].depth) guards.pop();
    }
    ok("!! SABOTAGE: the original v2519 nesting IS caught by this scan", trapped.length === 1 && trapped[0] === "/codemap",
       "caught: " + JSON.stringify(trapped));
}

// ---- 4. the page that consumes it is still pointed at the route ------------------------------------------------
{
    const html = fs.readFileSync(path.join(ENG, "codemap.html"), "utf8");
    ok("codemap.html still fetches /codemap", /fetch\("\/codemap"/.test(html));
}

console.log(fails ? "\nrouteScope-selfcheck: " + fails + " FAILED" : "\nrouteScope-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
