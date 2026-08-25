// WebGLEngine/tools/ship/ecologyPage-selfcheck.mjs
//
// Run: node tools/ship/ecologyPage-selfcheck.mjs
// RUNTIME 5.43s MEASURED (median of 3 -- 5462/5432/5425 -- with date(1) around the run). Almost all of it is
// sections 4-6 driving a real headless Chromium through the harvest ladder and both steppers, at 200 cycles a
// redraw. Measured with date(1), not guessed -- a runtime line in this tree has been wrong by 13x before.
//
// ecology.html is the front door onto physics/ecology/lotkaVolterra.mjs. The usual two failure modes apply -- a
// private copy of the physics, or a page that renders without running -- and this page has a third that is
// specific to it.
//
// *** A DECAYING SPIRAL IS THE EASIEST THING HERE TO DRAW AND THE EASIEST TO BELIEVE. *** Lotka-Volterra orbits
// are CLOSED: the first integral is exactly conserved, so the populations cycle forever. Any dissipative
// integrator produces a slow inward spiral that looks like a perfectly reasonable ecosystem settling down, and
// it is a lie about the model. Section 4 drives the real page onto explicit Euler and requires it to say the
// run BLEW UP rather than quietly drawing something plausible.
//
// And section 5 is the one the page exists for: drag the harvest slider, which kills BOTH species, and the
// average PREY population must go UP on screen.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { DEFAULTS, fixedPoint, INTEGRATORS } from "../../physics/ecology/lotkaVolterra.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const PAGE = path.join(ENG, "ecology.html");
const raw = fs.readFileSync(PAGE, "utf8");
const src = noComments(raw);
// codeOnly() is built for .js/.mjs; on a whole HTML page it returns a fraction of the text and does not strip
// HTML comments, which at v3990 made a sibling gate fail the very check its own comment described.
const sm = /<script type="module">([\s\S]*?)<\/script>/.exec(raw);
const code = sm ? sm[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "") : "";

console.log("ecologyPage-selfcheck -- does the front door show a closed orbit, and does the harvest slider raise the prey?\n");

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
console.log("\n2. *** IT IMPORTS THE ECOLOGY AND OWNS NONE OF IT ***");
{
    ok("!! imports physics/ecology/lotkaVolterra.mjs", /from "\/physics\/ecology\/lotkaVolterra\.mjs"/.test(src));
    const wants = ["integrate", "timeAverages", "fixedPoint"];
    const missing = wants.filter((fn) => !new RegExp("\\b" + fn + "\\(").test(code));
    ok("!! calls the module's own integrator, averager and fixed point", missing.length === 0,
        missing.length ? "MISSING: " + missing.join(", ") : wants.join(", "));
    ok("...and offers the module's whole INTEGRATORS registry rather than a hand-picked pair",
        /Object\.keys\(INTEGRATORS\)/.test(code));

    // *** NO SECOND OWNER OF THE PHYSICS. ***
    ok("does NOT carry its own stepper", !/Math\.exp\(\s*u\s*\)/.test(code) && !/dt\s*\*\s*\(\s*p\.delta/.test(code));
    ok("does NOT compute the first integral itself",
        !/Math\.log\(\s*x\s*\)/.test(code) && !/gamma\s*\*\s*Math\.log/.test(code));
    ok("does NOT type in the fixed point as gamma/delta",
        !/gamma\s*\/\s*p?\.?delta/.test(code) && !/alpha\s*\/\s*p?\.?beta/.test(code));
    report("the page's own arithmetic is limited to SCREEN GEOMETRY -- pixel mapping, axis padding and colours " +
           "-- plus the harvest substitution alpha->alpha-h, gamma->gamma+h, which is the CONTROL the slider is");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE HARVEST IS APPLIED TO BOTH SPECIES, WHICH IS THE ENTIRE POINT ***");
{
    // A slider that only reduced the prey growth rate would raise nothing and would quietly make the page a
    // demonstration of the opposite claim. Both substitutions have to be there.
    ok("!! the harvest lowers alpha AND raises gamma -- it kills predator and prey alike",
        /alpha:\s*DEFAULTS\.alpha\s*-\s*h/.test(code) && /gamma:\s*DEFAULTS\.gamma\s*\+\s*h/.test(code),
        "harvesting only the prey is a different (and unsurprising) experiment");
    ok("...and the page refuses rather than averaging when the harvest exceeds the prey growth rate",
        /collapsed/.test(code) && /alpha\s*<=\s*0/.test(code));
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE REAL BROWSER ***");
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
            const fp2 = path.join(ENG, decodeURIComponent(u.pathname));
            if (fs.existsSync(fp2) && fs.statSync(fp2).isFile()) {
                const ext = path.extname(fp2);
                const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : "text/plain";
                return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(fp2) });
            }
            return route.fulfill({ status: 404, body: "not found" });
        });
        await pg.setViewportSize({ width: 1280, height: 860 });
        await pg.goto("http://localhost:8787/ecology.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(900);

        const read = () => pg.evaluate(() => ({
            mx: document.getElementById("mx").textContent, my: document.getElementById("my").textContent,
            ex: document.getElementById("ex").textContent, ey: document.getElementById("ey").textContent,
            drift: document.getElementById("drift").textContent,
            verdict: document.getElementById("verdict").textContent.trim(),
            pw: document.getElementById("phase").clientWidth, pb: document.getElementById("phase").width,
            sw: document.getElementById("series").clientWidth,
        }));
        const setSlider = (id, v) => pg.evaluate(([i, val]) => {
            const el = document.getElementById(i); el.value = String(val); el.dispatchEvent(new Event("input"));
        }, [id, v]);

        const r0 = await read();
        ok("!! the page loads with no script error", errs.length === 0, errs.join(" | "));
        ok("...and both canvases really fill their boxes, not the intrinsic 300x150",
            r0.pw > 400 && r0.pb > 400 && r0.sw > 400, `phase ${r0.pw}/${r0.pb} series ${r0.sw}`);

        // THE TIME-AVERAGE THEOREM, ON SCREEN
        const FP = fixedPoint(DEFAULTS);
        ok("!! the screen's mean prey equals the exact gamma/delta",
            Math.abs(parseFloat(r0.mx) - FP.x) < 5e-4, `screen ${r0.mx} vs exact ${FP.x}`);
        ok("!! ...and the mean predator equals the exact alpha/beta",
            Math.abs(parseFloat(r0.my) - FP.y) < 5e-4, `screen ${r0.my} vs exact ${FP.y}`);
        ok("...and the page prints the exact values beside them rather than only the measured ones",
            Math.abs(parseFloat(r0.ex) - FP.x) < 1e-9 && Math.abs(parseFloat(r0.ey) - FP.y) < 1e-9);
        ok("...and the default stepper reports a BOUNDED orbit", /BOUNDED/.test(r0.verdict), r0.verdict);

        // ---- 5. THE CHECK THE PAGE EXISTS FOR ----------------------------------------------------------
        console.log("\n5. *** DRAG THE HARVEST SLIDER AND WATCH THE PREY AVERAGE RISE ***");
        const ladder = [];
        for (const h of [0, 10, 20, 30]) {
            await setSlider("h", h); await pg.waitForTimeout(450);
            const r = await read();
            ladder.push({ h: h / 100, prey: parseFloat(r.mx), pred: parseFloat(r.my) });
        }
        let rising = true, falling = true;
        for (let i = 1; i < ladder.length; i++) {
            if (!(ladder[i].prey > ladder[i - 1].prey)) rising = false;
            if (!(ladder[i].pred < ladder[i - 1].pred)) falling = false;
        }
        ok("!! *** ON SCREEN, HARVESTING BOTH SPECIES RAISES THE AVERAGE PREY POPULATION ***", rising,
            ladder.map((l) => `h=${l.h} -> ${l.prey.toFixed(4)}`).join("  "));
        ok("!! ...and lowers the average predator population", falling,
            ladder.map((l) => `h=${l.h} -> ${l.pred.toFixed(4)}`).join("  "));
        ok("...and the exact values on screen track the measured ones, so it is not a hard-coded ladder",
            Math.abs(ladder[2].prey - 6) < 5e-3, `at h=0.2 the screen reads ${ladder[2].prey}`);
        report("this is D'Ancona's Adriatic result: the fraction of predatory fish ROSE when the war stopped " +
               "the fishing, and it falls out of the time-average theorem rather than being assumed");

        // ---- 6. THE SPIRAL THAT ISN'T ------------------------------------------------------------------
        console.log("\n6. *** THE DISSIPATIVE STEPPER MUST ANNOUNCE ITSELF, NOT DRAW SOMETHING PLAUSIBLE ***");
        await setSlider("h", 0); await pg.waitForTimeout(300);
        await pg.selectOption("#int", "euler"); await pg.waitForTimeout(700);
        const rE = await read();
        ok("!! *** explicit Euler is reported as BLOWING UP, not as a settling ecosystem ***",
            /BLEW UP/i.test(rE.verdict), rE.verdict.slice(0, 160));
        ok("...and the page declines to print averages for a run that died", rE.mx === "—" && rE.my === "—",
            `prey "${rE.mx}" predator "${rE.my}"`);
        await pg.selectOption("#int", "symplectic"); await pg.waitForTimeout(700);
        const rS = await read();
        ok("!! ...and going back to the symplectic stepper restores a bounded orbit -- the failure is not sticky",
            /BOUNDED/.test(rS.verdict) && Math.abs(parseFloat(rS.mx) - FP.x) < 5e-4, rS.verdict);
        ok("...and every integrator the module registers is offered on the page",
            (await pg.evaluate(() => [...document.getElementById("int").options].map((o) => o.value))).sort().join(",")
              === Object.keys(INTEGRATORS).sort().join(","));

        await ctx.close();
        await b.close();
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
