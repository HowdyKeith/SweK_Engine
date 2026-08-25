// WebGLEngine/tools/ship/cartPolePage-selfcheck.mjs
//
// Run: node tools/ship/cartPolePage-selfcheck.mjs
// RUNTIME 14.6s MEASURED (median of 3 -- 14620/14551/14504 -- with date(1) around the run). Almost all of it
// is REAL TIME: sections 5 and 6 have to let the live animation actually run -- 2.5s for the pole to stay up
// at a hundred times the gain, 3s for it to fall at a hundredth, 3s for the planted design to drop it. A
// simulation gate can be hurried; a gate watching an animation cannot.
//
// cartpole.html is the front door onto physics/control/cartPole.mjs, and it is a LIVE simulation rather than a
// plot, so the two usual failure modes (a private copy of the physics, a page that renders without running) are
// joined by a third: a page that runs but is not actually closing the loop. A cart-pole drawn with the pole
// pinned upright looks exactly like a cart-pole being balanced.
//
// Section 5 therefore does not ask whether the pole is up. It winds the gain multiplier DOWN past the margin and
// requires the pole to FALL, then winds it up to a hundred times and requires it to stay up. A page that was not
// really integrating would fail both.
//
// *** AND SECTION 6 IS THE ONE THE DEVICE EXISTS FOR: *** the planted controller's own readouts -- residual,
// stability on its own model, Kalman inequality -- must all still say fine ON SCREEN while the pole falls over.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { PARAMS, linearize, lqrGain, gainMarginLower } from "../../physics/control/cartPole.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const raw = fs.readFileSync(path.join(ENG, "cartpole.html"), "utf8");
const src = noComments(raw);
const sm = /<script type="module">([\s\S]*?)<\/script>/.exec(raw);
const code = sm ? sm[1].replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "") : "";

console.log("cartPolePage-selfcheck -- does the page really close the loop, and does it show a good controller failing?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE PAGE EXISTS, DECLARES ITSELF, AND PARSES ***");
{
    for (const tag of ["demo:title", "demo:desc", "demo:category"]) ok(`carries a ${tag} meta tag`, new RegExp('name="' + tag + '"').test(src));
    ok("it is a module script", /<script type="module">/.test(src));
    ok("!! and this gate actually extracted that script body", code.length > 2000, code.length + " chars extracted");
    ok("the inline script is balanced", (src.match(/<script/g) || []).length === (src.match(/<\/script>/g) || []).length);
}

// ---------------------------------------------------------------------------
console.log("\n2. *** IT IMPORTS THE CONTROL THEORY AND OWNS NONE OF IT ***");
{
    ok("!! imports physics/control/cartPole.mjs", /from "\/physics\/control\/cartPole\.mjs"/.test(src));
    const wants = ["linearize", "lqrGain", "nonlinearDerivative", "lyapunovStable", "returnDifferenceMin"];
    const missing = wants.filter((fn) => !new RegExp("\\b" + fn + "\\(").test(code));
    ok("!! calls the module's linearisation, Riccati solve, plant and both verdicts", missing.length === 0,
        missing.length ? "MISSING: " + missing.join(", ") : wants.join(", "));
    ok("does NOT carry its own Riccati solve", !/A'P|riccati|Riccati/.test(code) || !/for \(let t = 0/.test(code));
    // *** THIS FIRST BANNED Math.cos(state[2]) AND CAUGHT THE DRAWING CODE. *** The page must draw a leaning
    // pole, so trigonometry on the angle is exactly what it is supposed to contain; what it must not contain is
    // PHYSICS. The precise discriminator is which PARAMS it reads: the pole LENGTH is screen geometry, while
    // gravity and the two masses appear only in the equations of motion.
    const paramsRead = [...code.matchAll(/PARAMS\.(\w+)/g)].map((m) => m[1]);
    ok("!! the page reads only the pole LENGTH from PARAMS -- never gravity or the masses",
        paramsRead.length > 0 && paramsRead.every((k) => k === "l"),
        "reads: " + [...new Set(paramsRead)].join(", ") + " (l is the drawn pole length; g, m and M would be dynamics)");
    ok("...and carries neither the rod factor nor the mass coupling of the equations of motion",
        !/4\s*\/\s*3/.test(code) && !/\.m\s*\*\s*\w*\.l/.test(code));
    ok("does NOT type in a gain vector", !/K\s*=\s*\[\s*\[/.test(code));
    report("the page's own arithmetic is the drawing and one RK4 loop over the module's OWN derivative function");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE SIMULATED PLANT IS ALWAYS THE TRUE ONE -- ONLY THE DESIGN MOVES ***");
{
    // If the plant toggle also flipped the SIMULATED dynamics, the planted controller would balance a hanging
    // pendulum perfectly and the page would demonstrate nothing at all.
    ok("!! the animation steps the plant with downward = false, whatever the design is",
        /nonlinearDerivative\([\s\S]*?PARAMS,\s*false\)/.test(code),
        "the toggle must move the DESIGN model only; simulating the design would make the plant vacuously right");
    ok("...and the design model is what the toggle moves", /linearize\(PARAMS,\s*planted\)/.test(code));
    ok("...and the page also reports the design's stability on the TRUE plant, not only on its own",
        /linearize\(PARAMS,\s*false\)/.test(code) && /TRUE upright plant/.test(src));
    // *** THE SUBSTEP COUNT MUST TRACK THE GAIN, AND THIS PAGE SHIPPED WITHOUT IT ONCE. *** At a fixed 4
    // substeps the pole fell at t = 0.02 s at kappa = 100 -- not because the loop is unstable there (it is not,
    // and that is the guarantee the page exists to show) but because one closed-loop pole runs off linearly in
    // kappa and left RK4's stability region. An explicit method's limit wearing the costume of the system's.
    ok("!! the integrator substeps scale with the gain multiple", /subFor\s*=\s*\(kappa\)/.test(code) &&
        /Math\.ceil\(\s*\d+\s*\*\s*kappa\s*\)/.test(code),
        "a fixed substep count makes the page's own integrator fail where the CONTROLLER does not");
    ok("...and the page shows the count rather than hiding the cost", /substeps\/frame/.test(code));
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
            const fp = path.join(ENG, decodeURIComponent(u.pathname));
            if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
                const ext = path.extname(fp);
                const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : "text/plain";
                return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(fp) });
            }
            return route.fulfill({ status: 404, body: "not found" });
        });
        await pg.setViewportSize({ width: 1280, height: 860 });
        await pg.goto("http://localhost:8787/cartpole.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(1500);

        const read = () => pg.evaluate(() => ({
            verdict: document.getElementById("verdict").textContent.trim(),
            kal: document.getElementById("kal").textContent, res: document.getElementById("res").textContent,
            gm: document.getElementById("gm").textContent, kv: document.getElementById("kv").textContent,
            design: document.getElementById("design").textContent,
            cw: document.getElementById("stage").clientWidth, bw: document.getElementById("stage").width,
        }));
        const setK = (v) => pg.evaluate((val) => {
            const el = document.getElementById("k"); el.value = String(val); el.dispatchEvent(new Event("input"));
        }, v);
        const reset = () => pg.click("#reset");

        const r0 = await read();
        ok("!! the page loads with no script error", errs.length === 0, errs.join(" | "));
        ok("...and the canvas really fills its box, not the intrinsic 300x150", r0.cw > 500 && r0.bw > 500,
            `${r0.cw}/${r0.bw}`);
        ok("!! it is BALANCED at the default gain", /BALANCED/.test(r0.verdict), r0.verdict);

        // the module's own numbers, on screen
        const { A, B } = linearize(PARAMS, false);
        const g = lqrGain(A, B, [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 10, 0], [0, 0, 0, 1]], [[0.1]], { dt: 5e-3 });
        ok("!! the ARE residual on screen is the module's", parseFloat(r0.res) < 1e-8, r0.res);
        ok("!! the Kalman minimum on screen is at or above 1", parseFloat(r0.kal) >= 1, r0.kal);
        const gm = gainMarginLower(A, B, g.K);
        ok("!! ...and the lower gain margin on screen matches the module's bisection",
            Math.abs(parseFloat(r0.gm) - gm) < 1e-3, `screen ${r0.gm} module ${gm.toFixed(6)}`);

        // ---- 5. THE GUARANTEE, WOUND BOTH WAYS ---------------------------------------------------------
        console.log("\n5. *** WIND THE GAIN UP AND IT HOLDS; WIND IT DOWN AND IT FALLS ***");
        await setK(200); await reset(); await pg.waitForTimeout(2500);      // 10^((200-100)/50) = 100x
        const hi = await read();
        ok("!! *** AT A HUNDRED TIMES THE OPTIMAL GAIN THE POLE IS STILL UP ***", /BALANCED/.test(hi.verdict),
            `kappa on screen = ${hi.kv} -- ${hi.verdict}`);
        report("that is the infinite gain margin, live: |1+L| >= 1 keeps the Nyquist plot out of the unit disc " +
               "around -1, so no amount of extra gain can destabilise the loop");

        await setK(0); await reset(); await pg.waitForTimeout(3000);        // 10^(-2) = 0.01x, far below the margin
        const lo = await read();
        ok("!! ...and far BELOW the margin it falls, so the page is really integrating rather than posing",
            /FELL/.test(lo.verdict), `kappa on screen = ${lo.kv} -- ${lo.verdict}`);

        await setK(100); await reset(); await pg.waitForTimeout(1200);
        ok("...and returning to the optimal gain recovers -- the failure is not sticky",
            /BALANCED/.test((await read()).verdict));

        // ---- 6. THE CHECK THE DEVICE EXISTS FOR --------------------------------------------------------
        console.log("\n6. *** THE PLANTED CONTROLLER'S OWN NUMBERS STAY FINE WHILE THE POLE FALLS ***");
        await pg.click("#plant"); await pg.waitForTimeout(3000);
        const p = await read();
        ok("!! the planted design still reports a small ARE residual", parseFloat(p.res) < 1e-8, p.res);
        ok("!! ...still satisfies the Kalman inequality on its own loop", parseFloat(p.kal) >= 1, p.kal);
        ok("!! ...and still reports itself STABLE ON ITS OWN MODEL", /OWN model: yes/.test(p.design),
            p.design.replace(/\s+/g, " ").slice(0, 150));
        ok("!! *** while the same panel says NO to the TRUE upright plant ***",
            /TRUE upright plant: NO/.test(p.design));
        ok("!! *** AND THE POLE HAS FALLEN OVER ***", /FELL/.test(p.verdict), p.verdict);
        report("every number the controller can compute about itself is fine. Self-consistency grades the " +
               "model you brought, not the one you are standing in front of");

        await pg.click("#plant"); await pg.waitForTimeout(1500);
        ok("...and switching back to the upright design balances again", /BALANCED/.test((await read()).verdict));

        await ctx.close();
        await b.close();
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
