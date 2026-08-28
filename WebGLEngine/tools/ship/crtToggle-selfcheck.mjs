// WebGLEngine/tools/ship/crtToggle-selfcheck.mjs -- v4121
//
// Run: node tools/ship/crtToggle-selfcheck.mjs   (~5s; the live half needs real Chromium)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/crtToggle.js and its three call sites -- the CRT on the ES/EV pages.
//
// *** THE TWO THINGS WORTH POLICING HERE ARE "ONE COPY" AND "IT ACTUALLY SAMPLED SOMETHING". ***
// The CRT now appears on five surfaces (pipboy-models, fallout, and these three). The first two needed bespoke
// plumbing; these three do not differ from each other at all, so a fourth and fifth hand-rolled overlay would
// be the second-copy defect. And a CRT overlay that reads BLACK looks exactly like a dark scene -- which is
// not hypothetical: probing ev.html before preserveDrawingBuffer measured 0 lit pixels and briefly looked like
// an empty page rather than an unreadable buffer.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { codeOnly, noComments } from "./sourceScan.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { PRESET_NAMES } from "../../ui/crtToggle.js";
import { PRESETS } from "../../render/crtModel.js";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("crtToggle-selfcheck -- one toggle, three pages, and proof it sampled something\n");

const PAGES = ["es-away-mission.html", "es-hull-combat.html", "ev.html"];
const EV_GL = ["ev/systemView.js", "ev/flightView.js", "ev/galaxyMap.js", "ev/esShipLabels.js"];

// ---- 1. ONE IMPLEMENTATION ----------------------------------------------------------------------------------
{
    console.log("1. ONE TOGGLE, NOT THREE");
    for (const p of PAGES) {
        const raw = fs.readFileSync(path.join(ENG, p), "utf8");
        const js = codeOnly([...raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n"));
        ok("   [haystack] " + p + " script is real text", js.length > 200);
        ok("!! " + p + " imports the shared toggle", /crtToggle\.js/.test(noComments(raw)));
        ok("   ...and does NOT build its own pass or overlay",
            !/makeCrtPass/.test(js) && !/pointer-events:none/.test(js),
            "the button, overlay, resize handling and rAF loop belong in one place");
    }
    ok("!! the presets it offers all exist in crtModel", PRESET_NAMES.every((n) => PRESETS[n]), PRESET_NAMES.join(", "));
    const tog = fs.readFileSync(path.join(ENG, "ui", "crtToggle.js"), "utf8");
    ok("!! *** the default preset is the LOW-CURVATURE one, and the file says why ***",
        /preset \|\| "trinitron"/.test(tog) && /lies to your mouse/.test(tog),
        "the overlay is pointer-events:none so input still reaches the game, but barrel distortion moves what " +
        "you see away from what you click. trinitron is 0.04 curvature against arcade's 0.18");
    ok("!! ...and the un-remapped click is admitted rather than hidden",
        /is not done here/.test(tog));
    ok("!! it hides the source canvas when on",
        /visibility = on \? "hidden"/.test(tog),
        "an opaque curved copy over a live uncurved one shows the original as a bright rim around the edges");
}

// ---- 2. *** THE FLAG THAT MAKES ev.html READABLE AT ALL *** --------------------------------------------------
{
    console.log("\n2. *** preserveDrawingBuffer -- WITHOUT IT A WebGL READ IS BLACK ***");
    for (const f of EV_GL) {
        const s = fs.readFileSync(path.join(ENG, f), "utf8");
        ok("!! " + f + " asks for preserveDrawingBuffer", /preserveDrawingBuffer:\s*true/.test(s));
        ok("   ...and states the MEASURED cost rather than calling it free",
            /26\.99/.test(s) && /28\.90/.test(s) && /SOFTWARE/.test(s),
            "90 frames at 1000x588: 26.99 ms with the flag vs 28.90 ms without -- inside the noise, on a " +
            "software rasteriser, which is NOT proof about a real GPU and says so");
    }
}

// ---- 3. *** LIVE: MOUNT IT, AND PROVE THE OVERLAY IS NOT BLACK *** -------------------------------------------
console.log("\n3. *** A CRT OVERLAY THAT READS BLACK LOOKS EXACTLY LIKE A DARK SCENE ***");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** A SKIP, NOT A PASS: source cannot show whether a canvas read returned pixels.");
    } else {
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
        const pg = await (await b.newContext()).newPage();
        const errs = []; pg.on("pageerror", (e) => errs.push(String(e.message)));
        await pg.route("**/*", (route) => {
            const u = new URL(route.request().url());
            const p = path.join(ENG, decodeURIComponent(u.pathname));
            if (u.host === "localhost:8801" && fs.existsSync(p) && fs.statSync(p).isFile()) {
                const e = path.extname(p);
                return route.fulfill({ status: 200, body: fs.readFileSync(p),
                    contentType: /\.(js|mjs)$/.test(p) ? "text/javascript" : e === ".html" ? "text/html"
                               : e === ".json" ? "application/json" : "application/octet-stream" });
            }
            if (u.host === "localhost:8801") return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><meta charset=utf8><body>" });
            return route.fulfill({ status: 404, body: "nf" });
        });
        await pg.goto("http://localhost:8801/", { waitUntil: "load" });

        const r = await pg.evaluate(async () => {
            const m = await import("/ui/crtToggle.js");
            const cv = document.createElement("canvas"); cv.width = 240; cv.height = 160;
            const c = cv.getContext("2d");
            c.fillStyle = "#0a1a10"; c.fillRect(0, 0, 240, 160);
            c.fillStyle = "#6fe39a"; c.fillRect(20, 20, 200, 120);
            document.body.appendChild(cv);
            const h = m.mountCrtToggle(cv, { preset: "arcade", storageKey: "gate.test" });
            const out = { mounted: !!h, onByDefault: h.isOn() };
            h.set(true);
            await new Promise((r) => setTimeout(r, 400));
            const ov = [...document.querySelectorAll("canvas")].find((x) => x !== cv && x.style.pointerEvents === "none");
            out.overlay = !!ov;
            out.pointerEventsNone = ov ? ov.style.pointerEvents === "none" : false;
            out.sourceHidden = cv.style.visibility === "hidden";
            if (ov && ov.width) {
                const d = ov.getContext("2d").getImageData(0, 0, ov.width, ov.height).data;
                let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 50) lit++;
                out.lit = lit; out.total = d.length / 4;
            }
            h.set(false);
            out.sourceRestored = cv.style.visibility !== "hidden";
            h.dispose();
            out.cleanedUp = !document.body.contains(ov);
            return out;
        });
        ok("!! the toggle mounts", r.mounted === true);
        ok("!! it is OFF until asked", r.onByDefault === false,
            "every CRT surface in this tree defaults off; the effect is a choice, not a theme");
        ok("!! *** turning it on produces a NON-BLACK overlay (" + r.lit + " of " + r.total + " lit) ***",
            r.lit > r.total * 0.1,
            "a sampled-but-empty buffer and a genuinely dark scene look identical, so this counts pixels");
        ok("!! the overlay does not eat input", r.pointerEventsNone === true,
            "these are games; the effect must not make them unplayable");
        ok("!! the source is hidden while on, and restored after", r.sourceHidden === true && r.sourceRestored === true);
        ok("!! dispose() removes the overlay", r.cleanedUp === true);

        // ---- ev.html: the flag on the LIVE context, and output tracking source -------------------
        await pg.goto("http://localhost:8801/ev.html", { waitUntil: "load" }).catch(() => {});
        await pg.waitForTimeout(1800);
        const ev = await pg.evaluate(() => {
            const cv = document.getElementById("systemCv");
            if (!cv) return { err: "no systemCv" };
            const gl = cv.getContext("webgl2");
            const a = gl ? gl.getContextAttributes() : null;
            const px = new Uint8Array(cv.width * cv.height * 4);
            gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
            let lit = 0, maxv = 0;
            for (let i = 0; i < px.length; i += 4) { const s = px[i]+px[i+1]+px[i+2]; if (s > 50) lit++; if (s > maxv) maxv = s; }
            return { pdb: !!(a && a.preserveDrawingBuffer), lit, total: px.length / 4, maxv };
        });
        ok("!! *** preserveDrawingBuffer is ACTIVE on ev.html's LIVE context ***", ev.pdb === true,
            "asserted against getContextAttributes() rather than against the source that requests it -- the " +
            "browser is free to refuse an attribute, and reading the file back would not notice");
        ok("!! ...and the buffer is genuinely readable, with bright pixels in it",
            ev.lit > 0 && ev.maxv > 300,
            "the EV system view is mostly black space -- " + (100*ev.lit/ev.total).toFixed(2) + "% lit with a " +
            "peak of " + ev.maxv + "/765 -- so a low fraction here is the SCENE, not a failed read. That " +
            "distinction is the whole reason peak brightness is checked too");
        ok("!! no script error on any of it", errs.length === 0, errs.join(" | "));
        await b.close();
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
