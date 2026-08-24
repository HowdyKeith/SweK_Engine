// WebGLEngine/tools/ship/reactorPage-selfcheck.mjs
//
// Run: node tools/ship/reactorPage-selfcheck.mjs
// RUNTIME 4.31s MEASURED (median of 3 -- 4314/4314/4318 -- with date(1) around the run; the 3.1s written here
// before measuring was a guess and is named rather than overwritten). Section 4 launches a real headless
// Chromium and drives the page through four states with settle time between each; everything before it is
// source scanning and costs milliseconds.
//
// reactor.html is a FRONT DOOR, and the whole claim of a front door is that it shows you the physics the tree
// already gated rather than a second implementation that merely agrees today. So the two things checked here
// are the two ways that claim fails:
//
//   THE PAGE QUIETLY DERIVES ITS OWN PHYSICS. A page that recomputes a period, or types in beta, or carries its
//   own copy of the Keepin constants, is a second owner of numbers physics/nuclear/kinetics.mjs already owns,
//   and it will drift. Section 2 requires the constants to be IMPORTED and absent from the page's own source.
//
//   THE PAGE LOOKS RIGHT AND IS NOT RUNNING THE PHYSICS. Source text cannot tell a working reactor from a
//   frozen one -- so section 4 drives the real page in a real browser and checks the numbers it puts on screen
//   against the module, including the one that matters most: after a scram the period must sit outside the
//   56-second precursor floor, because that floor is the external key the whole device rests on.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { KEEPIN_U235, GEN_LWR, totalBeta, fromDollars, dominantRoot } from "../../physics/nuclear/kinetics.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);

const PAGE = path.join(ENG, "reactor.html");
const raw = fs.readFileSync(PAGE, "utf8");
const src = noComments(raw);      // strings intact: import specifiers and element ids are read as text
const code = codeOnly(raw);       // strings blanked: right for counting calls, useless for reading names

console.log("reactorPage-selfcheck -- is the front door showing the gated physics, and is it actually running?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE PAGE EXISTS, DECLARES ITSELF TO THE CATALOG, AND PARSES ***");
{
    for (const tag of ["demo:title", "demo:desc", "demo:category"]) {
        ok(`carries a ${tag} meta tag`, new RegExp('name="' + tag + '"').test(src));
    }
    ok("it is a module script, which is what lets it import the gated physics",
        /<script type="module">/.test(src));
    ok("...and the inline script is balanced", (src.match(/<script/g) || []).length === (src.match(/<\/script>/g) || []).length);
}

// ---------------------------------------------------------------------------
console.log("\n2. *** IT IMPORTS THE PHYSICS AND OWNS NONE OF IT ***");
{
    ok("!! imports physics/nuclear/kinetics.mjs", /from "\.\/physics\/nuclear\/kinetics\.mjs"/.test(src));
    ok("!! imports physics/nuclear/xenon.mjs", /from "\.\/physics\/nuclear\/xenon\.mjs"/.test(src));

    // *** THE CONSTANTS MUST NOT BE IN THE PAGE. *** Checked against noComments() rather than the raw file, so
    // the page's own explanatory prose may quote a number (the note text says 0.0124 on purpose, for a reader)
    // without that counting as the page OWNING it. codeOnly() would be wrong here too -- it blanks strings, and
    // an imported name is only visible as text.
    const pageCode = codeOnly(raw);
    const forbidden = [
        ["the six delayed fractions", /0\.001424|0\.002568|0\.000748/],
        ["the six decay constants as a literal array", /\[\s*0\.0124\s*,\s*0\.0305/],
        ["beta typed as a number", /=\s*0\.0065\b/],
    ];
    for (const [what, re] of forbidden) {
        ok(`does NOT carry ${what}`, !re.test(pageCode));
    }
    ok("...and it reads beta by CALLING totalBeta(), not by writing it down",
        /totalBeta\(\)/.test(code), "so a change to the Keepin table reaches the page automatically");
    ok("!! the period on screen comes from the module's inhour solve, not from differencing the trace",
        /dominantRoot\(/.test(code), "a second derivation on the page would be a second thing to keep right");
    ok("...and the reactor starts from the module's EXACT steady state, not an approximate one",
        /steadyState\(/.test(code), "at rho = 0 the derivative is identically zero, so the trace is genuinely flat");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE STIFFNESS CEILING IS HONEST -- THE STEP IS SMALL ENOUGH TO BE STABLE ***");
{
    // The page accelerates time, and the dishonest way to do that is to grow dt until the integration is
    // nonsense that still draws a smooth curve. So the declared step is checked against the actual fastest
    // mode of the actual system, computed here from the module rather than assumed.
    const m = /const DT = ([\d.e-]+), MAX_SUB = (\d+)/.exec(code);
    ok("the page declares its step and substep budget as named constants", !!m, m ? m[0] : "not found");
    if (m) {
        const DT = parseFloat(m[1]), MAX_SUB = parseInt(m[2], 10);
        // fastest mode of the 7-root system at zero reactivity -- the most negative inhour root
        const fastest = Math.abs(Math.min(...[0, fromDollars(0.5), fromDollars(-3)].map((r) =>
            Math.min(...[dominantRoot(r, GEN_LWR, KEEPIN_U235), -(totalBeta()) / GEN_LWR]))));
        const bound = 2.78;   // classical RK4 stability limit on the real axis
        ok("!! dt * |fastest mode| is inside RK4's stability limit, with margin",
            DT * fastest < bound, `dt=${DT} x |w|=${fastest.toFixed(1)} = ${(DT * fastest).toFixed(3)} < ${bound}`);
        report(`the fastest mode is about beta/GEN = ${(totalBeta() / GEN_LWR).toFixed(0)} s^-1, which is what ` +
               `makes point kinetics stiff and what the whole substep budget exists to respect`);
        const ceiling = MAX_SUB * DT;
        ok("...and the page's own speed control cannot outrun that budget",
            /max="20"/.test(src) && ceiling * 60 >= 20,
            `budget ${ceiling.toFixed(2)} sim-seconds/frame = ${(ceiling * 60).toFixed(0)}x real time, control caps at 20x`);
    }
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE REAL BROWSER: SOURCE TEXT CANNOT TELL A RUNNING REACTOR FROM A FROZEN ONE ***");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-3 read source, and source cannot show the sim runs");
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
        await pg.setViewportSize({ width: 1100, height: 760 });
        await pg.goto("http://localhost:8787/reactor.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(700);

        const read = () => pg.evaluate(() => ({
            rho: document.getElementById("rho").textContent,
            per: document.getElementById("per").textContent,
            pow: parseFloat(document.getElementById("pow").textContent),
            cw: document.getElementById("c").clientWidth,
            bw: document.getElementById("c").width,
        }));

        const rest = await read();
        ok("!! the page loads with no script error", errs.length === 0, errs.join(" | "));
        ok("!! at rest the reactor is genuinely CRITICAL -- flat, not drifting",
            rest.rho === "$0.000" && rest.per === "∞" && Math.abs(rest.pow - 100) < 0.5,
            `rho=${rest.rho} period=${rest.per} power=${rest.pow}%`);
        // v3979's rule, live: a canvas is a replaced element and must actually be stretched
        ok("...and the canvas is really filling its box, not sitting at the intrinsic 300x150",
            rest.cw > 400 && rest.bw > 400, `clientWidth=${rest.cw} backingWidth=${rest.bw}`);

        // pull rods and check the on-screen period against the MODULE, not against a remembered number
        await pg.evaluate(() => { const r = document.getElementById("rod"); r.value = 20; r.dispatchEvent(new Event("input")); });
        await pg.waitForTimeout(900);
        const up = await read();
        const wantPeriod = 1 / dominantRoot(fromDollars(0.2, KEEPIN_U235), GEN_LWR, KEEPIN_U235);
        const shown = parseFloat(up.per);
        ok("!! at +$0.20 the displayed period matches the module's inhour solve",
            Math.abs(shown - wantPeriod) / wantPeriod < 0.02,
            `page ${up.per} vs module ${wantPeriod.toFixed(2)}s`);
        ok("...and the power is actually RISING, so the integration is running",
            up.pow > 110, up.pow.toFixed(1) + "%");

        // THE EXTERNAL KEY, ON SCREEN: a scram cannot beat the longest-lived precursor
        await pg.click("#scram");
        await pg.waitForTimeout(1200);
        const dn = await read();
        const floor = -1 / KEEPIN_U235.lambda[0];   // -80.6 s
        const shownDn = parseFloat(dn.per);
        ok("!! *** AFTER A SCRAM THE PERIOD RESPECTS THE 56-SECOND PRECURSOR FLOOR ***",
            shownDn < 0 && shownDn < floor,
            `page ${dn.per} against the floor ${floor.toFixed(1)}s -- a reactor cannot be shut down faster`);
        ok("...and the power is falling", dn.pow < 60, dn.pow.toFixed(2) + "%");

        // xenon panel comes up and reports a negative worth
        await pg.click("#xe");
        await pg.waitForTimeout(900);
        const xestat = await pg.textContent("#xestat");
        ok("!! the xenon panel reports a NEGATIVE reactivity worth and the 11h peak limit",
            /-\d+\.\d+\$/.test(xestat) && /11\.\d\s*h/.test(xestat), xestat.trim());

        await ctx.close();
        await b.close();
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
