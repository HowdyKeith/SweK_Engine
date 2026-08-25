// WebGLEngine/tools/ship/bellPage-selfcheck.mjs
//
// Run: node tools/ship/bellPage-selfcheck.mjs
// RUNTIME 3.42s MEASURED (median of 3 -- 3448/3417/3411 -- with date(1) around the run). Almost all of it is
// section 4 launching a real headless Chromium and driving the page through four states; sections 1-3 are
// source scanning and cost milliseconds.
//
// bell.html is a front door onto physics/quantum/bell.mjs, and the two ways a front door fails without failing
// its own physics gate are the two things checked here: it grows a private copy of the physics, or it renders
// something that never actually runs.
//
// *** THE SPECIFIC TEMPTATION THIS PAGE HAD TO RESIST. *** Every reader already knows the two numbers -- 2 and
// 2.828 -- so the obvious build draws a line at each, labelled, and calls it a Bell demo. That is a diagram OF
// the physics rather than a window ONTO it, and it would keep looking right after the module underneath it
// broke. So section 2 requires the classical bound to arrive from lhvBoundBySearch() (which re-enumerates all
// 16 local strategies at page load) and the quantum bound from the module's own constant, and FORBIDS either
// number appearing in the page's own arithmetic.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { chsh, correlatorMatrix, SINGLET, OPTIMAL_ANGLES, CLASSICAL_BOUND, TSIRELSON_BOUND }
    from "../../physics/quantum/bell.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

const PAGE = path.join(ENG, "bell.html");
const raw = fs.readFileSync(PAGE, "utf8");
const src = noComments(raw);

// *** THE PAGE'S JAVASCRIPT IS EXTRACTED FROM ITS <script> BLOCK, NOT READ THROUGH codeOnly(raw). ***
// codeOnly() is built for .js/.mjs source: pointed at a whole HTML file it returns a fraction of the text
// (1743 of 12056 characters here) and, critically, does NOT strip HTML comments -- so this gate's own
// explanatory <!-- --> header, which quotes "2.828" while explaining why the page must not contain it,
// was being scanned as if it were page code and failing the check it was describing. Pulling the module
// script out first and stripping only JS comments scans exactly what the browser executes.
const scriptMatch = /<script type="module">([\s\S]*?)<\/script>/.exec(raw);
const code = scriptMatch
    ? scriptMatch[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    : "";

console.log("bellPage-selfcheck -- is the front door showing the gated Bell physics, live, without a private copy?\n");

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
console.log("\n2. *** BOTH BOUNDS ARE COMPUTED, NOT DRAWN IN -- THE THING THIS PAGE EXISTS TO GET RIGHT ***");
{
    ok("!! imports physics/quantum/bell.mjs", /from "\.\/physics\/quantum\/bell\.mjs"/.test(src));
    const wants = ["correlatorMatrix", "chsh", "lhvBoundBySearch", "monteCarloCorrelator", "mulberry32"];
    const missing = wants.filter((fn) => !new RegExp("\\b" + fn + "\\(").test(src));
    ok("!! calls the module's own functions for every physical quantity", missing.length === 0,
        missing.length ? "MISSING CALLS: " + missing.join(", ") : wants.length + " functions, all called");

    ok("!! *** THE CLASSICAL BOUND COMES FROM lhvBoundBySearch(), RE-ENUMERATED AT PAGE LOAD ***",
        /lhvBoundBySearch\(\)/.test(code) && /CLASSICAL\s*=\s*LHV\.maxAbs/.test(code),
        "not a literal 2 drawn as a reference line");
    ok("!! ...and the quantum bound from the module's TSIRELSON_BOUND, not a typed 2.828",
        /TSIRELSON_BOUND/.test(code) && !/2\.828/.test(code),
        "no 2.828 literal anywhere in the page's code");

    // the page must not carry the correlator or the bound values as its own arithmetic
    ok("does NOT carry the singlet correlator formula itself",
        !/-\s*Math\.cos\(\s*\w+\s*-\s*\w+\s*\)/.test(code));
    ok("does NOT carry 2*Math.sqrt(2) as its own constant", !/2\s*\*\s*Math\.sqrt\(\s*2\s*\)/.test(code));
    report("the page's own arithmetic is limited to SCREEN GEOMETRY -- pixel positions, angle-to-radian " +
           "conversion for the sliders, and a percentage for the readout. None of that is a physical law");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE CHART'S AXIS TOP IS THE ALGEBRAIC MAXIMUM, WHICH IS A CLAIM WORTH CHECKING ***");
{
    // The chart scales to |S| = 4. That is not an arbitrary framing choice: 4 is the ALGEBRAIC maximum of a sum
    // of four correlations each bounded by 1, so the two bound lines sit at meaningful FRACTIONS of the frame
    // rather than wherever autoscaling put them. Checked from the module, not assumed.
    const m = /const MAXY = (\d+)/.exec(code);
    ok("the chart declares its axis maximum as a named constant", !!m, m ? m[0] : "not found");
    if (m) {
        const MAXY = parseInt(m[1], 10);
        ok("!! and it is 4 -- the algebraic maximum of four correlations each in [-1,1]", MAXY === 4, "MAXY=" + MAXY);
        ok("...which genuinely bounds both physical bounds", CLASSICAL_BOUND < MAXY && TSIRELSON_BOUND < MAXY,
            `${CLASSICAL_BOUND} < ${TSIRELSON_BOUND.toFixed(4)} < ${MAXY}`);
    }
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE REAL BROWSER: SOURCE TEXT CANNOT TELL A LIVE PAGE FROM A FROZEN ONE ***");
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
        await pg.goto("http://localhost:8787/bell.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(600);

        const read = () => pg.evaluate(() => ({
            S: parseFloat(document.getElementById("S").textContent),
            cb: document.getElementById("cb").textContent,
            tb: document.getElementById("tb").textContent,
            verdict: document.getElementById("verdict").textContent.trim(),
            dialCW: document.getElementById("dial").clientWidth, dialBW: document.getElementById("dial").width,
            chartCW: document.getElementById("chart").clientWidth,
        }));

        const r0 = await read();
        ok("!! the page loads with no script error", errs.length === 0, errs.join(" | "));
        ok("!! the classical bound ON SCREEN is what the 16-strategy enumeration produced",
            r0.cb === String(CLASSICAL_BOUND), "screen=" + r0.cb + " module=" + CLASSICAL_BOUND);
        ok("!! and the Tsirelson bound on screen matches the module's constant",
            r0.tb === TSIRELSON_BOUND.toFixed(3), "screen=" + r0.tb);
        ok("...and both canvases are really filling their boxes, not at the intrinsic 300x150",
            r0.dialCW > 400 && r0.dialBW > 400 && r0.chartCW > 300, `dial ${r0.dialCW}/${r0.dialBW} chart ${r0.chartCW}`);

        // the headline: at the optimal angles the page shows the Tsirelson value and says VIOLATES
        await pg.click("#optimal");
        await pg.waitForTimeout(300);
        const rOpt = await read();
        ok("!! *** AT THE OPTIMAL ANGLES THE PAGE SHOWS 2*sqrt(2), MATCHING THE MODULE ***",
            rel(rOpt.S, TSIRELSON_BOUND) < 1e-3, "screen |S|=" + rOpt.S + " module=" + TSIRELSON_BOUND.toFixed(4));
        ok("...and it reports a violation", /VIOLATES/.test(rOpt.verdict), rOpt.verdict);

        // a setting the module says does NOT violate must render the other branch -- both sides exercised
        await pg.evaluate(() => {
            const s = document.getElementById("b"); s.value = 0; s.dispatchEvent(new Event("input"));
            const t = document.getElementById("bp"); t.value = 0; t.dispatchEvent(new Event("input"));
        });
        await pg.waitForTimeout(300);
        const rFlat = await read();
        const moduleFlat = Math.abs(chsh(OPTIMAL_ANGLES.a, OPTIMAL_ANGLES.ap, 0, 0, (x, y) => correlatorMatrix(x, y, SINGLET)));
        // *** ABSOLUTE, NOT RELATIVE, AND THAT IS THE WHOLE POINT AT THIS SETTING. *** The module's |S| at
        // b=b'=0 is 1.2246e-16 -- floating-point zero, not exact zero -- so a RELATIVE comparison divides by
        // 1e-16 and reports an error of 1.0 for two numbers that agree perfectly. The first draft of this
        // check used rel() and failed for exactly that reason while printing "module=0.0000", which is the
        // kind of near-zero trap a tolerance chosen by eye walks straight into.
        ok("!! at b=b'=0 the page agrees with the module that there is NO violation",
            Math.abs(rFlat.S - moduleFlat) < 1e-3 && !/VIOLATES/.test(rFlat.verdict),
            `screen |S|=${rFlat.S} module=${moduleFlat.toExponential(3)} -- "${rFlat.verdict}"`);
        report("both branches of the verdict are exercised, so the page is not merely printing VIOLATES " +
               "unconditionally -- which would look identical at the optimal angles");

        // Monte Carlo toggles and the page survives it
        await pg.click("#optimal"); await pg.waitForTimeout(200);
        await pg.click("#mc"); await pg.waitForTimeout(1200);
        const rMc = await read();
        ok("!! the Monte Carlo overlay runs without error and leaves the exact readout untouched",
            errs.length === 0 && rel(rMc.S, TSIRELSON_BOUND) < 1e-3, "|S|=" + rMc.S);

        await ctx.close();
        await b.close();
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
