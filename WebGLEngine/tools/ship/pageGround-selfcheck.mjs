// WebGLEngine/tools/ship/pageGround-selfcheck.mjs -- v3961
//
// Run: node tools/ship/pageGround-selfcheck.mjs   (needs Chromium; skips cleanly without it)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// *** KEITH: "not sure why this page is white and the others are black background." ***
//
// magmap-bench.html declared `color-scheme: light dark` and set NO BACKGROUND AT ALL, so the browser painted
// its own default behind it -- #ffffff on a light-mode box, #121212 on a dark-mode one. join.html and
// report.html did the same. Three pages out of 397 changed colour with a system preference nothing else in the
// tree reads, so the engine looked broken on exactly the machines whose owners had never picked a theme.
//
// *** THE SOURCE CANNOT ANSWER THIS AND MY FIRST ATTEMPT PROVED IT. *** I grepped for a body rule setting a
// background and got nineteen suspects. Measured in a browser, SIX OF THEM PAINT DARK ANYWAY -- they set the
// ground on <html> or a container, or across a multi-line rule the pattern could not see. The regex was wrong
// on a third of its own answers. So this gate reads THE PAINTED PIXEL, which is the only thing that settles it:
// getComputedStyle on an unset body returns rgba(0,0,0,0) -- "transparent" -- which is not a colour, and a
// check that assumed white behind it would be measuring its own guess.
//
// ---- WHAT IS ACTUALLY BEING DEFENDED, AND WHAT IS DELIBERATELY ALLOWED --------------------------------------
//
// NOT "every page must be dark". petfbi-board.html follows the viewer's scheme ON PURPOSE -- it is the public
// lost-pet board, it carries a real theme switcher (a petfbi_theme key and an applyTheme()), and it measures
// 15.25 light / 15.76 dark. Banning dual-theme outright would fail a page for having a feature.
//
// The rule is: A PAGE MAY VARY WITH THE VIEWER'S SCHEME ONLY IF SOMEBODY MEANT IT TO, and either way it must
// paint a ground it CHOSE and stay readable. An unchosen ground is the defect -- not a light one.
//
// ---- WHY THE AT-RISK SET IS DERIVED AND NOT LISTED -----------------------------------------------------------
//
// There are exactly two mechanisms by which a page's colours can follow the OS: a `color-scheme` declaration
// naming more than one value, and a `prefers-color-scheme` query (in CSS or in matchMedia). That is a SOUND
// predicate, not a guess -- a page using neither cannot vary. So the set is recomputed from source on every run
// and a NEW page that reaches for either is pulled in automatically and has to justify itself. The roster below
// is separate and much smaller: the pages found bare THIS round, pinned by name so they cannot quietly go back.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { noComments } from "./sourceScan.mjs";

const require_ = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) { console.log("pageGround-selfcheck: SKIPPED -- " + skip); process.exit(0); }

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("pageGround-selfcheck -- the ground each page paints, measured in both colour schemes\n");

// Pages that were bare at v3961 and are now on theme.css. Pinned BY NAME: the derived set below would still
// flag them if they re-declared a dual scheme, but not if somebody merely deleted the background again.
const FIXED = ["magmap-bench.html", "join.html", "report.html"];
// Deliberately dual-theme, with a switcher of its own. Named here so "it varies" is a decision on the record
// rather than a thing the gate silently tolerates -- it is still held to contrast in BOTH schemes below.
const BY_DESIGN = { "petfbi-board.html": "the public lost-pet board -- carries a petfbi_theme switcher" };

// The sound at-risk predicate. Only these two mechanisms can make a page follow the OS.
const VARIES = /prefers-color-scheme|color-scheme:\s*[^;}]*(?:light[^;}]*dark|dark[^;}]*light)/i;
const atRisk = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith(".html"))
    .filter((f) => VARIES.test(fs.readFileSync(path.join(ROOT, f), "utf8")));

const roster = [...new Set([...FIXED, ...atRisk])].sort();
console.log("  measuring " + roster.length + " page(s): " + roster.join(", ") +
    "\n  (" + atRisk.length + " derived as able to vary, " + FIXED.length + " pinned from this round)\n");

const relLum = (c) => {
    const s = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};
const contrast = (a, b) => { const L1 = relLum(a), L2 = relLum(b);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

const b = await chromium.launch({ executablePath: HEADLESS_SHELL });
const seen = {};
for (const scheme of ["light", "dark"]) {
    const ctx = await b.newContext({ colorScheme: scheme, viewport: { width: 900, height: 600 } });
    const page = await ctx.newPage();
    await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        const p = path.join(ROOT, decodeURIComponent(u.pathname));
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            const ext = path.extname(p);
            const type = ext === ".mjs" || ext === ".js" ? "text/javascript"
                : ext === ".html" ? "text/html" : ext === ".json" ? "application/json"
                    : ext === ".css" ? "text/css" : ext === ".wasm" ? "application/wasm" : "text/plain";
            return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
        }
        return route.fulfill({ status: 404, body: "not found" });
    });
    for (const f of roster) {
        await page.goto("http://localhost:8787/" + f, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => { });
        await page.waitForTimeout(250);
        // Bottom-right corner: the least likely 8x8 to hold a header, a canvas or a first paragraph.
        const shot = await page.screenshot({ clip: { x: 880, y: 580, width: 8, height: 8 } });
        const px = await page.evaluate(async (b64) => {
            const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
            const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
            const g = c.getContext("2d"); g.drawImage(img, 0, 0);
            const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]];
        }, shot.toString("base64"));
        const fg = await page.evaluate(() => getComputedStyle(document.body).color);
        const fgc = (fg.match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number);
        (seen[f] = seen[f] || {})[scheme] = { px, fgc, ratio: contrast(px, fgc) };
    }
    await ctx.close();
}
await b.close();

for (const f of roster) {
    const r = seen[f];
    if (!r || !r.light || !r.dark) { ok("measured: " + f, false, "the page did not load in both schemes"); continue; }
    const same = hex(r.light.px) === hex(r.dark.px);
    const design = BY_DESIGN[f];

    if (design) {
        // Allowed to vary -- but the permission is not a pass. It still has to be readable both ways, which is
        // the only thing that makes "it follows your system" a feature rather than a coin flip.
        ok("!! " + f + " varies BY DESIGN and is readable in both -- " + design,
            r.light.ratio >= 4.5 && r.dark.ratio >= 4.5,
            "light " + hex(r.light.px) + " " + r.light.ratio.toFixed(2) +
            "  dark " + hex(r.dark.px) + " " + r.dark.ratio.toFixed(2));
        continue;
    }

    // *** THE CLAIM. *** A page with no theme control of its own must paint the SAME ground either way. If the
    // two measurements differ, the viewer's OS is choosing the engine's appearance, which is what put a white
    // page in front of Keith.
    ok("!! *** " + f + " paints the same ground whatever the viewer's OS says ***", same,
        "light " + hex(r.light.px) + "   dark " + hex(r.dark.px) +
        (same ? "" : "  <-- the browser default is showing through: this page sets no background"));
    ok("   ...and that ground is the tree's dark one, not the browser's white",
        relLum(r.light.px) < 0.2,
        hex(r.light.px) + "  luminance " + relLum(r.light.px).toFixed(3));
    ok("   ...and its text is legible on it (WCAG AA, 4.5)", r.light.ratio >= 4.5,
        "fg " + hex(r.light.fgc) + " on " + hex(r.light.px) + " = " + r.light.ratio.toFixed(2) + ":1");
}

// A ground fix that leaves white-tuned ink behind is the same bug walking the other way. #1e8449 and #c0392b
// were AA on white (4.72 / 5.44) and only AA-large on var(--bg) (4.16 / 3.61) -- measured before the swap, not
// after -- which is why the three pages moved to the theme's own pair rather than keeping their colours.
for (const f of FIXED) {
    // noComments, NOT the raw file and NOT codeOnly. The raw file matches the comment that EXPLAINS the swap --
    // this gate failed on its own prose the first time it ran, which is the trap sourceScan.mjs exists for. But
    // codeOnly blanks string literals too, and the last white-tuned red on report.html lived inside one
    // (`"color:#c0392b"`, built into an inline style at runtime). Blanking strings would have turned a real
    // violation into a silent pass -- the worse of the two failures, and the reason the tool is chosen by what
    // is being asked rather than by which one is stricter.
    const src = noComments(fs.readFileSync(path.join(ROOT, f), "utf8"));
    const found = src.match(/#1e8449|#c0392b/gi) || [];
    ok("!! " + f + " keeps no white-tuned verdict colour after being re-grounded -- in CSS or in a built style",
        found.length === 0, found.join(", ") || "none left");
}

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
process.exit(fails ? 1 : 0);
