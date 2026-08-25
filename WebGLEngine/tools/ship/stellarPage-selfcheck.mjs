// WebGLEngine/tools/ship/stellarPage-selfcheck.mjs
//
// Run: node tools/ship/stellarPage-selfcheck.mjs
// RUNTIME 3.33s MEASURED (median of 3 -- 3380/3304/3326 -- with date(1) around the run). Almost all of it is
// section 4 launching a real headless Chromium and driving the page across five polytropic indices.
//
// stellar.html is a front door onto physics/stellar/laneEmden.mjs. The usual two failure modes apply -- a
// private copy of the physics, or a page that renders without running -- but this page has a THIRD one that is
// specific to it and is the reason the gate exists.
//
// *** n=5 IS THE EASIEST THING ON THIS PAGE TO FAKE, AND FAKING IT WOULD BE INVISIBLE. *** An n=5 polytrope has
// INFINITE RADIUS: its density approaches zero without ever reaching it. The comfortable way to draw that is to
// integrate out to some large xi, stop, and let the curve end at the edge of the plot -- which looks EXACTLY
// like a star with a surface. Section 4 drives the real page to n=5 and requires it to say, in words, that
// there is no surface, while reporting one at the indices either side.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { solve, EXACT_XI1 } from "../../physics/stellar/laneEmden.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

const PAGE = path.join(ENG, "stellar.html");
const raw = fs.readFileSync(PAGE, "utf8");
const src = noComments(raw);

// The page's JavaScript, extracted from its <script> block. codeOnly() is built for .js/.mjs files: pointed at
// a whole HTML page it returns a fraction of the text and does not strip HTML comments, which at v3990 made a
// sibling gate fail the very check its own comment was describing.
const scriptMatch = /<script type="module">([\s\S]*?)<\/script>/.exec(raw);
const code = scriptMatch
    ? scriptMatch[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    : "";

console.log("stellarPage-selfcheck -- does the front door show the gated stellar physics, including the case with no answer?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE PAGE EXISTS, DECLARES ITSELF, AND PARSES ***");
{
    for (const tag of ["demo:title", "demo:desc", "demo:category"]) ok(`carries a ${tag} meta tag`, new RegExp('name="' + tag + '"').test(src));
    ok("it is a module script", /<script type="module">/.test(src));
    ok("!! and this gate actually extracted that script body -- a silent empty extraction would pass every " +
       "does-NOT-contain check below for the wrong reason", code.length > 2000, code.length + " chars extracted");
    ok("the inline script is balanced", (src.match(/<script/g) || []).length === (src.match(/<\/script>/g) || []).length);
}

// ---------------------------------------------------------------------------
console.log("\n2. *** IT IMPORTS THE PHYSICS AND OWNS NONE OF IT ***");
{
    ok("!! imports physics/stellar/laneEmden.mjs", /from "\.\/physics\/stellar\/laneEmden\.mjs"/.test(src));
    const wants = ["solve", "massFromBoundary"];
    const missing = wants.filter((fn) => !new RegExp("\\b" + fn + "\\(").test(code));
    ok("!! calls the module's own solver and mass routine", missing.length === 0,
        missing.length ? "MISSING CALLS: " + missing.join(", ") : wants.join(", "));
    ok("!! and reads the closed forms from the module's EXACT / EXACT_XI1 tables",
        /\bEXACT\b/.test(code) && /EXACT_XI1/.test(code));

    // *** THE PAGE MUST NOT INTEGRATE THE ODE ITSELF. *** A second RK4 loop here would be a second owner of the
    // physics, free to drift from the gated one.
    ok("does NOT carry its own RK4 stepper", !/k1[ab]?\s*[,)]/.test(code) && !/dtheta\s*\+=/.test(code));
    ok("does NOT carry the Lane-Emden right-hand side itself",
        !/Math\.pow\(\s*\w+\s*,\s*n\s*\)\s*[-+]\s*\(/.test(code) && !/2\s*\/\s*xi/.test(code));
    // and it must not type in the closed-form surface values
    ok("does NOT carry sqrt(6) or pi as a typed surface radius",
        !/Math\.sqrt\(\s*6\s*\)/.test(code) && !/xi1\s*=\s*Math\.PI/.test(code));
    report("the page's own arithmetic is limited to SCREEN GEOMETRY -- pixel mapping, ring radii, and a shade " +
           "from theta^n. None of that is a physical law");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE n=5 HANDLING IS EXPLICIT IN THE SOURCE, NOT AN ACCIDENT OF PLOT LIMITS ***");
{
    ok("!! the page branches on the module returning NO surface", /xi1\s*===\s*null/.test(code),
        "it asks the module rather than inferring a surface from where the curve ran out");
    ok("...and says so in words rather than only in a plot", /NO SURFACE/.test(src) && /INFINITE RADIUS/.test(src));
    ok("...and labels the drawn edge as a truncation in that case", /TRUNCATION/i.test(src));
    report("a page that simply integrated to a fixed xi and stopped would look identical at n=5 and be wrong; " +
           "the distinction has to be made from the module's own null, which is what this checks");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE REAL BROWSER: DOES IT AGREE WITH THE MODULE, INCLUDING WHERE THE MODULE SAYS 'NO ANSWER' ***");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-3 read source, and source cannot show it runs");
    } else {
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const ctx = await b.newContext();
        const pg = await ctx.newPage();
        const errs = [];
        pg.on("pageerror", (e) => errs.push(String(e.message)));
        await pg.route("**/*", (route) => {
            const u = new URL(route.request().url());
            const p = path.join(ENG, decodeURIComponent(u.pathname));
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                const ext = path.extname(p);
                const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : "text/plain";
                return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
            }
            return route.fulfill({ status: 404, body: "not found" });
        });
        await pg.setViewportSize({ width: 1180, height: 720 });
        await pg.goto("http://localhost:8787/stellar.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(700);

        const read = () => pg.evaluate(() => ({
            xi1: document.getElementById("xi1").textContent,
            mass: document.getElementById("mass").textContent,
            verdict: document.getElementById("verdict").textContent.trim(),
            cw: document.getElementById("prof").clientWidth, bw: document.getElementById("prof").width,
            starCw: document.getElementById("star").clientWidth,
        }));

        const r0 = await read();
        ok("!! the page loads with no script error", errs.length === 0, errs.join(" | "));
        ok("...and both canvases really fill their boxes, not the intrinsic 300x150",
            r0.cw > 400 && r0.bw > 400 && r0.starCw > 300, `prof ${r0.cw}/${r0.bw} star ${r0.starCw}`);

        // the two indices with a finite closed form: the page must land on them
        for (const [btn, idx] of [["#p0", 0], ["#p1", 1]]) {
            await pg.click(btn); await pg.waitForTimeout(350);
            const r = await read();
            ok(`!! n=${idx}: the page's surface matches the exact ${EXACT_XI1[idx].toFixed(6)}`,
                rel(parseFloat(r.xi1), EXACT_XI1[idx]) < 1e-5, "screen " + r.xi1);
            ok(`...and it says so rather than staying silent`, /matches the closed form/.test(r.verdict), r.verdict);
        }

        // An index with no closed form: the page must still agree with the module's integration.
        // *** THE TOLERANCE IS THE PAGE'S DISPLAY PRECISION, NOT A NUMBER CHOSEN BY EYE. *** The readout is
        // toFixed(4), so the most it can ever agree to is half of the last displayed digit -- 5e-5 absolute.
        // A first draft used a 1e-6 RELATIVE tolerance and failed here on 6.8968 against 6.89684862, which is
        // a rounding artefact of the display and not a disagreement about any physics.
        const DISPLAY_TOL = 5e-5;   // half the last digit of toFixed(4)
        await pg.click("#p3"); await pg.waitForTimeout(350);
        const r3 = await read();
        const mod3 = solve(3, { dxi: 1e-3, maxXi: 24 }).xi1;
        ok("!! n=3: the page agrees with the module's own integration at the same step",
            Math.abs(parseFloat(r3.xi1) - mod3) <= DISPLAY_TOL,
            `screen ${r3.xi1} module ${mod3.toFixed(8)} -- diff ${Math.abs(parseFloat(r3.xi1) - mod3).toExponential(2)}, display floor ${DISPLAY_TOL}`);

        // *** THE CASE THE WHOLE GATE EXISTS FOR ***
        await pg.click("#p5"); await pg.waitForTimeout(400);
        const r5 = await read();
        ok("!! *** n=5: THE PAGE REPORTS NO SURFACE, RATHER THAN A NUMBER WHERE THE CURVE RAN OUT ***",
            /none/i.test(r5.xi1), "surface field reads: " + r5.xi1);
        ok("!! ...and states the physical consequence in words", /INFINITE RADIUS/.test(r5.verdict), r5.verdict);
        ok("...and declines to report a mass integral for a star with no boundary", r5.mass === "—", r5.mass);
        ok("...while the module agrees there is no surface there", solve(5, { dxi: 1e-3, maxXi: 24 }).xi1 === null);
        report("that is the check that separates an honest infinite-radius star from a truncated plot: both " +
               "draw the same picture, and only one of them says so");

        // and back to a finite index, to prove the null state is not sticky
        await pg.click("#p1"); await pg.waitForTimeout(350);
        const rBack = await read();
        ok("!! returning to n=1 restores a real surface -- the no-surface state is not sticky",
            rel(parseFloat(rBack.xi1), Math.PI) < 1e-5, "screen " + rBack.xi1);

        await ctx.close();
        await b.close();
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
