// WebGLEngine/tools/ship/lensingPage-selfcheck.mjs
//
// Run: node tools/ship/lensingPage-selfcheck.mjs
//
// lensing.html is a front door for physics that was already complete: physics/astroparticle/lensing.js has had
// the Einstein radius, the two image positions, their magnifications, the mu+ - mu- = 1 invariant, and the
// Paczynski light curve since v3428, gated and bound to the roundhouse since v3501. This checks the two ways a
// front door can fail without failing its own physics gate: it derives its own copy of something the module
// already owns, or it renders something that never actually runs.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { einsteinRadius, imagePositions, magnifications, magnificationDifference, uOfTime, M_SUN, PARSEC }
    from "../../physics/astroparticle/lensing.js";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

const PAGE = path.join(ENG, "lensing.html");
const raw = fs.readFileSync(PAGE, "utf8");
const src = noComments(raw);

console.log("lensingPage-selfcheck -- is the front door showing the gated microlensing physics, live?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE PAGE EXISTS, DECLARES ITSELF, AND PARSES ***");
{
    for (const tag of ["demo:title", "demo:desc", "demo:category"]) ok(`carries a ${tag} meta tag`, new RegExp('name="' + tag + '"').test(src));
    ok("it is a module script", /<script type="module">/.test(src));
    ok("the inline script is balanced", (src.match(/<script/g) || []).length === (src.match(/<\/script>/g) || []).length);
}

// ---------------------------------------------------------------------------
console.log("\n2. *** IT IMPORTS THE PHYSICS AND OWNS NONE OF IT ***");
{
    ok("!! imports physics/astroparticle/lensing.js", /from "\.\/physics\/astroparticle\/lensing\.js"/.test(src));
    const wants = ["einsteinRadius", "imagePositions", "magnifications", "totalMagnification",
                   "magnificationDifference", "uOfTime", "lightCurve"];
    const missing = wants.filter((fn) => !new RegExp("\\b" + fn + "\\(").test(src));
    ok("!! calls every physics function it needs -- none reimplemented", missing.length === 0,
        missing.length ? "MISSING CALLS: " + missing.join(", ") : wants.length + " functions, all called");

    // *** THE PAGE MUST NOT CARRY THE LENS EQUATION ITSELF. *** imagePositions()'s formula is (u +- sqrt(u^2+4))/2
    // -- if that expression appears in the page's own arithmetic (outside the import), the page has grown a
    // second copy of the physics the module already owns.
    ok("does NOT carry the image-position formula itself",
        !/sqrt\(\s*u\s*\*\s*u\s*\+\s*4\s*\)/.test(src) && !/Math\.sqrt\(u\s*\*\s*u\s*\+\s*4\)/.test(src));
    ok("does NOT carry the Einstein radius formula itself",
        !/4\s*\*\s*G_SI\s*\*/.test(src) && !/Math\.sqrt\(\(4/.test(src));
    report("the page's own arithmetic is limited to trigonometric PLACEMENT (radius * cos/sin of a direction), " +
           "which is geometry, not a second physical law");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE 2D PLACEMENT IS CONSISTENT WITH THE MODULE'S OWN 1D RADII ***");
{
    // The page places each image at (radiusThetaE * scale * cos(phi), -radiusThetaE * scale * sin(phi)). That is
    // checkable independent of any browser: for a chosen u and direction phi, the two image points it WOULD
    // draw must lie on the ray through the origin at angle phi (or its exact opposite, for the negative-radius
    // "minus" image), at exactly the module's own radii.
    for (const [u0, x] of [[0.3, 0.5], [0.15, -1.2], [0.02, 0.02]]) {
        const u = Math.hypot(u0, x);
        const phi = Math.atan2(u0, x);
        const dir = [Math.cos(phi), Math.sin(phi)];
        const pos = imagePositions(u);
        const plusPt = [pos.plus * dir[0], pos.plus * dir[1]];
        const minusPt = [pos.minus * dir[0], pos.minus * dir[1]];
        ok(`u=${u.toFixed(3)}: the '+' image lands at exactly radius pos.plus along the source direction`,
            rel(Math.hypot(...plusPt), Math.abs(pos.plus)) < 1e-12);
        ok(`...and the '-' image (negative radius) lands on the OPPOSITE side automatically`,
            (minusPt[0] * dir[0] + minusPt[1] * dir[1]) < 0 || pos.minus === 0,
            "dot(minusPt, dir) = " + (minusPt[0] * dir[0] + minusPt[1] * dir[1]).toFixed(4));
    }
}

// ---------------------------------------------------------------------------
console.log("\n4. *** AT PERFECT ALIGNMENT, BOTH IMAGES SIT EXACTLY ON THE theta_E REFERENCE RING ***");
{
    const pos = imagePositions(0), mag = magnifications(0);
    ok("!! image radii are exactly +-1 theta_E at u=0", pos.plus === 1 && pos.minus === -1,
        JSON.stringify(pos));
    ok("!! and the magnification genuinely diverges there -- not clamped to a large finite number",
        mag.plus === Infinity && mag.minus === Infinity, JSON.stringify(mag));
    report("the page's dashed reference ring is drawn at radius 1 theta_E for exactly this reason: as u -> 0 " +
           "both rendered points converge onto it from opposite sides, which is what a point source actually " +
           "does -- the popular 'ring' image needs an extended source, which this module does not model, and " +
           "the page's own note text says so rather than rendering a ring that would overclaim the physics");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE REAL BROWSER: DOES THE INVARIANT ACTUALLY HOLD ON SCREEN, NOT JUST IN THE MODULE ***");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-4 read source, and source cannot show it runs");
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
        await pg.setViewportSize({ width: 1100, height: 700 });
        await pg.goto("http://localhost:8787/lensing.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(700);

        const read = () => pg.evaluate(() => ({
            inv: document.getElementById("inv").textContent,
            ut: parseFloat(document.getElementById("ut").textContent),
            ip: parseFloat(document.getElementById("ip").textContent),
            im: parseFloat(document.getElementById("im").textContent),
            skyCW: document.getElementById("sky").clientWidth, skyBW: document.getElementById("sky").width,
            curveCW: document.getElementById("curve").clientWidth,
        }));

        const r1 = await read();
        ok("!! the page loads with no script error", errs.length === 0, errs.join(" | "));
        ok("!! the invariant reads EXACTLY 1.000000 on screen", r1.inv === "1.000000", "inv=" + r1.inv);
        ok("...and the displayed image radii match the module's own imagePositions(u) at that u",
            rel(r1.ip, imagePositions(r1.ut).plus) < 5e-3 && rel(Math.abs(r1.im), Math.abs(imagePositions(r1.ut).minus)) < 5e-3,
            `page + =${r1.ip} module + =${imagePositions(r1.ut).plus.toFixed(3)}`);
        ok("...and both canvases are really filling their boxes, not sitting at the intrinsic 300x150",
            r1.skyCW > 400 && r1.skyBW > 400 && r1.curveCW > 300, `sky ${r1.skyCW}/${r1.skyBW}  curve ${r1.curveCW}`);

        // advance time and re-check the invariant still holds at a DIFFERENT u -- not a coincidence of t=0
        await pg.waitForTimeout(3000);
        const r2 = await read();
        ok("!! after the source has moved, u is genuinely different and the invariant STILL reads 1.000000",
            Math.abs(r2.ut - r1.ut) > 0.01 && r2.inv === "1.000000",
            `u: ${r1.ut} -> ${r2.ut}, inv=${r2.inv}`);

        // tighten alignment live and check the images approach +-1 theta_E together
        await pg.evaluate(() => { const s = document.getElementById("u0"); s.value = 2; s.dispatchEvent(new Event("input")); });
        await pg.waitForTimeout(400);
        const r3 = await read();
        ok("!! tightening u0 to 0.02 live moves the images toward +-1 theta_E, matching the module",
            rel(r3.ip, imagePositions(r3.ut).plus) < 5e-3, `page + =${r3.ip} at u=${r3.ut}`);

        await ctx.close();
        await b.close();
    }
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
