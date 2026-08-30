// WebGLEngine/tools/ship/domToTexture-selfcheck.mjs -- v4120
//
// Run: node tools/ship/domToTexture-selfcheck.mjs   (~4s; most of it needs real Chromium)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/domToTexture.js and fallout.html's CRT mode -- rasterising a live DOM subtree so a shader can have it.
//
// *** EVERY FAILURE MODE HERE PRODUCES A PICTURE, NOT AN ERROR, WHICH IS WHY IT IS GATED THIS HARD. ***
// Miss the XHTML namespace and you get a blank rectangle. Rasterise while the page is hidden and you get a
// blank rectangle. Put a <canvas> in the subtree and you get a hole where its bitmap should be. Taint the
// canvas and the WebGL upload throws somewhere else entirely. None of those announce themselves, and a dark
// green Pip-Boy dash on a black background is exactly the kind of page where "mostly black" looks plausible.
//
// *** SECTION 3 IS A REGRESSION GUARD FOR A BUG THAT WAS ACTUALLY SHIPPED INTO THE BROWSER. *** fallout.html's
// first CRT mode hid the page with a class and then rasterised it, capturing the HIDDEN page: the CRT view
// came out black except its own toggle button. It was found by LOOKING at the render, not by any check, and
// this is the check that would have found it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { REFUSED, MEASURED, buildSvg } from "../../ui/domToTexture.js";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("domToTexture-selfcheck -- every failure here is a picture, not an error\n");

// ---- 1. THE SVG WRAPPER: TWO THINGS THAT SILENTLY PRODUCE NOTHING --------------------------------------------
{
    console.log("1. THE WRAPPER");
    const svg = buildSvg("<p>hi</p>", { width: 100, height: 50, css: "p{color:red}" });
    ok("!! *** the inner div carries the XHTML namespace ***", /xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/.test(svg),
        "without it the content is parsed as SVG rather than XHTML and NOTHING renders -- silently, as an " +
        "empty rectangle, with no error anywhere");
    ok("!! ...and there is a viewBox, so the source layout is mapped onto the target size",
        /viewBox="0 0 100 50"/.test(svg),
        "a missing viewBox crops instead of scaling, which looks like a layout bug in the page");
    ok("page CSS is carried in", /<style>p\{color:red\}<\/style>/.test(svg),
        "external stylesheets are not followed by the SVG loader, so a subtree styled from a .css file " +
        "rasterises UNSTYLED rather than failing");
    const s2 = buildSvg("<p>x</p>", { width: 64, height: 32, srcWidth: 800, srcHeight: 400 });
    ok("a differing source size becomes the viewBox", /viewBox="0 0 800 400"/.test(s2) && /width="64"/.test(s2));
}

// ---- 2. THE REFUSALS CARRY THEIR EVIDENCE -------------------------------------------------------------------
{
    console.log("\n2. WHAT IT CANNOT DRAW");
    ok("refusals are structured", REFUSED.length >= 4 && REFUSED.every((r) => r.what && r.why && r.workaround));
    const cv = REFUSED.find((r) => /canvas/.test(r.what));
    ok("!! *** the <canvas> refusal carries the MEASUREMENT, not just an assertion ***",
        !!cv && /MEASURED/.test(cv.why) && /ZERO magenta/.test(cv.why),
        "a solid magenta canvas inside the subtree rasterised to zero magenta pixels while text and gradients " +
        "in the SAME subtree came through -- which is how you tell a limitation from a broken rasteriser");
    ok("!! cross-origin content is refused, and the reason ties back to tainting",
        REFUSED.some((r) => /cross-origin/.test(r.what) && /taint/.test(r.why)),
        "anything fetched cross-origin would taint the canvas, which breaks the WebGL upload this exists for");
    ok("!! the measured cost is recorded with its resolution", MEASURED.serialiseMs > 0 && /512x320/.test(MEASURED.where));
    ok("!! ...and says out loud that it is NOT a 60 Hz technique",
        /NOT cheap enough/.test(MEASURED.note),
        "12 ms a frame is fine for a dashboard and hopeless for an animation; a caller has to be told which");
    ok("!! tainting was measured as FALSE, which is the fact the whole approach rests on",
        MEASURED.tainted === false && MEASURED.webglUploadOk === true);
}

// ---- 3. *** THE BROWSER: INCLUDING THE BUG THAT SHIPPED BLACK *** --------------------------------------------
console.log("\n3. *** RASTERISING FOR REAL -- AND THE HIDDEN-STATE TRAP ***");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** A SKIP, NOT A PASS: sections 1-2 read strings. Whether a DOM actually rasterises, and");
        report("    whether the result is tainted, cannot be known from source at all.");
    } else {
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await (await b.newContext()).newPage();
        const errs = []; pg.on("pageerror", (e) => errs.push(String(e.message)));
        await pg.route("**/*", (route) => {
            const u = new URL(route.request().url());
            const p = path.join(ENG, decodeURIComponent(u.pathname));
            if (u.host === "localhost:8794" && u.pathname === "/fallout/state") {
                return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
                    connected: true, ready: true, host: "GATE",
                    player: { PlayerName: "Vault Dweller", CurrHP: 174, MaxHP: 185, CurrAP: 74, MaxAP: 90,
                              Level: 19, XPProgressPct: 0.62 }, status: {} }) });
            }
            if (u.host === "localhost:8794" && fs.existsSync(p) && fs.statSync(p).isFile()) {
                return route.fulfill({ status: 200, body: fs.readFileSync(p),
                    contentType: /\.(js|mjs)$/.test(p) ? "text/javascript" : "text/html" });
            }
            if (u.host === "localhost:8794") return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><meta charset=utf8><body>" });
            return route.fulfill({ status: 404, body: "nf" });
        });
        await pg.goto("http://localhost:8794/", { waitUntil: "load" });

        const r = await pg.evaluate(async () => {
            const m = await import("/ui/domToTexture.js");
            const host = document.createElement("div");
            host.innerHTML = `<div id="subj" style="width:300px;height:150px;background:#04140b;color:#2bff88;font:16px monospace">
                <div>PIP-BOY TEXT</div><div id="drop" style="width:80px;height:30px;background:#2bff88"></div></div>`;
            document.body.appendChild(host);
            const subj = document.getElementById("subj");
            const lit = (cv) => { const d = cv.getContext("2d").getImageData(0,0,cv.width,cv.height).data;
                let n = 0; for (let i=0;i<d.length;i+=4) if (d[i]+d[i+1]+d[i+2] > 60) n++; return n; };
            const out = {};

            const plain = await m.rasterize(subj, { width: 300, height: 150 });
            out.rasterised = !!plain;
            if (!plain) return out;
            try { plain.getContext("2d").getImageData(0,0,1,1); out.tainted = false; } catch (e) { out.tainted = true; }
            out.litPlain = lit(plain);

            // WebGL upload -- what crtPass actually needs.
            try {
                const g = document.createElement("canvas").getContext("webgl2");
                const t = g.createTexture(); g.bindTexture(g.TEXTURE_2D, t);
                g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,plain);
                out.webglUpload = g.getError() === g.NO_ERROR;
            } catch (e) { out.webglUpload = false; }

            // *** THE SHIPPED BUG, REPRODUCED. *** Hide the subtree the way fallout.html's CRT mode does, then
            // rasterise without undoing it on the clone.
            const st = document.createElement("style");
            st.textContent = ".hidden-mode > * { visibility: hidden; }";
            document.head.appendChild(st);
            subj.classList.add("hidden-mode");
            const hidden = await m.rasterize(subj, { width: 300, height: 150 });
            out.litWhileHidden = hidden ? lit(hidden) : -1;
            const stripped = await m.rasterize(subj, { width: 300, height: 150, stripClasses: ["hidden-mode"] });
            out.litWithStrip = stripped ? lit(stripped) : -1;

            subj.classList.remove("hidden-mode");
            const excluded = await m.rasterize(subj, { width: 300, height: 150, exclude: "#drop" });
            out.litWithExclude = excluded ? lit(excluded) : -1;
            return out;
        });

        ok("!! a live subtree rasterises at all", r.rasterised === true);
        ok("!! *** and the result is NOT TAINTED -- the fact the whole approach rests on ***", r.tainted === false,
            "a tainted canvas can be neither read back nor uploaded as a texture");
        ok("!! ...and really does upload as a WebGL texture", r.webglUpload === true,
            "which is what render/crtPass.js needs from it");
        ok("   content actually rendered (" + r.litPlain + " lit pixels)", r.litPlain > 500);

        ok("!! *** rasterising a HIDDEN subtree captures the hidden state: " + r.litWhileHidden +
           " lit pixels vs " + r.litPlain + " ***",
            r.litWhileHidden < r.litPlain / 4,
            "this is the bug fallout.html shipped -- the class that hides the page for the viewer also hides " +
            "it from the rasteriser, and the CRT view came out black except its own button. Reproduced here " +
            "so it cannot come back quietly");
        ok("!! *** ...and stripClasses on the CLONE restores it: " + r.litWithStrip + " lit pixels ***",
            r.litWithStrip > r.litPlain * 0.8,
            "the display state and the captured state are two different things, and the clone is the right " +
            "place to reconcile them -- toggling the real DOM would flash and force a layout every frame");
        ok("!! exclude actually removes an element (" + r.litWithExclude + " vs " + r.litPlain + ")",
            r.litWithExclude < r.litPlain && r.litWithExclude > 100,
            "some content must survive, or 'exclude' would be indistinguishable from 'broke everything'");

        // ---- fallout.html end to end -----------------------------------------------------------------
        await pg.goto("http://localhost:8794/fallout.html", { waitUntil: "load" });
        await pg.waitForTimeout(700);
        await pg.click("#crtBtn");
        await pg.waitForTimeout(1400);
        const fo = await pg.evaluate(() => {
            const cv = document.querySelector("#crtLayer canvas");
            const out = { on: document.body.classList.contains("crt-shader"),
                          shown: getComputedStyle(document.getElementById("crtLayer")).display,
                          cssBefore: getComputedStyle(document.body, "::before").display,
                          hasCanvas: !!cv, lit: 0 };
            if (cv) {
                const g = cv.getContext("webgl2");
                const px = new Uint8Array(cv.width * cv.height * 4);
                g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, px);
                for (let i = 0; i < px.length; i += 4) if (px[i] + px[i+1] + px[i+2] > 60) out.lit++;
                out.total = cv.width * cv.height;
            }
            return out;
        });
        ok("!! fallout.html's CRT toggle turns on and mounts a canvas", fo.on && fo.shown === "block" && fo.hasCanvas);
        ok("!! *** the CSS scanlines are suppressed when the SHADER ones are on ***", fo.cssBefore === "none",
            "body::before draws gradient scanlines that the rasteriser captures INTO the texture; the shader " +
            "then adds its own at a different pitch, and two grids at different periods is a moire pattern " +
            "that reads as a broken shader rather than as two effects");
        ok("!! *** and the CRT surface is NOT BLACK -- " + fo.lit + " lit pixels of " + fo.total + " ***",
            fo.lit > fo.total * 0.02,
            "the exact symptom of the shipped bug was a black surface, so this is the end-to-end guard");
        ok("!! no script error anywhere in the path", errs.length === 0, errs.join(" | "));
        await b.close();
    }
}

// ---- 4. THE PAGE USES THE MODULE RATHER THAN ITS OWN COPY ---------------------------------------------------
{
    console.log("\n4. ONE RASTERISER");
    const raw = fs.readFileSync(path.join(ENG, "fallout.html"), "utf8");
    const js = codeOnly([...raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n"));
    ok("   [haystack] fallout.html's script is real text (" + js.length + " chars)", js.length > 500);
    ok("!! it imports the shared rasteriser and the shared CRT pass",
        /domToTexture\.js/.test(noComments(raw)) && /crtPass\.js/.test(noComments(raw)));
    ok("!! ...and does NOT hand-roll a second foreignObject", !/foreignObject/.test(js),
        "a second copy of this would drift from the one that is gated");
    ok("!! ...and passes stripClasses, which is the fix for the black screen",
        /stripClasses/.test(js));
    ok("!! the timer is not requestAnimationFrame", /setInterval/.test(js) && !/requestAnimationFrame/.test(js),
        "rasterising a whole page measured ~12 ms; at 60 Hz that is most of a frame budget spent redrawing a " +
        "dashboard whose data changes every 1.5 s");
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
