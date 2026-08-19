// WebGLEngine/tools/ship/affordance-selfcheck.mjs -- v3010
//
// CAN A KEYBOARD -- OR AN AGENT -- REACH EVERY CONTROL ON EVERY PAGE?
//
// The question comes from alibaba/page-agent (MIT, 22k+ stars), whose distinctive architectural claim is that it
// drives web pages from THE DOM, with no screenshots and no multi-modal model. That inverts the usual test: if an
// agent cannot tell from the markup that something is a control, NEITHER CAN A SCREEN READER, AND NEITHER CAN
// ANYONE NAVIGATING BY KEYBOARD. Agent-readability and accessibility are the same property measured twice.
//
// SweK is not adopting page-agent. What it took is the audit that falls out of the idea.
//
// MEASURED FIRST, because the interesting number is the one you did not expect. Across 304 pages there are 1,550
// <button> elements and ZERO without an accessible name -- that part of the tree was already right and nobody
// knew it. The defect was elsewhere: TEN clickable divs, spans and images, ALL TEN with no role and no tabindex.
// Focus skips them entirely. A person navigating by keyboard cannot reach them at all, and one of them was on
// server.html, the front door.
//
// AND THEY ARE NOT ALL THE SAME DEFECT, which is the part worth keeping. A SCRIM -- the backdrop behind a modal
// -- is clickable and SHOULD NOT be focusable: role="button" on it would announce a button that does nothing
// when focused, and its real keyboard equivalent is ESCAPE. Fixing all ten identically would have made the page
// worse while making the number go green.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const SKIP = /node_modules|[\\/]\.git|[\\/]vendor|GPU_Assets|demos_code/;
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

function walk(d, out = []) {
    let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
    for (const e of es) {
        const f = path.join(d, e.name);
        if (SKIP.test(f)) continue;
        if (e.isDirectory()) walk(f, out);
        else if (e.name.endsWith(".html")) out.push(f);
    }
    return out;
}

const pages = walk(ENG);

// ---- 1. EVERY <button> HAS AN ACCESSIBLE NAME ---------------------------------------------------------------
{
    let total = 0; const nameless = [];
    for (const p of pages) {
        const h = fs.readFileSync(p, "utf8");
        for (const m of h.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
            total++;
            const attrs = m[1], inner = m[2].replace(/<[^>]*>/g, "").trim();
            if (!(inner.length || /aria-label\s*=/.test(attrs) || /title\s*=/.test(attrs))) nameless.push(path.basename(p));
        }
    }
    ok("!! every <button> carries an accessible name", nameless.length === 0,
       nameless.length ? "NAMELESS in: " + [...new Set(nameless)].join(", ")
                       : total + " buttons across " + pages.length + " pages -- a control whose name is only its icon is unreadable to a screen reader AND to a DOM-driven agent");
    ok("the scan is over the whole tree", total > 500 && pages.length > 200, pages.length + " pages, " + total + " buttons");
}

// ---- 2. EVERY CLICKABLE NON-BUTTON IS FOCUSABLE -- EXCEPT WHERE IT SHOULD NOT BE ---------------------------------
{
    let total = 0, scrims = 0; const unreachable = [];
    for (const p of pages) {
        const h = fs.readFileSync(p, "utf8");
        for (const m of h.matchAll(/<(div|span|td|li|img|svg)\b([^>]*\bonclick\s*=[^>]*)>/gi)) {
            total++;
            const a = m[2];
            if (/\bclass=["']scrim/.test(a)) { scrims++; continue; }   // declared dismissal surface
            if (!(/\brole\s*=/.test(a) && /\btabindex\s*=/.test(a))) unreachable.push(path.basename(p));
        }
    }
    ok("!! no clickable div/span/img is unreachable by keyboard", unreachable.length === 0,
       unreachable.length ? "FOCUS SKIPS THESE: " + [...new Set(unreachable)].join(", ")
                          : total + " clickable non-buttons, all reachable -- they were ALL unreachable before this round, including one on server.html");
    ok("!! ...and a scrim is EXEMPT on purpose, not by oversight", scrims >= 1,
       "a modal backdrop must NOT be focusable -- role=button would announce a button that does nothing, and its keyboard equivalent is ESCAPE. Fixing all ten identically would have made a page worse while making a number go green.");
}

// ---- 3. FOCUSABLE IS NOT OPERABLE ----------------------------------------------------------------------------------
{
    let withTabindex = 0, withKeydown = 0;
    for (const p of pages) {
        const h = fs.readFileSync(p, "utf8");
        for (const m of h.matchAll(/<(div|span|td|li|img|svg)\b([^>]*\bonclick\s*=[^>]*)>/gi)) {
            const a = m[2];
            if (/\btabindex\s*=/.test(a)) { withTabindex++; if (/onkeydown\s*=/.test(a)) withKeydown++; }
        }
    }
    ok("!! every focusable clickable also handles a KEY", withTabindex > 0 && withKeydown === withTabindex,
       withKeydown + " of " + withTabindex + " -- tabindex alone lets focus LAND on a control that Enter and Space do nothing to, which is worse than skipping it: it looks operable and is not");
}

console.log(fails ? "\naffordance-selfcheck: " + fails + " FAILED" : "\naffordance-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
