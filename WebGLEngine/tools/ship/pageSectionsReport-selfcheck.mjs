// WebGLEngine/tools/ship/pageSectionsReport-selfcheck.mjs -- v3959
//
// Run: node tools/ship/pageSectionsReport-selfcheck.mjs   (needs Chromium; skips cleanly without it)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** SERVER.HTML TOLD KEITH ELEVEN PAGES HAD NO LINK ON THE PAGE. ALL ELEVEN WERE LINKED. ***
//
// He read the line naming aibrain, brain-3d, brain-fleet, brain-lab, brain-maze, brain-quadrants, brain-room,
// dock-brain, lbm-fluid, lbm3d-flow and lbm3d-gpu-check, and said he was pretty sure some or all of those were
// already in the panels. He was right about every one. They sit in the "Brain pages" row v2507 hand-built inside
// the brain drawer, and in the fluid drawer -- the very drawers the registry was trying to put them in.
//
// THE LOOKUP WAS NARROWED ON PURPOSE AND THE SENTENCE WAS NOT. v3259 confined the anchor search to the Arriving
// row (a document-wide search had eaten the Page Index toolbar button). The report kept saying "found no link on
// this page" -- which had been true of the old search and was never true of the new one. "Not in Arriving" and
// "nowhere on the page" are different claims and only one of them is frightening, so for seven hundred versions
// the page raised an alarm about pages that were fine.
//
// WHY THIS IS A BROWSER GATE AND NOT A STRING CHECK. pageSections-selfcheck.mjs is static and could not have
// seen this: nothing about the registry was wrong, nothing about the mover was wrong, and the false sentence is
// a correct string in a source file. The bug only exists once the DOM exists. So the report is READ OFF A REAL
// PAGE, and -- because a fix that reports nothing looks exactly like a fix that silenced everything -- the two
// failing cases are PROVOKED with a doctored registry rather than assumed to still work.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
// Spelled the way selfchecks.mjs recognises, so a box with no browser is left out of gate-timings.json rather
// than recorded as a half-second gate -- a budget derived from a measurement of nothing.
if (skip) { console.log("pageSectionsReport-selfcheck: SKIPPED -- " + skip); process.exit(0); }

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("pageSectionsReport-selfcheck -- what server.html says about unplaced pages, read off a real page\n");

// The eleven from Keith's report, by name. Named rather than recomputed from the registry ON PURPOSE: the point
// is not "whatever the registry currently says is quiet", it is THESE PAGES, the ones that were falsely accused.
const ACCUSED = ["aibrain.html", "brain-3d.html", "brain-fleet.html", "brain-lab.html", "brain-maze.html",
    "brain-quadrants.html", "brain-room.html", "dock-brain.html",
    "lbm-fluid.html", "lbm3d-flow.html", "lbm3d-gpu-check.html"];

const b = await chromium.launch({ executablePath: HEADLESS_SHELL });

// `extra` is appended to the registry module as it is served, so the failing branches can be provoked without
// editing a checked-in file. The page never knows the difference; it imports the module the route hands it.
async function report(extra) {
    const page = await b.newPage();
    const logs = [];
    page.on("console", (m) => logs.push(m.text()));
    await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
        // The firewall probe and whoami are stubbed so nothing here shells out to netsh on Keith's Windows rig.
        if (u.pathname === "/sys/firewall/status") return json({ open: true, port: 8787 });
        if (u.pathname === "/self/whoami") return json({ ok: true });
        const p = path.join(ROOT, decodeURIComponent(u.pathname));
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            let body = fs.readFileSync(p);
            if (extra && u.pathname === "/tools/ship/pageSections.mjs") body = body.toString("utf8") + extra;
            const ext = path.extname(p);
            const type = ext === ".mjs" || ext === ".js" ? "text/javascript"
                : ext === ".html" ? "text/html" : ext === ".json" ? "application/json"
                    : ext === ".css" ? "text/css" : "text/plain";
            return route.fulfill({ status: 200, contentType: type, body });
        }
        return route.fulfill({ status: 404, body: "not found" });
    });
    await page.goto("http://localhost:8787/server.html", { waitUntil: "domcontentloaded" }).catch(() => { });
    // Waits for the line rather than sleeping a guessed number of ms -- the module is deferred and the panel
    // markup it walks is large.
    for (let i = 0; i < 150 && !logs.some((l) => l.startsWith("[pageSections] moved")); i++) await page.waitForTimeout(100);
    const line = logs.find((l) => l.startsWith("[pageSections] moved")) || "";
    // BOTH SURFACES, because they are two renderings of one verdict and the whole risk is that they disagree.
    const spans = await page.evaluate(() => [...document.querySelectorAll("span")]
        .map((s) => s.textContent || "").filter((t) => /registry entr|already linked in another/.test(t)));
    await page.close();
    return { line, spans, all: line + " " + spans.join(" ") };
}

// ---- 1. the page as it actually ships -------------------------------------------------------------------
const live = await report(null);
ok("the report is produced at all (a silent module would pass every 'says nothing' check below)",
    /^\[pageSections\] moved \d+ page links/.test(live.line), live.line.slice(0, 60));
for (const p of ACCUSED) {
    ok("!! " + p + " is never named as unplaced -- it is linked, in the drawer the registry wants",
        !live.all.includes(p));
}
ok("!! and no alarm span is drawn at all when nothing is actually wrong",
    live.spans.length === 0, live.spans.join(" ").slice(0, 120));

// ---- 2. the two failing cases, provoked -----------------------------------------------------------------
// A page nothing links, and a page linked in a DIFFERENT drawer from the one claiming it. If the fix had merely
// widened the search until everything matched, both of these would go quiet too -- which is the failure this
// half exists to catch.
const doctored = await report(
    '\nSECTIONS.push({ id: "zzSelfcheck", tab: "brain", label: "selfcheck",' +
    ' pages: ["xx-not-a-real-page.html", "lbm3d-gpu.html"] });\n');
ok("a registry page with no anchor anywhere is still reported, by name",
    /no anchor at all: [^|]*xx-not-a-real-page\.html/.test(doctored.line), doctored.line);
ok("a registry page linked in ANOTHER drawer is still reported, by name",
    /linked elsewhere: [^|]*lbm3d-gpu\.html/.test(doctored.line), doctored.line);
ok("!! the two are told APART on the page, not lumped -- lumping them is what accused the eleven",
    doctored.spans.length === 1 &&
    /no link anywhere on this page: [^|]*xx-not-a-real-page\.html/.test(doctored.spans[0]) &&
    /already linked in another part of the page: [^|]*lbm3d-gpu\.html/.test(doctored.spans[0]),
    doctored.spans.join(" "));
ok("!! and the eleven stay quiet even while the doctored pair is being shouted about",
    !ACCUSED.some((p) => doctored.all.includes(p)));

// ---- 3. the sentence itself -----------------------------------------------------------------------------
// The bug was a CLAIM WIDER THAN THE LOOKUP. The old wording is banned by name so it cannot come back the way it
// arrived: quietly, in an edit that only meant to reword.
const html = fs.readFileSync(path.join(ROOT, "server.html"), "utf8");
ok("!! the sentence that was false -- 'found no link on this page' -- is gone and stays gone",
    !html.includes("found no link on this page"));

await b.close();
console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
