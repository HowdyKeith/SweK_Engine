// WebGLEngine/tools/ship/chipOrder-selfcheck.mjs -- v3960
//
// Run: node tools/ship/chipOrder-selfcheck.mjs   (needs Chromium; skips cleanly without it)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** KEITH BELIEVED THE TOPIC ROW HAD A DEFINED ORDER. IT HAD NO ORDER AT ALL. ***
//
// "I know that the first items in SweK Engine Topics are defined to show in order, but the rest of the category
// topics should be alphabetized if not set to show in order." Nothing was set to show in order. The row is
// static markup and the chips sat in the sequence they were WRITTEN IN -- Email rules and Asset Pipeline at the
// front because they are the oldest, Rocket League at the back because it is the newest, nine hundred versions
// of append. It reads as deliberate from the front, where the operational drawers happen to come first, and as
// noise from the middle on. THAT IS HOW AN ACCIDENT LOOKS WHEN ITS FIRST FEW ENTRIES ARE ACCIDENTALLY RIGHT,
// and it is why the belief was reasonable and still wrong.
//
// So v3960 wrote the intent down (CHIP_PINNED) and sorted the rest by name. WHAT THIS GATE DEFENDS is both
// halves and the seam between them, IN A REAL BROWSER -- because the order is produced at runtime by a sort
// that runs after the chip-group mover, and none of that exists in the source. The static markup is now, on
// purpose, in the WRONG order: reading it proves nothing.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { CHIP_PINNED, CHIP_GROUPS } from "./pageSections.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) { console.log("chipOrder-selfcheck: SKIPPED -- " + skip); process.exit(0); }

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("chipOrder-selfcheck -- the topic row's order, read off a real page\n");

const b = await chromium.launch({ executablePath: HEADLESS_SHELL });
const page = await b.newPage();
const logs = [];
page.on("console", (m) => logs.push(m.text()));
await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o) });
    if (u.pathname === "/sys/firewall/status") return json({ open: true, port: 8787 });
    if (u.pathname === "/self/whoami") return json({ ok: true });
    const p = path.join(ROOT, decodeURIComponent(u.pathname));
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const ext = path.extname(p);
        const type = ext === ".mjs" || ext === ".js" ? "text/javascript"
            : ext === ".html" ? "text/html" : ext === ".json" ? "application/json"
                : ext === ".css" ? "text/css" : "text/plain";
        return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
    }
    return route.fulfill({ status: 404, body: "not found" });
});
await page.goto("http://localhost:8787/server.html", { waitUntil: "domcontentloaded" }).catch(() => { });
for (let i = 0; i < 150 && !logs.some((l) => l.startsWith("[chipOrder]")); i++) await page.waitForTimeout(100);

// The same key the page sorts on -- leading icon stripped, because sorting on the raw string orders by the
// codepoint of a picture, which is an order nobody can predict or check.
const row = await page.evaluate(() => [...document.querySelectorAll("#gaugeTabBar > .gtab")].map((el) => {
    const sp = el.querySelectorAll("span");
    const txt = (sp.length > 1 ? sp[1].textContent : el.textContent) || "";
    return { tab: el.dataset.tab, label: txt.trim(), key: txt.replace(/^[^\p{L}\p{N}]+/u, "").trim().toLowerCase() };
}));

ok("the row is built at all (an empty row passes every ordering check below)", row.length > 10, row.length + " chips");
ok("the sort reported itself", logs.some((l) => l.startsWith("[chipOrder]")),
    (logs.find((l) => l.startsWith("[chipOrder]")) || "").slice(0, 90));

// ---- the pinned head ------------------------------------------------------------------------------------
const present = CHIP_PINNED.filter((t) => row.some((c) => c.tab === t));
const head = row.slice(0, present.length).map((c) => c.tab);
ok("!! *** the pinned service chips lead the row, in exactly the order CHIP_PINNED lists them ***",
    head.join(",") === present.join(","),
    "want " + present.join(" ") + "\n         got  " + head.join(" "));
ok("!! every pinned chip actually exists in the row -- a pin naming nothing is a config line that does nothing",
    present.length === CHIP_PINNED.length,
    CHIP_PINNED.filter((t) => !present.includes(t)).join(", ") || "all present");

// ---- the alphabetised tail ------------------------------------------------------------------------------
const tail = row.slice(present.length);
const sorted = [...tail].sort((x, y) => x.key.localeCompare(y.key, "en", { sensitivity: "base", numeric: true }));
const firstBreak = tail.findIndex((c, i) => c.tab !== sorted[i].tab);
ok("!! *** everything not pinned is in alphabetical order ***", firstBreak === -1,
    firstBreak === -1 ? tail.length + " chips, A-Z"
        : "first break at position " + (present.length + firstBreak + 1) + ": got '" +
          tail[firstBreak].label + "' where '" + sorted[firstBreak].label + "' belongs");
ok("...and no pinned chip leaked into the tail",
    !tail.some((c) => CHIP_PINNED.includes(c.tab)),
    tail.filter((c) => CHIP_PINNED.includes(c.tab)).map((c) => c.tab).join(", ") || "none");

// ---- Keith's rename -------------------------------------------------------------------------------------
// The prefix exists so the three Physics Lab drawers COLLECT, which only pays off if the sort puts them
// together -- so the two halves of the round are checked as one claim rather than two.
// v4127 -- *** THIS CHECK USED TO HARDCODE THREE DRAWERS AND THE COUNT HAD ALREADY GONE STALE. *** It read
// `const PL = ["optics", "cosmic", "em"]`, written when three drawers carried the prefix. By v4034 "PL:
// Boundaries & Reconstruction" and "PL: Discretisation & Meshes" existed and were never added to the list, so
// the gate was grading three of five -- and still PASSED, because those two happened to sort adjacent to the
// three it knew about. It only FAILED when v4127 renamed "Fluid" and "Matter & Chaos" into the prefix and the
// unlisted members finally spread the three apart. A CHECK THAT NAMES ITS MEMBERS BY HAND GOES STALE THE NEXT
// TIME SOMEBODY JOINS, and this one proved it by grading a shrinking fraction of the thing it defends.
//
// So the set is DERIVED from the row: every chip whose label carries the prefix, however many that is. The
// property worth defending was never "these three are adjacent" -- it is "the prefix collects ALL of them into
// one run", which is what makes the rename pay off and what a new PL drawer must not break.
const plChips = row.filter((c) => (c.label || "").includes("PL: "));
const plAt = plChips.map((c) => row.indexOf(c));
ok("!! the Physics Lab drawers carry the 'PL: ' prefix Keith asked for   (" + plChips.length + " of them)",
    plChips.length >= 3, plChips.map((c) => c.label).join(" | "));
ok("!! *** ...AND THE PREFIX PAYS OFF: sorted, ALL of them land in ONE CONSECUTIVE RUN ***",
    plAt.length > 0 && Math.max(...plAt) - Math.min(...plAt) === plAt.length - 1,
    "positions " + plAt.map((i) => i + 1).sort((a, c) => a - c).join(", ") +
    " -- a prefix that did not group every one of them would be renames with no gain");

// ---- the seam with the group mover ----------------------------------------------------------------------
// CHIP_GROUPS lifts chips OUT of this row. The sort runs after it; if that sequencing were reversed the sort
// could put a grouped chip back, which is the one way these two features can destroy each other.
const grouped = CHIP_GROUPS.flatMap((g) => g.chips);
ok("!! *** no chip the group mover took away has been sorted back into the top row ***",
    !grouped.some((t) => row.some((c) => c.tab === t)),
    grouped.filter((t) => row.some((c) => c.tab === t)).join(", ") || "none of " + grouped.join(", "));

// ---- and the chips still WORK after being moved ---------------------------------------------------------
// appendChild carries the listener, the live state span and the data-tab pairing -- that is a claim about the
// DOM, not about this page. So three chips that ended up far from where the markup put them are CLICKED.
for (const tab of ["blobs", "em", "voxelrender"]) {
    const sel = '#gaugeTabBar .gtab[data-tab="' + tab + '"]';
    const read = () => page.evaluate((t) => {
        const p = document.querySelector('.gpanel[data-panel="' + t + '"]');
        return p ? getComputedStyle(p).display : "NO PANEL";
    }, tab);
    const before = await read();
    await page.click(sel).catch(() => { });
    await page.waitForTimeout(150);
    const after = await read();
    ok("a re-ordered chip still opens its own panel: " + tab, before !== after && after !== "NO PANEL",
        before + " -> " + after);
}

await b.close();
console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
