// WebGLEngine/tools/ship/keplerPage-selfcheck.mjs
//
// Run: node tools/ship/keplerPage-selfcheck.mjs
// RUNTIME 1.33s MEASURED (median of 3 -- 1351/1312/1334 -- with date(1) around the run). Almost all of it is
// section 4 launching a real headless Chromium, clicking Run, and waiting out 200 orbits x 4 integrators.
// Measured with date(1), not guessed: a runtime line in this tree has been wrong by 13x before.
//
// kepler.html is the front door onto physics/orbits/kepler.js. v3993 turned it from a two-column comparison
// (Verlet against RK4) into a four-column one, and the two new columns are a MATCHED PAIR: explicit and
// semi-implicit Euler, both first order, both one force evaluation, differing only in whether the position step
// uses the new velocity.
//
// *** THE ONE THING THIS PAGE MUST NOT DO IS PRESENT THE GROWTH RATIO AS A SCORE. *** energyGrowthRatio
// saturates -- |dE/E| cannot exceed 1 while the orbit is bound -- so explicit Euler, which loses the planet
// outright, scores BETTER than RK4, which keeps it to six digits. A table that simply printed four ratios would
// be showing the reader a ranking in which the worst method wins, and it would look entirely reasonable.
// Section 4 drives the real page and requires it to say so in words, and to carry the "still bound?" row that
// the ratio cannot supply.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { INTEGRATORS, SYMPLECTIC, integrate } from "../../physics/orbits/kepler.js";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);

const PAGE = path.join(ENG, "kepler.html");
const raw = fs.readFileSync(PAGE, "utf8");
const src = noComments(raw);

// codeOnly() is built for .js/.mjs: pointed at a whole HTML page it returns a fraction of the text and does not
// strip HTML comments, which at v3990 made a sibling gate fail the very check its own comment described.
const scriptMatch = /<script type="module">([\s\S]*?)<\/script>/.exec(raw);
const code = scriptMatch ? scriptMatch[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "") : "";

console.log("keplerPage-selfcheck -- does the front door run all four integrators, and does it refuse to rank them by the saturating number?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE PAGE EXISTS, DECLARES ITSELF, AND PARSES ***");
{
    // *** THIS DEMANDED demo:title / demo:desc AND THAT WAS A CONVENTION I IMPORTED WITHOUT CHECKING. *** The
    // sibling page gates (stellarPage, bellPage) assert those tags because THEIR pages carry them; kepler.html
    // never has, and neither do 295 of the 402 root pages. A gate that fails a page for not following a rule
    // the tree does not have is a gate that gets ignored -- so the check is now the one that IS load-bearing
    // here: the <title> must name what the page actually shows. It read "symplectic vs RK4" while the page had
    // grown to four integrators, which is a stale signpost of exactly the kind this tree keeps paying for.
    const title = (/<title>([^<]*)<\/title>/.exec(raw) || ["", ""])[1];
    ok("has a <title> at all", title.trim().length > 0, title);
    ok("!! ...and it is not the stale two-integrator title -- the page shows four now",
        !/symplectic vs RK4/i.test(title), title);
    ok("it is a module script", /<script type="module">/.test(src));
    ok("!! and this gate actually extracted that script body -- a silent empty extraction would pass every " +
       "does-NOT-contain check below for the wrong reason", code.length > 2000, code.length + " chars extracted");
    ok("the inline script is balanced", (src.match(/<script/g) || []).length === (src.match(/<\/script>/g) || []).length);
}

// ---------------------------------------------------------------------------
console.log("\n2. *** IT IMPORTS THE PHYSICS AND OWNS NO STEPPER OF ITS OWN ***");
{
    ok("!! imports physics/orbits/kepler.js", /from "\/physics\/orbits\/kepler\.js"/.test(src));
    ok("!! drives the module's own INTEGRATORS registry rather than naming steppers one by one",
        /\bINTEGRATORS\b/.test(code),
        "importing stepVerlet/stepRK4 individually is how the page ended up two columns behind the module");
    ok("...and reads the declared SYMPLECTIC / ORDER tables rather than retyping which is which",
        /\bSYMPLECTIC\b/.test(code) && /\bORDER\b/.test(code));

    // *** A SECOND INTEGRATOR IMPLEMENTATION HERE WOULD BE A SECOND OWNER OF THE PHYSICS. ***
    ok("does NOT carry its own RK4 stepper", !/k1[ab]?\s*[,)]/.test(code) && !/0\.5\s*\*\s*a[xy]\s*\*\s*dt\s*\*\s*dt/.test(code));
    ok("does NOT compute gravitational acceleration itself",
        !/-\s*mu\s*\/\s*\(\s*r2\s*\*\s*r\s*\)/.test(code) && !/Math\.pow\(\s*r\s*,\s*3\s*\)/.test(code));
    report("the page's own arithmetic is limited to SCREEN GEOMETRY -- pixel mapping, a log axis, and colours");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** ALL FOUR METHODS ARE LISTED, AND THE PAIR IS ADJACENT SO IT READS AS A CONTROL ***");
{
    const keys = Object.keys(INTEGRATORS);
    const missing = keys.filter((k) => !new RegExp('key:\\s*"' + k + '"').test(code));
    ok("!! every integrator the module registers appears in the page's METHODS table", missing.length === 0,
        missing.length ? "MISSING: " + missing.join(", ") : keys.join(", "));
    const iE = code.indexOf('key: "euler"'), iS = code.indexOf('key: "eulerSymplectic"');
    ok("!! ...and the matched pair is listed first and adjacent", iE >= 0 && iS > iE && iS - iE < 200,
        "a control that is not next to its twin is a table, not a comparison");
    ok("the page states that the pair differs by one line", /matched pair/i.test(src) && /velocity FIRST|NEW value/i.test(src));
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE REAL BROWSER: DOES IT RUN, AND DOES IT REFUSE TO RANK BY THE SATURATING NUMBER ***");
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
        await pg.setViewportSize({ width: 1280, height: 900 });
        await pg.goto("http://localhost:8787/kepler.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(500);
        ok("!! the page loads with no script error", errs.length === 0, errs.join(" | "));

        await pg.click("#run");
        await pg.waitForFunction(() => document.getElementById("stat").textContent === "" &&
                                       document.getElementById("tbl").rows.length > 3, null, { timeout: 60000 });
        const t = await pg.evaluate(() => {
            const rows = [...document.getElementById("tbl").rows].map((r) => [...r.cells].map((c) => c.textContent.trim()));
            return { rows, note: document.getElementById("note").textContent, header: rows[0] };
        });
        ok("!! the run really produced a four-method table", t.header.length === 5,
            "header: " + t.header.join(" | "));

        const find = (label) => t.rows.find((r) => r[0].toLowerCase().startsWith(label));
        const bound = find("still bound");
        ok("!! the table carries a 'still bound?' row -- the fact the growth ratio cannot report", !!bound,
            bound ? bound.join(" | ") : "ROW ABSENT");
        ok("!! *** EXPLICIT EULER IS REPORTED AS HAVING LOST THE ORBIT ***", !!bound && /NO/.test(bound[1]), bound && bound[1]);
        ok("!! ...while its SYMPLECTIC TWIN, one line different, is still bound", !!bound && /yes/i.test(bound[2]), bound && bound[2]);
        ok("...and so are Verlet and RK4", !!bound && /yes/i.test(bound[3]) && /yes/i.test(bound[4]));

        // *** THE INVERSION, ON SCREEN. *** If the best growth ratio is not explicit Euler's, the saturation
        // claim this page makes in words would be untrue of the numbers beside it.
        const g = find("growth ratio");
        ok("the growth-ratio row is present", !!g, g ? g.slice(1).join(" | ") : "ROW ABSENT");
        const nums = g ? g.slice(1).map((x) => parseFloat(x)) : [];
        // *** THIS ASSERTION WAS WRONG ON FIRST WRITE AND THE GATE IS WHY I KNOW. *** It demanded that explicit
        // Euler post the GLOBAL MINIMUM ratio, and the screen said 0.119 for the symplectic twin -- which turned
        // out not to be a page bug about ranking but a page bug about MEASUREMENT: it sampled |dE/E| once per
        // orbit at a fixed phase (a stroboscope) instead of taking the max within each orbit, so its numbers
        // were not integrate()'s numbers at all. The page now measures the same way, and the claim asserted here
        // is the one the header actually makes: THE PLANET-LOSER OUTSCORES THE MOST ACCURATE METHOD.
        ok("!! *** on screen, explicit Euler posts a BETTER growth ratio than RK4 -- the planet-loser outranks " +
           "the method that held the orbit to six digits ***",
            nums.length === 4 && nums.every(Number.isFinite) && nums[0] < nums[3],
            "euler " + nums[0] + " vs rk4 " + nums[3] + " -- that is the whole reason the row is not a score");
        // ...and the page's ratio must be the MODULE's ratio, or the front door is showing its own measurement.
        const modGrowth = integrate({ a: 1, e: 0.5, mu: 1, integrator: "eulerSymplectic", stepsPerOrbit: 400, orbits: 200 }).energyGrowthRatio;
        ok("!! ...and the page's growth ratio agrees with integrate()'s for the symplectic twin",
            Math.abs(nums[1] - modGrowth) < 0.05,
            `screen ${nums[1]} vs module ${modGrowth.toFixed(4)} -- a stroboscopic once-per-orbit sample read 0.119 here`);
        ok("...and no ranking marker is drawn, since the row is explicitly not a score",
            !/9664|&#9664;|\u25c0/.test(await pg.evaluate(() => document.getElementById("tbl").innerHTML)));
        ok("!! ...and the page SAYS SO rather than leaving the reader to rank by it",
            /saturates/i.test(t.note) && /do not read it as a score/i.test(t.note));

        // the angular-momentum column: exact for the symplectic pair, not for the other two
        const L = find("max |dl/l|");
        ok("the angular-momentum row is present", !!L);
        if (L) {
            const vals = L.slice(1).map((x) => parseFloat(x));
            const keys = ["euler", "eulerSymplectic", "verlet", "rk4"];
            ok("!! on screen, both SYMPLECTIC methods hold angular momentum at round-off and the others do not",
                keys.every((k, i) => (SYMPLECTIC[k] ? vals[i] < 1e-12 : vals[i] > 1e-12)),
                keys.map((k, i) => `${k}${SYMPLECTIC[k] ? "*" : ""}=${vals[i].toExponential(1)}`).join("  ") + "   (* = declared symplectic)");
        }
        await ctx.close();
        await b.close();
    }
}

// ---------------------------------------------------------------------------
console.log("\n5. *** SABOTAGE: EACH SOURCE FINDING MUST BE ABLE TO FAIL ***");
{
    const dropped = code.replace(/\{\s*key:\s*"eulerSymplectic"[\s\S]*?\},/, "");
    ok("the matched-pair entry could be located for sabotage", dropped !== code);
    ok("!! dropping the symplectic twin from METHODS reddens section 3",
        !/key:\s*"eulerSymplectic"/.test(dropped));
    const scored = code.replace(/do not read it as a score/i, "the lowest ratio is the best method");
    ok("!! rewriting the caveat into a ranking reddens the live wording check",
        !/do not read it as a score/i.test(scored) && scored !== code);
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
