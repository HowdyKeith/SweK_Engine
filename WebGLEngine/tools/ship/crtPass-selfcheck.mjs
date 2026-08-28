// WebGLEngine/tools/ship/crtPass-selfcheck.mjs -- v4119
//
// Run: node tools/ship/crtPass-selfcheck.mjs   (~4s; the shader half needs real Chromium)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES render/crtModel.js + render/crtPass.js -- the CRT filter Keith parked in August.
//
// *** A CRT FILTER IS THE ARCHETYPE OF A THING THAT CAN ONLY BE LOOKED AT, SO IT IS WRITTEN TWICE AND
// COMPARED. *** Section 4 renders a known image through the REAL GPU pass in a real browser and through the
// CPU model in this process, and requires them to agree to within one 8-bit level. That is qa-suite's
// "wormhole+nebula shadow bit-identical to CPU" pattern applied to a post-process: it turns "does it look
// like a CRT" into "do two independent implementations of the same optics produce the same pixels".
//
// *** AND EVERY PARAMETER IS A MEASUREMENT, NOT A TASTE KNOB. *** Sections 2 and 3 count the scanlines that
// actually appear, measure the barrel displacement in pixels, count the phosphor pitch, and check the vignette
// never brightens. A shader whose `scanlines: 240` produced 239 or 480 bands would pass any eyeball.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { DEFAULTS, PRESETS, barrel, scanline, mask, vignette, crtImage } from "../../render/crtModel.js";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("crtPass-selfcheck -- two implementations of the same optics, compared\n");

// ---- 1. LICENCE PROVENANCE, BECAUSE FOUR REPOS WERE ON THE TABLE ---------------------------------------------
{
    console.log("1. WHOSE CODE THIS IS");
    const src = fs.readFileSync(path.join(ENG, "render", "crtModel.js"), "utf8");
    ok("!! *** the repo with NO LICENSE FILE is named as unusable, not quietly skipped ***",
        /bisqwit\/crt-filter/.test(src) && /NO LICENSE FILE/.test(src),
        "three of the four candidates are MIT and one has no licence at all, which makes it " +
        "all-rights-reserved. Recording WHICH and WHY is what stops it being reconsidered next year");
    ok("   ...and the MIT ones are named as read rather than ignored",
        /gingerbeardman/.test(src) && /stefanlegg/.test(src) && /Ichiaka/.test(src));
    ok("!! ...and the reason for writing rather than lifting is the GATE, not licence-avoidance",
        /can be graded/i.test(src) || /can only ever be looked at/i.test(src));
}

// ---- 2. *** THE PARAMETERS ARE MEASUREMENTS: COUNT WHAT ACTUALLY APPEARS *** ---------------------------------
{
    console.log("\n2. *** `scanlines: 240` MUST PRODUCE 240 BANDS, NOT 239 AND NOT 480 ***");
    const w = 8, h = 480;
    const white = new Uint8ClampedArray(w * h * 4).fill(255);
    const flat = { ...PRESETS.off, scanlines: 240, scanDepth: 0.6, gain: 1 };
    const img = crtImage(white, w, h, flat);
    // Count local minima down a column: one per scanline period.
    const col = [];
    for (let y = 0; y < h; y++) col.push(img[(y * w + 2) * 4 + 1]);
    let troughs = 0;
    for (let y = 1; y < h - 1; y++) if (col[y] <= col[y - 1] && col[y] < col[y + 1]) troughs++;
    ok("!! *** " + troughs + " dark bands over " + h + " rows for scanlines=240 ***",
        Math.abs(troughs - 240) <= 1,
        "the parameter is a LINE COUNT, so this is a direct check of it. An off-by-one in the phase would " +
        "double or halve this and no eye would notice");
    ok("   ...and the bands genuinely modulate", Math.max(...col) - Math.min(...col) > 40,
        "range " + Math.min(...col) + ".." + Math.max(...col));

    console.log("   -- barrel displacement, in pixels --");
    ok("!! the centre of the screen does NOT move", (() => {
        const b = barrel(0.5, 0.5, 0.3); return Math.abs(b[0] - 0.5) < 1e-12 && Math.abs(b[1] - 0.5) < 1e-12;
    })(), "curvature is radial, so r=0 is a fixed point -- if the centre drifts the whole image is offset");
    const edge = barrel(0.999, 0.5, 0.12);
    ok("!! ...and a point near the edge samples from OUTSIDE the tube, giving black",
        edge === null,
        "with k=0.12 the corner mapping runs past the source, and that must be a HARD EDGE. Clamping instead " +
        "smears the border pixel outward, which reads as a stretched image rather than as glass");
    const mid = barrel(0.75, 0.5, 0.12);
    ok("   a mid-radius point is pushed outward by a measurable amount",
        mid && mid[0] > 0.75, "u 0.750 -> " + mid[0].toFixed(4));
    ok("!! curvature 0 is EXACTLY the identity", (() => {
        const b = barrel(0.3, 0.7, 0); return b[0] === 0.3 && b[1] === 0.7;
    })(), "so `off` is a real bypass and not a nearly-bypass");

    console.log("   -- phosphor pitch --");
    const m0 = mask(0, 3, 0.3), m1 = mask(1, 3, 0.3), m2 = mask(2, 3, 0.3), m3 = mask(3, 3, 0.3);
    ok("!! the mask repeats with the stated pitch", JSON.stringify(m0) === JSON.stringify(m3),
        "pixel 0 and pixel 3 must be the same stripe for pitch 3");
    ok("!! ...and each column boosts a DIFFERENT channel", m0[0] > m0[1] && m1[1] > m1[0] && m2[2] > m2[0],
        "R, G, B in turn -- a mask that boosted the same channel every column is a tint, not a mask");
    ok("!! ...and it conserves light: the three weights average 1",
        Math.abs((m0[0] + m0[1] + m0[2]) / 3 - 1) < 1e-12,
        "otherwise the mask silently changes overall brightness and `gain` is compensating for a bug");

    console.log("   -- vignette --");
    let mono = true, prev = vignette(0.5, 0.5, 0.5);
    for (let i = 1; i <= 50; i++) { const v = vignette(0.5 + i / 100, 0.5, 0.5); if (v > prev + 1e-12) mono = false; prev = v; }
    ok("!! the vignette never brightens as radius grows", mono);
    ok("   ...and is exactly 1 at the centre", vignette(0.5, 0.5, 0.9) === 1);
}

// ---- 3. THE PRESETS ARE WELL-FORMED, AND `off` IS A TRUE IDENTITY --------------------------------------------
{
    console.log("\n3. PRESETS");
    for (const [n, p] of Object.entries(PRESETS)) {
        ok("   " + n.padEnd(10) + " has every field",
            Object.keys(DEFAULTS).every((k) => p[k] !== undefined) && Array.isArray(p.tint));
    }
    const w = 32, h = 32;
    const src = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { src[i * 4] = i % 256; src[i * 4 + 1] = 200; src[i * 4 + 2] = 60; src[i * 4 + 3] = 255; }
    const out = crtImage(src, w, h, PRESETS.off);
    let identical = true;
    for (let i = 0; i < src.length; i += 4) if (out[i] !== src[i] || out[i + 1] !== src[i + 1] || out[i + 2] !== src[i + 2]) identical = false;
    ok("!! *** PRESETS.off is a BYTE-EXACT passthrough ***", identical,
        "the page A/Bs with this, so 'off' has to mean off. A preset that dimmed by one level would make " +
        "every comparison against it slightly wrong");
}

// ---- 4. *** THE SHADER, AGAINST THE CPU MODEL, IN A REAL BROWSER *** -----------------------------------------
console.log("\n4. *** GPU vs CPU: TWO IMPLEMENTATIONS, ONE ANSWER ***");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** A SKIP, NOT A PASS: sections 1-3 only ever exercised the CPU model. Without this the GLSL");
        report("    is UNTESTED, and it is the half that actually ships to the screen.");
    } else {
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await (await b.newContext()).newPage();
        const errs = []; pg.on("pageerror", (e) => errs.push(String(e.message)));
        await pg.route("**/*", (route) => {
            const u = new URL(route.request().url());
            const p = path.join(ENG, decodeURIComponent(u.pathname));
            if (u.host === "localhost:8790" && fs.existsSync(p) && fs.statSync(p).isFile()) {
                return route.fulfill({ status: 200, body: fs.readFileSync(p),
                    contentType: /\.(js|mjs)$/.test(p) ? "text/javascript" : "text/html" });
            }
            if (u.host === "localhost:8790") return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><meta charset=utf8>" });
            return route.fulfill({ status: 404, body: "nf" });
        });
        await pg.goto("http://localhost:8790/", { waitUntil: "load" });

        const W = 96, H = 96;
        // A deliberately BUSY source: gradients in every channel plus hard edges, so a bleed or sampling
        // mismatch has somewhere to show up. A flat field would agree even with the taps wired wrong.
        const src = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const edge = (x >= 40 && x < 44) || (y >= 60 && y < 62) ? 255 : 0;
            src.push(Math.max(edge, (x * 255 / W) | 0), Math.max(edge, (y * 255 / H) | 0),
                     Math.max(edge, ((x + y) * 127 / W) | 0), 255);
        }
        const srcArr = new Uint8ClampedArray(src);

        for (const preset of ["pipboy", "arcade", "trinitron"]) {
            const gpu = await pg.evaluate(async ({ W, H, src, preset }) => {
                const m = await import("/render/crtPass.js");
                const pass = m.makeCrtPass(W, H);
                if (!pass) return { err: "no webgl2" };
                pass.render(new Uint8Array(src), m.PRESETS[preset]);
                return { px: Array.from(pass.readPixels()) };
            }, { W, H, src, preset });
            if (gpu.err) { ok("!! GPU pass available", false, gpu.err); break; }

            const cpu = crtImage(srcArr, W, H, PRESETS[preset]);
            let worst = 0, worstAt = -1, over1 = 0;
            for (let i = 0; i < cpu.length; i++) {
                if (i % 4 === 3) continue;
                const d = Math.abs(cpu[i] - gpu.px[i]);
                if (d > worst) { worst = d; worstAt = i; }
                if (d > 1) over1++;
            }
            ok("!! *** " + preset + ": GPU matches the CPU answer key (worst " + worst + "/255, " +
               over1 + " samples off by >1) ***",
                worst <= 1,
                worst <= 1 ? "two independent implementations of the same optics, agreeing to one 8-bit level"
                           : "worst at index " + worstAt + " -- cpu " + cpu[worstAt] + " gpu " + gpu.px[worstAt] +
                             ". A flip, a sampling filter or a reordered operation are the usual causes");
        }

        // And `off` must be a passthrough on the GPU too, not merely on the CPU.
        const offRes = await pg.evaluate(async ({ W, H, src }) => {
            const m = await import("/render/crtPass.js");
            const pass = m.makeCrtPass(W, H);
            pass.render(new Uint8Array(src), m.PRESETS.off);
            return Array.from(pass.readPixels());
        }, { W, H, src });
        let offWorst = 0;
        for (let i = 0; i < srcArr.length; i++) { if (i % 4 === 3) continue; offWorst = Math.max(offWorst, Math.abs(srcArr[i] - offRes[i])); }
        ok("!! *** PRESETS.off is a passthrough THROUGH THE SHADER too (worst " + offWorst + "/255) ***",
            offWorst <= 1,
            "this is the check that would catch a stray gamma, a colour-space conversion, or a premultiplied " +
            "alpha step sneaking into the pass -- none of which any preset comparison would reveal");
        ok("!! no script error in the pass", errs.length === 0, errs.join(" | "));
        await b.close();
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
